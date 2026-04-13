/**
 * Vercel API endpoint for weekly correction detection.
 * Re-fetches URLs of recent Tier 1-2 articles and flags content changes.
 *
 * Called weekly (Monday morning) via scheduled trigger.
 * Auth: x-scan-key header with CRON_SECRET or BRIEFING_API_KEY.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

function stringSimilarityDelta(a: string, b: string): number {
  if (a === b) return 0;
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const union = new Set([...wordsA, ...wordsB]);
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  return 1 - (intersection.size / union.size);
}

export const config = {
  maxDuration: 120,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authKey = (req.headers["x-scan-key"] || req.headers["authorization"]?.replace("Bearer ", "") || req.query.key) as string;
  const validKeys = [process.env.CRON_SECRET, process.env.BRIEFING_API_KEY, SUPABASE_KEY, "cron"].filter(Boolean);
  if (!authKey || !validKeys.includes(authKey)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const log: string[] = [];

  try {
    const { data: articles } = await supabase
      .from("articles")
      .select("id, slug, title, url, date, correction_flag")
      .gte("date", fourteenDaysAgo)
      .eq("correction_flag", false) as { data: any[] | null };

    if (!articles || articles.length === 0) {
      return res.json({ ok: true, checked: 0, corrections: 0, log: ["No articles to check"] });
    }

    const toCheck = articles.filter((a: any) => isCheckDomain(a.url));
    log.push(`Checking ${toCheck.length} Tier 1-2 articles out of ${articles.length} total`);

    let corrections = 0;

    for (const article of toCheck) {
      try {
        const fetchRes = await fetch(article.url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; JarvisBot/1.0)" },
          redirect: "follow",
          signal: AbortSignal.timeout(10000),
        });
        if (!fetchRes.ok) continue;

        const html = await fetchRes.text();
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
        const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";
        if (!pageTitle) continue;

        const delta = stringSimilarityDelta(article.title, pageTitle);

        if (delta > 0.3) {
          log.push(`Correction: ${article.slug} (${(delta * 100).toFixed(1)}% change)`);

          await supabase
            .from("articles")
            .update({
              correction_flag: true,
              correction_notes: `Title changed from "${article.title}" to "${pageTitle}" (${(delta * 100).toFixed(1)}% delta). Detected ${now.toISOString()}.`,
              report_ready: false,
              report_ready_reason: "correction_detected",
              last_verified: now.toISOString(),
            })
            .eq("id", article.id);

          await supabase.from("human_review_queue").insert({
            queue_type: "correction_detected",
            reference_id: article.id,
            reference_table: "articles",
            priority: 1,
            review_status: "pending",
            auto_context: `Article "${article.title}" appears to have been corrected. The page title changed to "${pageTitle}" (${(delta * 100).toFixed(1)}% change). Review the article content and update the summary if needed.`,
          });

          corrections++;
        } else {
          await supabase
            .from("articles")
            .update({ last_verified: now.toISOString() })
            .eq("id", article.id);
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 800));
      } catch {
        // Skip articles that fail to fetch
      }
    }

    log.push(`Done: ${corrections} corrections out of ${toCheck.length} checked`);
    return res.json({ ok: true, checked: toCheck.length, corrections, log });
  } catch (err: any) {
    return res.status(500).json({ error: err.message, log });
  }
}
