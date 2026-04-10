/**
 * Backfill weekly summaries for weeks that have articles but no summary.
 *
 * Usage: bun scripts/backfill-weekly-summaries.ts [--dry-run] [--limit N]
 *   --dry-run: show what would be generated without writing to DB
 *   --limit N: max number of weeks to backfill (default: all)
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

if (!SUPABASE_KEY) { console.error("SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error("ANTHROPIC_API_KEY required"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getSunday(monday: Date): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  return d;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function generateSummary(articles: any[], weekStart: string, weekEnd: string): Promise<{ summary: string; themes: string[] }> {
  const articleContext = articles.map(a =>
    `[${a.date}] ${a.title} (${a.source}, ${a.category})\n${(a.content || "").slice(0, 300)}`
  ).join("\n\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2024-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `You are a building materials industry analyst. Summarize this week's (${weekStart} to ${weekEnd}) key developments in 3-4 paragraphs. Focus on: major M&A, earnings beats/misses, tariff/trade policy changes, pricing trends, and market outlook shifts. Be data-specific.

Also return 3-5 theme titles (short phrases) capturing the week's main narratives.

Return JSON: {"summary": "...", "themes": ["theme1", "theme2", ...]}

ARTICLES:\n${articleContext}`
      }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || "{}";
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch?.[0] || "{}");
  } catch {
    return { summary: text, themes: [] };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

  // Get all articles ordered by date
  const { data: articles } = await supabase
    .from("articles")
    .select("title, date, source, category, content")
    .order("date", { ascending: true });

  if (!articles || articles.length === 0) {
    console.log("No articles found");
    return;
  }

  // Get existing weekly summaries
  const { data: existing } = await supabase
    .from("weekly_summaries")
    .select("week_start, week_end");

  const existingWeeks = new Set((existing || []).map(e => e.week_start));

  // Group articles by week (Mon-Sun)
  const weekMap = new Map<string, any[]>();
  for (const a of articles) {
    const monday = getMonday(new Date(a.date + "T00:00:00"));
    const key = fmt(monday);
    if (!weekMap.has(key)) weekMap.set(key, []);
    weekMap.get(key)!.push(a);
  }

  // Find weeks without summaries
  const missingWeeks = [...weekMap.entries()]
    .filter(([weekStart]) => !existingWeeks.has(weekStart))
    .sort(([a], [b]) => a.localeCompare(b));

  console.log(`Found ${missingWeeks.length} weeks without summaries (${weekMap.size} total weeks)`);

  let generated = 0;
  for (const [weekStart, weekArticles] of missingWeeks) {
    if (generated >= limit) break;

    const monday = new Date(weekStart + "T00:00:00");
    const weekEnd = fmt(getSunday(monday));

    console.log(`\n${weekStart} → ${weekEnd}: ${weekArticles.length} articles`);

    if (weekArticles.length < 3) {
      console.log("  Skipping (fewer than 3 articles)");
      continue;
    }

    if (dryRun) {
      console.log("  [dry-run] Would generate summary");
      generated++;
      continue;
    }

    console.log("  Generating summary...");
    const result = await generateSummary(weekArticles, weekStart, weekEnd);

    if (!result.summary) {
      console.log("  Failed to generate summary");
      continue;
    }

    const { error } = await supabase.from("weekly_summaries").upsert({
      week_start: weekStart,
      week_end: weekEnd,
      summary: result.summary,
      themes: result.themes,
      article_count: weekArticles.length,
      created_at: new Date().toISOString(),
    }, { onConflict: "week_start" });

    if (error) {
      console.error(`  DB error: ${error.message}`);
    } else {
      console.log(`  Saved (${result.summary.length} chars, ${result.themes.length} themes)`);
      generated++;
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\nDone: ${generated} summaries ${dryRun ? "would be " : ""}generated`);
}

main().catch(err => { console.error(err); process.exit(1); });
