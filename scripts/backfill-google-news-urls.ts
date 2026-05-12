/**
 * Resolve the 73 articles still carrying `news.google.com/rss/articles/...`
 * URLs in production. These rows date from before the URL decoder shipped
 * (commit 0775553 on 2026-05-11). Their content is fine; click-through just
 * routes through Google's redirect instead of going direct to the publisher.
 *
 * This script runs decodeGoogleNewsUrl on each affected row and updates the
 * `url` column to the publisher URL when decoding succeeds. URL dedup is not
 * a concern: the slug is the actual unique key on articles, and we're
 * replacing one unique URL with another.
 *
 * Usage:
 *   bun scripts/backfill-google-news-urls.ts                # all
 *   bun scripts/backfill-google-news-urls.ts --limit 25     # bound work
 *   bun scripts/backfill-google-news-urls.ts --dry-run      # no writes
 */
import { createClient } from "@supabase/supabase-js";
import { decodeGoogleNewsUrl } from "../lib/google-news-decoder";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_KEY) { console.error("SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1]!, 10) : Infinity;
const dryRun = args.includes("--dry-run");

async function main() {
  console.log(`Backfill Google News URLs — limit=${limit}, dry_run=${dryRun}`);

  const { data: rows, error } = await supabase
    .from("articles")
    .select("id, slug, title, url")
    .like("url", "https://news.google.com/%")
    .order("date", { ascending: false });
  if (error) { console.error("Supabase error:", error); process.exit(1); }
  if (!rows || rows.length === 0) { console.log("Nothing to backfill."); return; }

  const work = rows.slice(0, limit);
  console.log(`${rows.length} rows with news.google.com URL; processing ${work.length}.`);

  const byMethod: Record<string, number> = { base64: 0, batchexecute: 0, "redirect-follow": 0, failed: 0 };
  let updated = 0, errors = 0;

  for (let i = 0; i < work.length; i++) {
    const row = work[i]!;
    const result = await decodeGoogleNewsUrl(row.url!);
    byMethod[result.method] = (byMethod[result.method] || 0) + 1;
    if (result.method === "failed" || result.url === row.url) continue;
    if (dryRun) {
      console.log(`  DRY: ${row.slug.slice(0, 60)}\n    ${row.url!.slice(0, 60)}...\n    -> ${result.url.slice(0, 80)} [${result.method}]`);
      continue;
    }
    const { error: updErr } = await supabase
      .from("articles")
      .update({ url: result.url, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updErr) {
      console.warn(`  update failed for ${row.slug}: ${updErr.message}`);
      errors++;
      continue;
    }
    updated++;
    if ((i + 1) % 10 === 0 || i + 1 === work.length) {
      console.log(`  Progress ${i + 1}/${work.length} — updated=${updated} errors=${errors}`);
    }
  }

  console.log(`\nDONE — processed=${work.length} updated=${updated} errors=${errors}`);
  console.log(`Decode method breakdown: ${JSON.stringify(byMethod)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
