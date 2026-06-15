/**
 * Re-run company matching against existing articles that have no links yet.
 *
 * After today's body-fetch backfill, ~142 articles now have substantive
 * full_text. Re-running matchCompanies on (title + content + full_text)
 * can attach company links that the original headline-only ingest missed.
 *
 * Usage:
 *   POST /api/rematch-companies?limit=200[&dry=1]
 *
 * Auth: lib/auth.ts. Only operates on articles with NO existing
 * article_companies row (doesn't touch already-linked rows) and skips
 * articles a human already reviewed and rejected, so a rematch never
 * silently undoes those decisions.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { isAuthorizedCronOrPrivileged } from "../lib/auth.js";
import { matchCompanies } from "../lib/company-match.js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorizedCronOrPrivileged(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const limit = req.query.limit ? Math.max(1, Math.min(1000, parseInt(req.query.limit as string, 10))) : 200;
  const dryRun = req.query.dry === "1";

  // Find articles with no existing company link
  const { data: linked } = await supabase
    .from("article_companies")
    .select("article_id");
  const linkedSet = new Set((linked || []).map(l => l.article_id));

  // Articles a human already reviewed and rejected — never re-link these.
  const { data: rejected } = await supabase
    .from("human_review_queue")
    .select("reference_id")
    .eq("reference_table", "articles")
    .eq("review_status", "rejected");
  const rejectedSet = new Set((rejected || []).map(r => r.reference_id));

  const { data: candidates, error } = await supabase
    .from("articles")
    .select("id, title, content, full_text")
    .order("date", { ascending: false })
    .limit(2000);
  if (error) return res.status(500).json({ error: error.message });

  const unlinked = (candidates || [])
    .filter(a => !linkedSet.has(a.id) && !rejectedSet.has(a.id))
    .slice(0, limit);

  const { data: companies } = await supabase.from("companies").select("id, slug");
  const companyIdBySlug = new Map((companies || []).map(c => [c.slug, c.id]));

  let matched = 0, linksInserted = 0;
  const matchesByCompany: Record<string, number> = {};

  for (const art of unlinked) {
    const text = art.full_text && art.full_text.length > 200
      ? (art.full_text as string)
      : (art.content || "");
    const result = matchCompanies(art.title, text);
    if (result.length === 0) continue;
    matched++;
    if (dryRun) {
      for (const m of result) matchesByCompany[m.slug] = (matchesByCompany[m.slug] || 0) + 1;
      continue;
    }
    for (const m of result) {
      const companyId = companyIdBySlug.get(m.slug);
      if (!companyId) continue;
      const { error: insErr } = await supabase
        .from("article_companies")
        .upsert(
          { article_id: art.id, company_id: companyId, low_confidence_match: m.lowConfidence },
          { onConflict: "article_id,company_id" }
        );
      if (!insErr) {
        linksInserted++;
        matchesByCompany[m.slug] = (matchesByCompany[m.slug] || 0) + 1;
      }
    }
  }

  return res.json({
    ok: true,
    examined: unlinked.length,
    articles_matched: matched,
    links_inserted: linksInserted,
    by_company: matchesByCompany,
    dryRun,
  });
}
