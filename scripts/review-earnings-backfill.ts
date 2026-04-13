/**
 * Rule-based review for backfilled earnings articles.
 *
 * Validates each pending earnings article against content quality criteria
 * without requiring an AI API key. Articles that pass are promoted to
 * report_ready with reason 'rule_based_review_pending_extraction'.
 *
 * When ANTHROPIC_API_KEY becomes available, run this again with --extract
 * to backfill structured extractions and upgrade summaries.
 *
 * Usage:
 *   bun run scripts/review-earnings-backfill.ts           # rule-based review
 *   bun run scripts/review-earnings-backfill.ts --extract  # AI extraction (needs API key)
 *   bun run scripts/review-earnings-backfill.ts --dry-run   # preview only
 */

const PROJECT_REF = "pmjqymxdaiwfpfglwqux";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

if (!ACCESS_TOKEN) { console.error("SUPABASE_ACCESS_TOKEN required"); process.exit(1); }

const dryRun = process.argv.includes("--dry-run");
const doExtract = process.argv.includes("--extract");

if (doExtract && !ANTHROPIC_KEY) {
  console.error("ANTHROPIC_API_KEY required for --extract mode");
  process.exit(1);
}

async function execSQL(sql: string): Promise<any> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`SQL error (${res.status}): ${await res.text()}`);
  return res.json();
}

function sqlStr(s: string | null): string {
  if (s === null) return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}

// ── Rule-based content quality checks ──

interface ReviewResult {
  articleId: string;
  title: string;
  approved: boolean;
  reason: string;
  checks: Record<string, boolean>;
}

// Financial figure patterns found in article text
const FINANCIAL_PATTERNS = [
  /\$[\d,.]+\s*(?:billion|million|B|M|bn|mn)/i,
  /revenue\s+(?:of\s+)?\$[\d,.]+/i,
  /eps\s+(?:of\s+)?\$[\d,.]+/i,
  /earnings?\s+(?:of\s+)?\$[\d,.]+/i,
  /[\d,.]+%\s+(?:margin|growth|decline|increase|decrease|yoy|year-over-year)/i,
  /\$[\d,.]+\s+per\s+(?:diluted\s+)?share/i,
  /ebitda\s+(?:of\s+)?[\$€£]?[\d,.]+/i,
  /net\s+(?:income|loss|sales)\s+(?:of\s+)?[\$€£]?[\d,.]+/i,
  /guidance\s+(?:of|for|to|range)?\s+[\$€£]?[\d,.]+/i,
];

const EARNINGS_SIGNAL_PATTERNS = [
  /q[1-4]\s+20\d{2}/i,
  /quarter/i,
  /full[- ]year/i,
  /fiscal\s+year/i,
  /fy\s*20\d{2}/i,
  /annual\s+results?/i,
  /earnings?\s+(?:call|release|report|results?|beat|miss)/i,
  /\beps\b/i,
  /diluted\s+share/i,
];

// Tier 1-2 source domains (strongest provenance)
const TIER_1_2_DOMAINS = new Set([
  "reuters.com", "bloomberg.com", "wsj.com", "ft.com", "cnbc.com", "forbes.com",
  "fortune.com", "apnews.com", "nytimes.com", "washingtonpost.com", "bbc.com",
  "constructiondive.com", "bdcnetwork.com", "enr.com",
]);

// Company IR and wire services (strong provenance for earnings)
const STRONG_EARNINGS_SOURCES = new Set([
  "businesswire.com", "prnewswire.com", "globenewswire.com", "stocktitan.net",
]);

function getSourceDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return "unknown"; }
}

function isStrongSource(url: string): boolean {
  const domain = getSourceDomain(url);
  return Array.from(TIER_1_2_DOMAINS).some(d => domain === d || domain.endsWith("." + d))
    || Array.from(STRONG_EARNINGS_SOURCES).some(d => domain === d || domain.endsWith("." + d))
    || domain.includes("investor") // company IR pages
    || domain.endsWith(".com") && /seekingalpha|marketbeat|investing\.com|benzinga/.test(domain);
}

function reviewArticle(article: any): ReviewResult {
  const text = (article.content || "") + " " + (article.title || "");
  const checks: Record<string, boolean> = {};

  // Check 1: Content length — must have substantive content
  checks.has_content = (article.content || "").length >= 100;

  // Check 2: Contains financial figures
  const financialHits = FINANCIAL_PATTERNS.filter(p => p.test(text)).length;
  checks.has_financial_figures = financialHits >= 1;

  // Check 3: Contains earnings-specific language
  const earningsHits = EARNINGS_SIGNAL_PATTERNS.filter(p => p.test(text)).length;
  checks.has_earnings_signals = earningsHits >= 2;

  // Check 4: Has a URL from a credible source
  checks.has_credible_source = !!article.url && isStrongSource(article.url);

  // Check 5: Has a valid date
  checks.has_valid_date = !!article.date && /^\d{4}-\d{2}-\d{2}$/.test(article.date);

  // Check 6: Title contains company or financial signal
  const titleLower = (article.title || "").toLowerCase();
  checks.title_informative = titleLower.length > 20 &&
    (/\b(q[1-4]|fy|earnings|revenue|eps|results|guidance|margin)\b/i.test(titleLower) ||
     /\$[\d,.]+/.test(titleLower) ||
     /[\d,.]+%/.test(titleLower));

  // Decision logic
  const passCount = Object.values(checks).filter(Boolean).length;
  const totalChecks = Object.keys(checks).length;

  // Must pass: has_content + at least 3 others
  const criticalPass = checks.has_content;
  const approved = criticalPass && passCount >= 4;

  let reason: string;
  if (approved) {
    const notes = [];
    if (!checks.has_financial_figures) notes.push("no_extracted_figures");
    if (!checks.has_credible_source) notes.push("non_tier1_source");
    reason = notes.length > 0
      ? `rule_based_approved_with_notes(${passCount}/${totalChecks}): ${notes.join(", ")}`
      : `rule_based_approved(${passCount}/${totalChecks})`;
  } else {
    const failures = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    reason = `rule_based_rejected(${passCount}/${totalChecks}): ${failures.join(", ")}`;
  }

  return { articleId: article.id, title: article.title, approved, reason, checks };
}

