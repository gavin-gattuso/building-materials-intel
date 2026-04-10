import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { buildDashboardHTML } from "../lib/html-dashboard.js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();

const NEWS_CATEGORIES = [
  "M&A and Corporate Strategy",
  "Pricing & Cost Trends",
  "Tariffs & Trade Policy",
  "Company Earnings & Performance",
  "Demand & Construction Activity",
  "Sustainability & Innovation",
];
const MARKET_DRIVERS = [
  "Interest & Mortgage Rates",
  "Labor Dynamics",
  "Material & Energy Costs",
  "Demand Visibility",
  "Government Infrastructure Spending",
  "Credit Availability & Lending Standards",
  "GDP Growth & Consumer Confidence",
];

/* ── AI synthesis helpers ── */

async function synthesizeDrivers(articles: any[], startDate: string, endDate: string) {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackDrivers(articles, startDate, endDate);

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const anthropic = new Anthropic();

  // Group articles by driver keyword relevance
  const driverArticles: Record<string, any[]> = {};
  const driverKeywords: Record<string, string[]> = {
    "Interest & Mortgage Rates": ["interest", "mortgage", "rate", "fed", "federal reserve", "basis point", "bps"],
    "Labor Dynamics": ["labor", "workforce", "worker", "hiring", "wage", "employment", "construction job"],
    "Material & Energy Costs": ["material cost", "energy", "lumber", "steel price", "cement price", "commodity", "raw material", "ppi"],
    "Demand Visibility": ["demand", "backlog", "pipeline", "order", "forecast", "housing start", "permit"],
    "Government Infrastructure Spending": ["infrastructure", "iija", "chips act", "government spending", "federal fund", "highway", "bridge"],
    "Credit Availability & Lending Standards": ["credit", "lending", "loan", "financing", "bank", "debt", "spread"],
    "GDP Growth & Consumer Confidence": ["gdp", "consumer confidence", "economic growth", "recession", "consumer spending", "sentiment"],
  };

  for (const driver of MARKET_DRIVERS) {
    const keywords = driverKeywords[driver] || [driver.toLowerCase()];
    driverArticles[driver] = articles.filter((a: any) => {
      const text = `${a.title} ${a.content || ""}`.toLowerCase();
      return keywords.some(k => text.includes(k));
    }).slice(0, 15);
  }

  const articleContext = MARKET_DRIVERS.map(driver => {
    const arts = driverArticles[driver] || [];
    const artText = arts.slice(0, 8).map((a: any, i: number) =>
      `  [${i + 1}] "${a.title}" (${a.source}, ${a.date})\n  ${(a.content || "").slice(0, 800)}`
    ).join("\n\n");
    return `### ${driver} (${arts.length} articles)\n${artText || "  No articles found for this driver."}`;
  }).join("\n\n---\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: "You are a building materials industry analyst writing a professional market health report. Respond with valid JSON only, no markdown fences.",
    messages: [{ role: "user", content: `Analyze the following articles grouped by market health driver for the building materials industry from ${startDate} to ${endDate}.

For EACH of the 7 drivers, produce:
- "driver": the driver name exactly as given
- "content": 2-3 paragraph analysis of current conditions and trends
- "impact": 1 paragraph on how this specifically affects building materials companies
- "dataPoints": array of 4-6 specific data points (numbers, percentages, dollar amounts from the articles)
- "direction": one word — Up, Down, Stable, Mixed, Expanding, Tightening, or Weakening
- "signal": one-line summary (e.g. "30yr at 6.22%, down 25bps from Q3")

Respond as JSON: { "drivers": [ { "driver": "...", "content": "...", "impact": "...", "dataPoints": ["..."], "direction": "...", "signal": "..." } ] }

ARTICLES BY DRIVER:
${articleContext}` }],
  });

  const first = response.content[0];
  const text = first?.type === "text" ? first.text : "{}";
  try {
    const parsed = JSON.parse(text);
    return (parsed.drivers || []).map((d: any) => ({
      driver: d.driver, direction: d.direction || "Mixed",
      signal: d.signal || "", content: d.content || "",
      impact: d.impact || "", dataPoints: d.dataPoints || [],
    }));
  } catch {
    return fallbackDrivers(articles, startDate, endDate);
  }
}

