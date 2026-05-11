/**
 * Generates an AI weekly summary from articles published in the current week.
 * Stores the result in the weekly_summaries Supabase table.
 *
 * Two entry points (same logic):
 *   - CLI:   `bun scripts/generate-weekly-summary.ts [--week-of YYYY-MM-DD]`
 *   - HTTP:  `/api/cron-weekly-summary` (Vercel cron, see vercel.json)
 *
 * The core lives in `generateWeeklySummary({ targetDate })` so both callers
 * share one implementation.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co";

export interface WeeklySummaryResult {
  status: "ok" | "no_articles" | "error";
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

export async function generateWeeklySummary(opts: { targetDate?: Date; supabase?: SupabaseClient } = {}): Promise<WeeklySummaryResult> {
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
  if (!SUPABASE_KEY) return { status: "error", error: "SUPABASE_SERVICE_ROLE_KEY required" };
  if (!ANTHROPIC_KEY) return { status: "error", error: "ANTHROPIC_API_KEY required" };

  const supabase = opts.supabase ?? createClient(SUPABASE_URL, SUPABASE_KEY);
  const targetDate = opts.targetDate ?? new Date();
  const { start, end } = getWeekBounds(targetDate);

  const { data: articles, error } = await supabase
    .from("articles")
    .select("id, slug, title, date, source, category, content")
    .gte("date", start)
    .lte("date", end)
    .eq("report_ready", true)
    .order("date", { ascending: false });

  if (error) return { status: "error", error: `supabase: ${error.message}` };
  if (!articles || articles.length === 0) return { status: "no_articles", week_start: start, week_end: end };

  const byCategory: Record<string, any[]> = {};
  for (const a of articles) {
    const cat = a.category || "Uncategorized";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(a);
  }
  const categoryBreakdown = Object.entries(byCategory)
    .map(([cat, arts]) => `${cat}: ${arts.length} articles`)
    .join("\n");

  const articleSummaries = articles.slice(0, 30).map((a, i) =>
    `[${i + 1}] "${a.title}" (${a.source}, ${a.date})\nCategory: ${a.category}\n${(a.content || "").slice(0, 800)}`
  ).join("\n\n---\n\n");

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

  const { error: upsertErr } = await supabase
    .from("weekly_summaries")
    .upsert({
      week_start: start,
      week_end: end,
      summary: parsed.summary,
      themes: parsed.themes,
      article_count: articles.length,
    }, { onConflict: "week_start,week_end" });
  if (upsertErr) return { status: "error", error: `upsert: ${upsertErr.message}` };

  return {
    status: "ok",
    week_start: start,
    week_end: end,
    article_count: articles.length,
    themes: parsed.themes,
    summary_preview: parsed.summary.slice(0, 200),
  };
}

// CLI entry point — only runs when invoked directly via `bun scripts/...`.
const isMain = typeof process !== "undefined" && process.argv[1]?.includes("generate-weekly-summary");
if (isMain) {
  const args = process.argv.slice(2);
  const weekOfIdx = args.indexOf("--week-of");
  const targetDate = weekOfIdx >= 0 && args[weekOfIdx + 1] ? new Date(args[weekOfIdx + 1]!) : new Date();
  generateWeeklySummary({ targetDate })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      if (result.status === "error") process.exit(1);
    })
    .catch(err => { console.error(err); process.exit(1); });
}
