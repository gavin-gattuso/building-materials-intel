/**
 * Generates an AI weekly summary from articles published in the current week.
 * Stores the result in the weekly_summaries Supabase table.
 *
 * Usage: bun scripts/generate-weekly-summary.ts [--week-of YYYY-MM-DD]
 *   --week-of: generate summary for the week containing this date (default: today)
 *
 * Designed to be called by the nightly scheduled trigger on Friday nights.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

if (!SUPABASE_KEY) { console.error("SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error("ANTHROPIC_API_KEY required"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Parse args
const args = process.argv.slice(2);
const weekOfIdx = args.indexOf("--week-of");
const targetDate = weekOfIdx >= 0 ? new Date(args[weekOfIdx + 1]) : new Date();

// Calculate Monday-Sunday of the target week
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

async function main() {
  const { start, end } = getWeekBounds(targetDate);
  console.log(`Generating weekly summary for ${start} to ${end}`);

  // Fetch articles in this week
  const { data: articles, error } = await supabase
    .from("articles")
    .select("id, slug, title, date, source, category, content")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: false });

  if (error) { console.error("Supabase error:", error); process.exit(1); }
  if (!articles || articles.length === 0) {
    console.log("No articles found for this week. Skipping.");
    return;
  }

  console.log(`Found ${articles.length} articles`);

  // Group by category
  const byCategory: Record<string, any[]> = {};
  for (const a of articles) {
    const cat = a.category || "Uncategorized";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(a);
  }

  const categoryBreakdown = Object.entries(byCategory)
    .map(([cat, arts]) => `${cat}: ${arts.length} articles`)
    .join("\n");

  // Build context for AI
  const articleSummaries = articles.slice(0, 30).map((a, i) =>
    `[${i + 1}] "${a.title}" (${a.source}, ${a.date})\nCategory: ${a.category}\n${(a.content || "").slice(0, 800)}`
  ).join("\n\n---\n\n");

  // Call Anthropic
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

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  let parsed: { summary: string; themes: string[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown fences
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : { summary: text, themes: [] };
  }

  console.log(`Summary: ${parsed.summary.slice(0, 100)}...`);
  console.log(`Themes: ${parsed.themes.join(", ")}`);

  // Upsert into Supabase
  const { error: upsertErr } = await supabase
    .from("weekly_summaries")
    .upsert({
      week_start: start,
      week_end: end,
      summary: parsed.summary,
      themes: parsed.themes,
      article_count: articles.length,
    }, { onConflict: "week_start,week_end" });

  if (upsertErr) {
    console.error("Upsert error:", upsertErr);
    process.exit(1);
  }

  console.log(`Weekly summary saved for ${start} to ${end}`);
}

main().catch(err => { console.error(err); process.exit(1); });
