/**
 * Correction Detection (Phase 3.6)
 *
 * Weekly job that re-fetches URLs of articles published in the prior 14 days
 * from Tier 1 and Tier 2 sources. Compares current page title to stored title.
 * If a material difference is detected (>30% change in title), flags the article.
 *
 * Usage: bun run scripts/detect-corrections.ts
 * Schedule: Every Monday morning via scheduled trigger
 */

import { createClient } from "@supabase/supabase-js";
import { classifySeverity, stripHtml, sendNumericCorrectionAlert } from "../lib/correction-severity";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_KEY) { console.error("SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Tier 1 and 2 source domains to check
const CHECK_DOMAINS = new Set([
  "reuters.com", "bloomberg.com", "wsj.com", "ft.com", "cnbc.com", "forbes.com",
  "fortune.com", "apnews.com", "nytimes.com", "washingtonpost.com", "bbc.com",
  "constructiondive.com", "bdcnetwork.com", "enr.com",
]);

function isCheckDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return Array.from(CHECK_DOMAINS).some(d => hostname === d || hostname.endsWith("." + d));
  } catch { return false; }
}

/**
 * Simple string similarity using Levenshtein-based approach.
 * Returns 0.0 (identical) to 1.0 (completely different).
 */
function stringSimilarityDelta(a: string, b: string): number {
  if (a === b) return 0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;

  // Use word-level comparison for efficiency on long strings
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const union = new Set([...wordsA, ...wordsB]);
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  return 1 - (intersection.size / union.size);
}

async function main() {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  console.log(`Checking for corrections on articles since ${fourteenDaysAgo}...`);

  // Fetch recent Tier 1-2 articles
  const { data: articles } = await supabase
    .from("articles")
    .select("id, slug, title, url, date, correction_flag, full_text")
    .gte("date", fourteenDaysAgo)
    .eq("correction_flag", false);

  if (!articles || articles.length === 0) {
    console.log("No articles to check.");
    return;
  }

  // Filter to Tier 1-2 only
  const toCheck = articles.filter(a => isCheckDomain(a.url));
  console.log(`Checking ${toCheck.length} Tier 1-2 articles out of ${articles.length} total\n`);

  let corrections = 0;

  for (const article of toCheck) {
    try {
      const res = await fetch(article.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; JarvisBot/1.0)" },
        redirect: "follow",
      });
      if (!res.ok) {
        console.log(`  ${article.slug}: HTTP ${res.status}, skipping`);
        continue;
      }

      const html = await res.text();

      // Extract page title
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
      const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";

      if (!pageTitle) continue;

      // Compare with stored title
      const delta = stringSimilarityDelta(article.title, pageTitle);
      const pageBody = stripHtml(html);
      const severity = classifySeverity(article.title, pageTitle, article.full_text, pageBody);
      const triggered = delta > 0.3 || severity === "numeric" || severity === "structural";

      if (triggered) {
        console.log(`  CORRECTION DETECTED: ${article.slug} [severity=${severity}]`);
        console.log(`    Stored: "${article.title}"`);
        console.log(`    Current: "${pageTitle}"`);
        console.log(`    Title delta: ${(delta * 100).toFixed(1)}%\n`);

        // Flag the article
        await supabase
          .from("articles")
          .update({
            correction_flag: true,
            change_severity: severity,
            correction_notes: `Severity: ${severity}. Title changed from "${article.title}" to "${pageTitle}" (${(delta * 100).toFixed(1)}% delta). Detected ${now.toISOString()}.`,
            report_ready: false,
            report_ready_reason: "correction_detected",
            last_verified: now.toISOString(),
          })
          .eq("id", article.id);

        // Queue for human review
        await supabase.from("human_review_queue").insert({
          queue_type: "correction_detected",
          reference_id: article.id,
          reference_table: "articles",
          priority: severity === "numeric" ? 1 : 2,
          review_status: "pending",
          auto_context: `Article "${article.title}" appears to have been corrected. Severity: ${severity}. Page title changed to "${pageTitle}" (${(delta * 100).toFixed(1)}% change).`,
        });

        // Immediate alert on numeric corrections
        if (severity === "numeric") {
          await sendNumericCorrectionAlert(article.title, article.url, article.slug, (m) => console.log(`    ${m}`));
        }

        corrections++;
      } else {
        // Update last_verified timestamp
        await supabase
          .from("articles")
          .update({ last_verified: now.toISOString() })
          .eq("id", article.id);
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 1000));
    } catch (err: any) {
      console.warn(`  ${article.slug}: fetch error — ${err.message}`);
    }
  }

  console.log(`\nDone. Corrections detected: ${corrections} out of ${toCheck.length} checked.`);
}

main().catch(err => { console.error(err); process.exit(1); });
