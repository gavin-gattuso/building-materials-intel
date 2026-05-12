/**
 * /api/status — operational health snapshot for the /status.html dashboard.
 *
 * Replaces "Gavin reads SQL queries to know if the system is alive". Pulls
 * the last 14 days of pipeline_runs, the most-recent daily_run_lock, recent
 * alert email counts, and the freshness of each data type (articles,
 * weekly_summaries, financial_ratios, market_drivers) into a single shape
 * the status page can render.
 *
 * Public (no auth) — only returns aggregate counts and timestamps, no
 * article content, no PII. The shape is intentionally stable so the page
 * doesn't break on schema additions.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function hoursAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.round((Date.now() - Date.parse(iso)) / 36e5);
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=60");

  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString();

  const [
    runsResult,
    lastLockResult,
    latestArticleResult,
    latestSummaryResult,
    latestRatiosResult,
    latestDriverResult,
    alertCountResult,
    digestCountResult,
    articleCountsResult,
    pendingReviewResult,
    stuckLocksResult,
  ] = await Promise.all([
    supabase.from("pipeline_runs").select("run_date, started_at, archived, candidates, url_decode_pct, body_fetch_pct, anthropic_pct, invocation").gte("started_at", fourteenDaysAgo).order("started_at", { ascending: false }),
    supabase.from("daily_run_lock").select("run_date, status, completed_at, articles_inserted").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("articles").select("date, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("weekly_summaries").select("week_end, created_at, article_count").order("week_end", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("financial_ratios").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("market_drivers").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("email_send_log").select("id, type", { count: "exact", head: false }).like("type", "alert-%").gte("created_at", fourteenDaysAgo),
    supabase.from("email_send_log").select("id", { count: "exact", head: true }).eq("type", "digest").gte("created_at", fourteenDaysAgo),
    supabase.from("articles").select("id", { count: "exact", head: true }),
    supabase.from("human_review_queue").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
    supabase.from("daily_run_lock").select("run_date, started_at", { count: "exact" }).eq("status", "in_progress").lt("started_at", new Date(Date.now() - 15 * 60 * 1000).toISOString()),
  ]);

  const runs = runsResult.data || [];
  const recentAlerts = alertCountResult.data || [];
  const alertsByType: Record<string, number> = {};
  for (const a of recentAlerts) alertsByType[a.type] = (alertsByType[a.type] || 0) + 1;

  const avgOverDays = (key: "url_decode_pct" | "body_fetch_pct" | "anthropic_pct", days: number) => {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const subset = runs.filter(r => r.started_at >= cutoff && r[key] != null);
    if (subset.length === 0) return null;
    return Math.round(subset.reduce((a, b) => a + Number(b[key]), 0) / subset.length * 10) / 10;
  };

  const latestArticleDate = latestArticleResult.data?.date || null;
  const articleStaleHours = latestArticleDate ? Math.round((Date.now() - Date.parse(latestArticleDate + "T00:00:00Z")) / 36e5) : null;

  const ok = articleStaleHours != null && articleStaleHours <= 36 && (stuckLocksResult.count || 0) === 0;

  return res.json({
    ok,
    checked_at: now.toISOString(),
    last_run: lastLockResult.data ? {
      run_date: lastLockResult.data.run_date,
      status: lastLockResult.data.status,
      completed_at: lastLockResult.data.completed_at,
      articles_inserted: lastLockResult.data.articles_inserted,
      hours_ago: hoursAgo(lastLockResult.data.completed_at),
    } : null,
    freshness: {
      latest_article_date: latestArticleDate,
      article_stale_hours: articleStaleHours,
      latest_weekly_summary: latestSummaryResult.data?.week_end || null,
      weekly_summary_age_days: latestSummaryResult.data?.week_end ? Math.floor((Date.now() - Date.parse(latestSummaryResult.data.week_end + "T00:00:00Z")) / 86400000) : null,
      financial_ratios_updated_at: latestRatiosResult.data?.updated_at || null,
      financial_ratios_age_days: latestRatiosResult.data?.updated_at ? Math.floor((Date.now() - Date.parse(latestRatiosResult.data.updated_at)) / 86400000) : null,
      market_drivers_updated_at: latestDriverResult.data?.updated_at || null,
      market_drivers_age_days: latestDriverResult.data?.updated_at ? Math.floor((Date.now() - Date.parse(latestDriverResult.data.updated_at)) / 86400000) : null,
    },
    rates_14d: {
      url_decode_pct: avgOverDays("url_decode_pct", 14),
      body_fetch_pct: avgOverDays("body_fetch_pct", 14),
      anthropic_pct: avgOverDays("anthropic_pct", 14),
    },
    rates_7d: {
      url_decode_pct: avgOverDays("url_decode_pct", 7),
      body_fetch_pct: avgOverDays("body_fetch_pct", 7),
      anthropic_pct: avgOverDays("anthropic_pct", 7),
    },
    counters: {
      total_articles: articleCountsResult.count || 0,
      pending_reviews: pendingReviewResult.count || 0,
      alerts_14d: recentAlerts.length,
      digests_14d: digestCountResult.count || 0,
      stuck_locks: stuckLocksResult.count || 0,
    },
    alerts_breakdown: alertsByType,
    recent_runs: runs.slice(0, 14).map(r => ({
      date: r.run_date,
      invocation: r.invocation,
      articles: r.archived,
      candidates: r.candidates,
      url_decode_pct: r.url_decode_pct,
      body_fetch_pct: r.body_fetch_pct,
      anthropic_pct: r.anthropic_pct,
    })),
  });
}