function fallbackDrivers(articles: any[], startDate: string, endDate: string) {
  return MARKET_DRIVERS.map(driver => ({
    driver,
    direction: "Mixed",
    signal: `${driver} — see articles below`,
    content: `Analysis of ${driver} based on ${articles.length} articles in the knowledge base from ${startDate} to ${endDate}. Set ANTHROPIC_API_KEY for AI-powered synthesis.`,
    impact: `Based on current knowledge base coverage of ${driver}.`,
    dataPoints: [] as string[],
  }));
}

async function synthesizeCategories(articles: any[], startDate: string, endDate: string) {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackCategories(articles, startDate, endDate);

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const anthropic = new Anthropic();

  const categoryArticles: Record<string, any[]> = {};
  for (const cat of NEWS_CATEGORIES) {
    categoryArticles[cat] = articles.filter((a: any) => a.category === cat).slice(0, 15);
  }

  const articleContext = NEWS_CATEGORIES.map(cat => {
    const arts = categoryArticles[cat] || [];
    const artText = arts.slice(0, 8).map((a: any, i: number) =>
      `  [${i + 1}] "${a.title}" (${a.source}, ${a.date})\n  ${(a.content || "").slice(0, 800)}`
    ).join("\n\n");
    return `### ${cat} (${arts.length} articles)\n${artText || "  No articles found for this category."}`;
  }).join("\n\n---\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: "You are a building materials industry analyst writing a professional market intelligence report. Respond with valid JSON only, no markdown fences.",
    messages: [{ role: "user", content: `Analyze the following articles grouped by news category for the building materials industry from ${startDate} to ${endDate}.

For EACH of the 6 categories, produce:
- "category": the category name exactly as given
- "content": 1-2 paragraph overview summarizing key themes
- "articles": array of the most notable articles, each with:
  - "title": article title
  - "source": publication name
  - "analysis": 3-5 sentence analysis paragraph
  - "dataPoints": key numbers/data from the article
  - "url": article URL if available

Respond as JSON: { "categories": [ { "category": "...", "content": "...", "articles": [...] } ] }

ARTICLES BY CATEGORY:
${articleContext}` }],
  });

  const first = response.content[0];
  const text = first?.type === "text" ? first.text : "{}";
  try {
    const parsed = JSON.parse(text);
    return (parsed.categories || []).map((c: any) => ({
      category: c.category,
      content: c.content || "",
      articles: (c.articles || []).map((a: any) => ({
        title: a.title || "", source: a.source || "",
        analysis: a.analysis || "", dataPoints: a.dataPoints || [], url: a.url || "",
      })),
    }));
  } catch {
    return fallbackCategories(articles, startDate, endDate);
  }
}

function fallbackCategories(articles: any[], startDate: string, endDate: string) {
  return NEWS_CATEGORIES.map(cat => {
    const catArticles = articles.filter((a: any) => a.category === cat).slice(0, 5);
    return {
      category: cat,
      content: `${catArticles.length} articles found for ${cat} between ${startDate} and ${endDate}.`,
      articles: catArticles.map((a: any) => ({
        title: a.title || "Untitled", source: a.source || "Unknown",
        analysis: (a.content || "").split("\n").find((l: string) => l.trim().length > 40)?.trim().slice(0, 300) || "",
        dataPoints: [] as string[], url: a.url || "",
      })),
    };
  });
}

async function synthesizeExecutiveSummary(drivers: any[], sections: any[], startDate: string, endDate: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const driverSignals = drivers.map((d: any) => `${d.driver}: ${d.direction}`).join("; ");
    return `Building Materials Intelligence Report for ${startDate} to ${endDate}.\n\nMarket Driver Signals: ${driverSignals}\n\nThis report covers ${sections.reduce((n: number, s: any) => n + (s.articles?.length || 0), 0)} articles across ${sections.length} news categories and ${drivers.length} market health drivers.`;
  }

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const anthropic = new Anthropic();

  const context = [
    ...drivers.map((d: any) => `## ${d.driver} [${d.direction}]\n${d.content}\n${d.impact || ""}`),
    ...sections.map((s: any) => `## ${s.category}\n${s.content}`),
  ].join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: "You are a building materials industry analyst. Write a concise, data-driven executive summary.",
    messages: [{ role: "user", content: `Write a 2-3 paragraph executive summary for a Building Materials & Building Products intelligence report covering ${startDate} to ${endDate}. Highlight the most important themes, key data points, and market implications.\n\nSECTION SUMMARIES:\n${context}` }],
  });

  const first = response.content[0];
  return first?.type === "text" ? first.text : "";
}