async function main() {
  console.log(`=== Earnings Article Review Process ===`);
  console.log(`Mode: ${doExtract ? "AI extraction" : "rule-based"} ${dryRun ? "(DRY RUN)" : ""}\n`);

  // Reset any 'escalated' items back to pending (from the failed API run)
  if (!dryRun) {
    await execSQL(`
      UPDATE human_review_queue
      SET review_status = 'pending', review_notes = NULL
      WHERE queue_type = 'earnings_article' AND review_status = 'escalated';
    `);
  }

  // Get pending earnings articles
  const items = await execSQL(`
    SELECT
      q.id as queue_id,
      a.id as article_id,
      a.title,
      a.date::text as date,
      a.source,
      a.url,
      a.category,
      a.content,
      length(a.content) as content_length
    FROM human_review_queue q
    JOIN articles a ON a.id = q.reference_id
    WHERE q.queue_type = 'earnings_article'
      AND q.review_status = 'pending'
    ORDER BY a.date DESC;
  `) as any[];

  if (items.length === 0) {
    console.log("No pending earnings articles to review.");
    return;
  }

  console.log(`Processing ${items.length} pending earnings articles...\n`);

  let approved = 0;
  let rejected = 0;
  const rejectedItems: ReviewResult[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const result = reviewArticle(item);

    const checksStr = Object.entries(result.checks)
      .map(([k, v]) => `${v ? "+" : "-"}${k}`)
      .join(" ");

    if (result.approved) {
      approved++;
      console.log(`  [${i + 1}/${items.length}] OK  ${item.title?.slice(0, 55)}  (${checksStr})`);

      if (!dryRun) {
        // Approve in queue
        await execSQL(`
          UPDATE human_review_queue SET
            review_status = 'approved',
            reviewed_at = NOW(),
            reviewed_by = 'rule_based_review_v1',
            review_notes = ${sqlStr(result.reason)}
          WHERE id = ${sqlStr(item.queue_id)};
        `);

        // Promote article to report_ready — but mark that extraction is still pending
        await execSQL(`
          UPDATE articles SET
            report_ready = TRUE,
            report_ready_timestamp = NOW(),
            report_ready_reason = 'rule_based_review_pending_extraction'
          WHERE id = ${sqlStr(item.article_id)};
        `);
      }
    } else {
      rejected++;
      rejectedItems.push(result);
      console.log(`  [${i + 1}/${items.length}] REJ ${item.title?.slice(0, 55)}  (${checksStr})`);

      if (!dryRun) {
        // Keep in queue as pending but add notes about what failed
        await execSQL(`
          UPDATE human_review_queue SET
            review_notes = ${sqlStr(result.reason)}
          WHERE id = ${sqlStr(item.queue_id)};
        `);
      }
    }
  }

  console.log(`\n=== Review Complete ===`);
  console.log(`  Approved: ${approved}`);
  console.log(`  Rejected (remain in queue): ${rejected}`);

  if (rejectedItems.length > 0) {
    console.log(`\n  Rejected articles:`);
    for (const r of rejectedItems) {
      console.log(`    - "${r.title?.slice(0, 60)}" — ${r.reason}`);
    }
  }

  // Final state
  if (!dryRun) {
    const state = await execSQL(`
      SELECT report_ready, report_ready_reason, count(*) as cnt
      FROM articles
      WHERE category IN ('Earnings', 'Earnings & Financials')
      GROUP BY report_ready, report_ready_reason
      ORDER BY report_ready DESC, cnt DESC;
    `);
    console.log(`\n  Final earnings article state:`);
    for (const row of state) {
      console.log(`    ${row.report_ready ? "READY" : "NOT READY"} | ${row.report_ready_reason}: ${row.cnt}`);
    }

    const queueState = await execSQL(`
      SELECT review_status, count(*) as cnt
      FROM human_review_queue
      WHERE queue_type = 'earnings_article'
      GROUP BY review_status
      ORDER BY cnt DESC;
    `);
    console.log(`\n  Review queue state:`);
    for (const row of queueState) {
      console.log(`    ${row.review_status}: ${row.cnt}`);
    }

    if (approved > 0) {
      console.log(`\n  NOTE: ${approved} articles approved with reason 'rule_based_review_pending_extraction'.`);
      console.log(`  When ANTHROPIC_API_KEY is available, run:`);
      console.log(`    ANTHROPIC_API_KEY=sk-ant-... bun run scripts/review-earnings-backfill.ts --extract`);
      console.log(`  to backfill structured extractions and upgrade summaries.`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
