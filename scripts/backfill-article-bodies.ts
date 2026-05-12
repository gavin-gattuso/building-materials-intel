/**
 * Backfill body text for articles that were ingested before the body-fetch
 * pipeline existed (most articles before 2026-05-11).
 *
 * Today only 20 / 503 articles have meaningful `full_text` — every report
 * generated from that state is working from headlines, not bodies. This
 * script walks the existing articles table, re-fetches HTML for whitelisted
 * URLs, runs extractMainText, and updates the row in place. No re-ingest:
 * the article slug / dedup state is preserved.
 *
 * Skips: news.google.com URLs (need decoder first — see backfill-google-news-
 * urls.ts), already-good bodies (>200 chars), and non-whitelisted domains.
 *
 * Usage:
 *   bun scripts/backfill-article-bodies.ts                  # all eligible
 *   bun scripts/backfill-article-bodies.ts --limit 50       # bound work
 *   bun scripts/backfill-article-bodies.ts --since 2026-04  # date floor
 *   bun scripts/backfill-article-bodies.ts --dry-run        # no writes
 */
import { createClient } from "@supabase/supabase-js";
import { fetchArticleBody } from "../lib/body-fetch";
import { isApprovedSource } from "../lib/whitelist";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_KEY) { console.error("SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const sinceIdx = args.indexOf("--since");
const limit = limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1]!, 10) : Infinity;
const since = sinceIdx >= 0 && args[sinceIdx + 1] ? args[sinceIdx + 1] : null;
const dryRun = args.includes("--dry-run");
const concurrency = 5;

async function main() {
  console.log(`Backfill article bodies — limit=${limit}, since=${since || "any"}, dry_run=${dryRun}`);

  let query = supabase
    .from("articles")
    .select("id, url, title, date, full_text")
    .or("full_text.is.null,full_text.eq.")
    .order("date", { ascending: false });
  if (since) query = query.gte("date", since);

  const { data: rows, error } = await query;
  if (error) { console.error("Supabase error:", error); process.exit(1); }
  if (!rows || rows.length === 0) { console.log("No eligible articles."); return; }

  // Filter to whitelist + non-Google-News URLs + body-length check (the
  // DB filter above accepts null OR empty; tighten further here)
  const eligible = rows
    .filter(r => r.url && !r.url.includes("news.google.com"))
    .filter(r => isApprovedSource(r.url!))
    .filter(r => !r.full_text || r.full_text.length < 200)
    .slice(0, limit);

  console.log(`${rows.length} candidates from DB, ${eligible.length} eligible (whitelisted, non-Google-News, short body).`);

  let fetched = 0, skipped = 0, failed = 0, updated = 0;
  const failureReasons: Record<string, number> = {};

  // Process in batches to bound concurrency
  for (let i = 0; i < eligible.length; i += concurrency) {
    const batch = eligible.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async (row) => {
      const body = await fetchArticleBody(row.url!, 6000);
      return { row, body };
    }));
    for (const { row, body } of results) {
      if (!body) {
        failed++;
        failureReasons["no_body_or_too_short"] = (failureReasons["no_body_or_too_short"] || 0) + 1;
        continue;
      }
      fetched++;
      if (dryRun) {
        skipped++;
        continue;
      }
      const { error: updErr } = await supabase
        .from("articles")
        .update({ full_text: body, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (updErr) {
        console.warn(`  update failed for ${row.id}: ${updErr.message}`);
        continue;
      }
      updated++;
    }
    if ((i + concurrency) % 25 === 0 || i + concurrency >= eligible.length) {
      console.log(`  Progress ${Math.min(i + concurrency, eligible.length)}/${eligible.length} — fetched=${fetched} updated=${updated} failed=${failed}`);
    }
  }

  console.log(`\nDONE — eligible=${eligible.length} fetched=${fetched} updated=${updated} failed=${failed}`);
  if (failed > 0) {
    console.log("Failure reasons:");
    for (const [k, v] of Object.entries(failureReasons)) console.log(`  ${k}: ${v}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
