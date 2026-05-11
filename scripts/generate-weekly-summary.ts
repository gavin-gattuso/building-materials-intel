/**
 * Generates a weekly summary from articles published in the current week.
 * Stores the result in the weekly_summaries Supabase table.
 *
 * Two paths:
 *   - AI:        ANTHROPIC_API_KEY set → calls Claude Sonnet for a narrative digest
 *   - Fallback:  no key / Anthropic fails → deterministic data-rich summary from
 *                article metadata (categories, sources, companies, headlines).
 *                Lower quality but means the Friday cron NEVER produces an
 *                empty week — the homepage AI Weekly Digest box always renders.
 *
 * Two entry points (same logic):
 *   - CLI:   `bun scripts/generate-weekly-summary.ts [--week-of YYYY-MM-DD]`
 *   - HTTP:  `/api/cron-weekly-summary` (Vercel cron, see vercel.json)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co";

export interface WeeklySummaryResult {
  status: "ok" | "no_articles" | "error";
  method?: "ai" | "fallback";
  week_start?: string;
  week_end?: string;
  article_count?: number;
  themes?: string[];
  summary_preview?: string;
  error?: string;
}

function getWeekBounds(date: Date): { start: string; end: string } {
  const d = new Date(date);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

interface Article {
  id: string;
  title: string;
  date: string;
  source: string | null;
  category: string | null;
  content: string | null;
}

interface Digest {
  summary: string;
  themes: string[];
}

function buildFallbackDigest(articles: Article[], companyMentions: Array<{ slug: string; name: string; count: number }>, start: string, end: string): Digest {
  const total = articles.length;

  const byCategory: Record<string, Article[]> = {};
  const bySource: Record<string, number> = {};
  for (const a of articles) {
    const cat = a.category || "Uncategorized";
    (byCategory[cat] ||= []).push(a);
    const src = a.source || "Unknown";
    bySource[src] = (bySource[src] || 0) + 1;
  }

  const topCategories = Object.entries(byCategory)
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, 5);
  const topSources = Object.entries(bySource)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  const topCompanies = companyMentions.slice(0, 5);
  // Pick a representative headline per top category (most recent first).
  const headlines = topCategories.flatMap(([, arts]) => arts.slice(0, 2)).slice(0, 8);

  const fmtDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const para1 = `Week of ${fmtDate(start)}–${fmtDate(end)}: ${total} report-ready articles across ${Object.keys(byCategory).length} categories. Coverage centered on ${topCategories.map(([c, a]) => `${c} (${a.length})`).join(", ")}.`;

  const para2 = topCompanies.length > 0
    ? `Most-mentioned tracked companies: ${topCompanies.map(c => `${c.name} (${c.count})`).join(", ")}. Top sources by volume: ${topSources.map(([s, n]) => `${s} (${n})`).join(", ")}.`
    : `Top sources by volume: ${topSources.map(([s, n]) => `${s} (${n})`).join(", ")}.`;

  const headlinesList = headlines
    .map((h, i) => `${i + 1}. ${h.title} — ${h.source || "?"} (${h.date}, ${h.category || "?"})`)
    .join("\n");

  const para3 = `Notable headlines this week:\n${headlinesList}`;

  const summary = `${para1}\n\n${para2}\n\n${para3}\n\n[Auto-generated digest — set ANTHROPIC_API_KEY on Vercel to enable the AI-narrative version.]`;
  const themes = topCategories.map(([c]) => c);
  return { summary, themes };
}

async function callAnthropicForDigest(articles: Article[], start: string, end: string): Promise<Digest | null> {
  const byCategory: Record<string, Article[]> = {};
  for (const a of articles) {
    const cat = a.category || "Uncategorized";
    (byCategory[cat] ||= []).push(a);
  }
  const categoryBreakdown = Object.entries(byCategory)
    .map(([cat, arts]) => `${cat}: ${arts.length} articles`)
    .join("\n");
  const articleSummaries = articles.slice(0, 30).map((a, i) =>
    `[${i + 1}] "${a.title}" (${a.source}, ${a.date})\nCategory: ${a.category}\n${(a.content || "").slice(0, 800)}`
  ).join("\n\n---\n\n");

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: "You are a building materials industry analyst writing a weekly digest. Be concise, data-driven, and highlight actionable insights.",
      messages: [{
        role: "user",
        content: `Analyze the following ${articles.length} articles from the week of ${start} to ${end} in the Building Materials & Building Products industry.

CATEGORY BREAKDOWN:
${categoryBreakdown}

Write:
1. A 2-3 paragraph executive summary identifying the 3-5 most important themes of the week. Include specific data points, company names, and dollar amounts where available.
2. A JSON array of 3-5 theme labels (short, 2-4 words each) that capture the week's key topics.

Respond in JSON format: { "summary": "paragraph 1\\n\\nparagraph 2\\n\\nparagraph 3", "themes": ["Theme 1", "Theme 2", ...] }

ARTICLES:
${articleSummaries}`,
      }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    let parsed: { summary: string; themes: string[] };
    try { parsed = JSON.parse(text); }
    catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { summary: text, themes: [] };
    }
    if (!parsed?.summary) return null;
    return { summary: parsed.summary, themes: Array.isArray(parsed.themes) ? parsed.themes : [] };
  } catch (err: any) {
    console.error(`[weekly-summary] Anthropic call failed: ${err?.message || err}`);
    return null;
  }
}

export async function generateWeeklySummary(opts: { targetDate?: Date; supabase?: SupabaseClient; forceFallback?: boolean } = {}): Promise<WeeklySummaryResult> {
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
  if (!SUPABASE_KEY) return { status: "error", error: "SUPABASE_SERVICE_ROLE_KEY required" };

  const supabase = opts.supabase ?? createClient(SUPABASE_URL, SUPABASE_KEY);
  const targetDate = opts.targetDate ?? new Date();
  const { start, end } = getWeekBounds(targetDate);

  const { data: articles, error } = await supabase
    .from("articles")
    .select("id, title, date, source, category, content")
    .gte("date", start)
    .lte("date", end)
    .eq("report_ready", true)
    .order("date", { ascending: false });

  if (error) return { status: "error", error: `supabase: ${error.message}` };
  if (!articles || articles.length === 0) return { status: "no_articles", week_start: start, week_end: end };

  // Pull company-mention counts for the same window (used by both paths).
  const { data: companyJoin } = await supabase
    .from("article_companies")
    .select("company_id, articles!inner(date), companies!inner(slug,name)")
    .gte("articles.date", start)
    .lte("articles.date", end);
  const tally = new Map<string, { slug: string; name: string; count: number }>();
  for (const row of (companyJoin || []) as any[]) {
    const slug = row.companies?.slug;
    const name = row.companies?.name;
    if (!slug) continue;
    const cur = tally.get(slug) || { slug, name, count: 0 };
    cur.count++;
    tally.set(slug, cur);
  }
  const companyMentions = [...tally.values()].sort((a, b) => b.count - a.count);

  let digest: Digest | null = null;
  let method: "ai" | "fallback" = "fallback";

  if (ANTHROPIC_KEY && !opts.forceFallback) {
    digest = await callAnthropicForDigest(articles, start, end);
    if (digest) method = "ai";
  }
  if (!digest) {
    digest = buildFallbackDigest(articles, companyMentions, start, end);
    method = "fallback";
  }

  const { error: upsertErr } = await supabase
    .from("weekly_summaries")
    .upsert({
      week_start: start,
      week_end: end,
      summary: digest.summary,
      themes: digest.themes,
      article_count: articles.length,
    }, { onConflict: "week_start,week_end" });
  if (upsertErr) return { status: "error", error: `upsert: ${upsertErr.message}` };

  return {
    status: "ok",
    method,
    week_start: start,
    week_end: end,
    article_count: articles.length,
    themes: digest.themes,
    summary_preview: digest.summary.slice(0, 200),
  };
}

// CLI entry point — only runs when invoked directly via `bun scripts/...`.
const isMain = typeof process !== "undefined" && process.argv[1]?.includes("generate-weekly-summary");
if (isMain) {
  const args = process.argv.slice(2);
  const weekOfIdx = args.indexOf("--week-of");
  const targetDate = weekOfIdx >= 0 && args[weekOfIdx + 1] ? new Date(args[weekOfIdx + 1]!) : new Date();
  const forceFallback = args.includes("--fallback");
  generateWeeklySummary({ targetDate, forceFallback })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      if (result.status === "error") process.exit(1);
    })
    .catch(err => { console.error(err); process.exit(1); });
}