async function synthesizeConclusion(drivers: any[], startDate: string, endDate: string) {
  if (!process.env.ANTHROPIC_API_KEY) return "";

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const anthropic = new Anthropic();

  const driverSummary = drivers.map((d: any) =>
    `- ${d.driver}: ${d.direction} — ${d.signal}`
  ).join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: "You are a building materials industry analyst. Write a concise analytical conclusion.",
    messages: [{ role: "user", content: `Write a 2-paragraph sector driver conclusion for a Building Materials & Products Market Health Report covering ${startDate} to ${endDate}. Synthesize the overall market outlook based on these driver signals and explain what it means for industry participants.\n\nDRIVER SIGNALS:\n${driverSummary}` }],
  });

  const first = response.content[0];
  return first?.type === "text" ? first.text : "";
}

/* ── Vercel function config ── */
export const config = {
  maxDuration: 120, // AI synthesis can take 30-60s across multiple Claude calls
};

/* ── Main handler ── */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = String(req.headers.origin || "");
  const allowed = ["https://building-materials-intel.vercel.app", "https://av-newsletter-hub.vercel.app", "http://localhost:3000"];
  res.setHeader("Access-Control-Allow-Origin", allowed.includes(origin) ? origin : (allowed[0] ?? "*"));
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  try {
    const { startDate, endDate, executiveSummary, sections, drivers, mode } = req.body;

    // Validate date params to prevent header injection
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const safeStart = dateRe.test(startDate) ? startDate : "unknown";
    const safeEnd = dateRe.test(endDate) ? endDate : "unknown";

    const supabase = SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

    // Fetch financial ratios from Supabase for the company data charts
    let financials: any[] = [];
    if (supabase) {
      const { data } = await supabase
        .from("financial_ratios")
        .select("company, ticker, segment, category, period, revenue_growth_yoy, cogs_sales_pct, cogs_sales_yoy_delta, sga_sales_pct, sga_sales_yoy_delta, ebitda_margin_pct, ebitda_margin_yoy_delta")
        .order("company");
      financials = data || [];
    }

    // AI generation mode: fetch KB articles and synthesize everything server-side
    if (mode === "ai") {
      let articles: any[] = [];
      if (supabase) {
        const { data } = await supabase
          .from("articles")
          .select("id, slug, title, date, source, url, category, content")
          .gte("date", startDate)
          .lte("date", endDate)
          .order("date", { ascending: false })
          .limit(500);
        articles = data || [];
      }

      // Run driver + category synthesis in parallel
      const [aiDrivers, aiSections] = await Promise.all([
        synthesizeDrivers(articles, safeStart, safeEnd),
        synthesizeCategories(articles, safeStart, safeEnd),
      ]);

      // Executive summary + conclusion in parallel (they both depend on drivers/sections)
      const [aiExecSummary, aiConclusion] = await Promise.all([
        synthesizeExecutiveSummary(aiDrivers, aiSections, safeStart, safeEnd),
        synthesizeConclusion(aiDrivers, safeStart, safeEnd),
      ]);

      const html = buildDashboardHTML({
        startDate: safeStart,
        endDate: safeEnd,
        executiveSummary: aiExecSummary,
        sections: aiSections,
        drivers: aiDrivers,
        financials,
        conclusion: aiConclusion,
      });

      const filename = `Building_Materials_Dashboard_${safeStart}_to_${safeEnd}.html`;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(html);
    }

    // Legacy mode: pre-synthesized content passed from client
    const html = buildDashboardHTML({
      startDate: safeStart,
      endDate: safeEnd,
      executiveSummary: executiveSummary || "",
      sections: sections || [],
      drivers: drivers || [],
      financials,
    });

    const filename = `Building_Materials_Dashboard_${safeStart}_to_${safeEnd}.html`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(html);
  } catch (err: any) {
    console.error("build-report error:", err);
    return res.status(500).json({ error: "Failed to build report", detail: err.message || "" });
  }
}
