/**
 * Ad-hoc backfill endpoint — triggers one of the maintenance scripts via
 * HTTP so they can be run from anywhere with the cron secret, no local env
 * setup required.
 *
 * Operations:
 *   POST /api/backfill?op=google-news-urls[&limit=N][&dry=1]
 *     Resolve articles whose url is still https://news.google.com/...
 *     Runs the same logic as scripts/backfill-google-news-urls.ts.
 *
 *   POST /api/backfill?op=article-bodies[&limit=N][&dry=1][&since=YYYY-MM-DD]
 *     Fetch HTML and run extractMainText for articles with short/null
 *     full_text. Same logic as scripts/backfill-article-bodies.ts.
 *
 * Auth: lib/auth.ts (Vercel cron header, Bearer CRON_SECRET, or x-scan-key
 * matching CRON_SECRET / BRIEFING_API_KEY / SUPABASE_SERVICE_ROLE_KEY).
 *
 * Bounded by Vercel maxDuration; pass --limit to chunk if many candidates.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { isAuthorizedCronOrPrivileged } from "../lib/auth.js";
import { decodeGoogleNewsUrl } from "../lib/google-news-decoder.js";
import { fetchArticleBody } from "../lib/body-fetch.js";
import { isApprovedSource } from "../lib/whitelist.js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorizedCronOrPrivileged(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const op = (req.query.op as string) || "";
  const limit = req.query.limit ? Math.max(1, Math.min(500, parseInt(req.query.limit as string, 10))) : 100;
  const dryRun = req.query.dry === "1";
  const since = (req.query.since as string) || null;

  if (op === "google-news-urls") {
    return res.json(await runUrlBackfill(limit, dryRun));
  }
  if (op === "article-bodies") {
    return res.json(await runBodyBackfill(limit, dryRun, since));
  }
  return res.status(400).json({ error: "Pass ?op=google-news-urls or ?op=article-bodies" });
}

async function runUrlBackfill(limit: number, dryRun: boolean) {
  const { data: rows, error } = await supabase
    .from("articles")
    .select("id, slug, url")
    .like("url", "https://news.google.com/%")
    .order("date", { ascending: false })
    .limit(limit);
  if (error) return { error: error.message };
  if (!rows || rows.length === 0) return { ok: true, processed: 0 };

  const byMethod: Record<string, number> = { base64: 0, batchexecute: 0, "redirect-follow": 0, failed: 0 };
  let updated = 0, errors = 0;

  for (const row of rows) {
    const r = await decodeGoogleNewsUrl(row.url!);
    byMethod[r.method] = (byMethod[r.method] || 0) + 1;
    if (r.method === "failed" || r.url === row.url) continue;
    if (dryRun) continue;
    const { error: updErr } = await supabase
      .from("articles")
      .update({ url: r.url, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updErr) errors++;
    else updated++;
  }
  return { ok: true, op: "google-news-urls", processed: rows.length, updated, errors, byMethod, dryRun };
}

async function runBodyBackfill(limit: number, dryRun: boolean, since: string | null) {
  let q = supabase.from("articles").select("id, url, full_text, date").or("full_text.is.null,full_text.eq.");
  if (since) q = q.gte("date", since);
  const { data: rows, error } = await q.order("date", { ascending: false });
  if (error) return { error: error.message };
  if (!rows || rows.length === 0) return { ok: true, processed: 0 };

  const eligible = rows
    .filter(r => r.url && !r.url.includes("news.google.com"))
    .filter(r => isApprovedSource(r.url!))
    .filter(r => !r.full_text || r.full_text.length < 200)
    .slice(0, limit);

  let fetched = 0, updated = 0, failed = 0;
  const concurrency = 5;
  for (let i = 0; i < eligible.length; i += concurrency) {
    const batch = eligible.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async row => ({ row, body: await fetchArticleBody(row.url!, 6000) })));
    for (const { row, body } of results) {
      if (!body) { failed++; continue; }
      fetched++;
      if (dryRun) continue;
      const { error: updErr } = await supabase
        .from("articles")
        .update({ full_text: body, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (!updErr) updated++;
    }
  }
  return { ok: true, op: "article-bodies", candidates: rows.length, eligible: eligible.length, fetched, updated, failed, dryRun };
}
