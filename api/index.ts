import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { expandTerms, extractExcerpts, scoreEntry } from "../lib/search.js";
import { buildSmartSearchResponse, buildSearchContext, buildSourceList, SYSTEM_PROMPT_PREFIX } from "../lib/chat.js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!SUPABASE_KEY) console.warn("WARNING: SUPABASE_SERVICE_ROLE_KEY is not set — API queries will fail");
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ALLOWED_ORIGINS = [
  "https://building-materials-intel.vercel.app",
  "https://av-newsletter-hub.vercel.app",
  "http://localhost:3000",
];

/** Minimal HTML page for browser-rendered responses (e.g. email action clicks). */
function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;max-width:500px;margin:40px auto;padding:0 20px;text-align:center">
<div style="background:#1B3C2D;color:#fff;padding:16px;border-radius:8px 8px 0 0"><h1 style="margin:0;font-size:18px">Building Materials Intel</h1></div>
<div style="padding:24px;background:#f9f9f9;border-radius:0 0 8px 8px">${body}</div>
</body></html>`;
}

// Simple in-memory rate limiter for AI endpoints
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // max requests per window
const RATE_WINDOW = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  // Periodically purge expired entries to prevent memory leak
  if (rateLimitMap.size > 500) {
    for (const [key, val] of rateLimitMap) {
      if (now > val.resetAt) rateLimitMap.delete(key);
    }
  }
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

// ---------- Data access ----------

async function attachCompanies<T extends { id: string }>(articles: T[]): Promise<(T & { companies: string[]; type: "article" })[]> {
  if (articles.length === 0) return [];
  const articleIds = articles.map(a => a.id);
  const { data: junctions } = await supabase
    .from("article_companies")
    .select("article_id, companies(name)")
    .in("article_id", articleIds);

  const companyMap: Record<string, string[]> = {};
  if (junctions) {
    for (const j of junctions as any[]) {
      const name = j.companies?.name;
      if (name) {
        if (!companyMap[j.article_id]) companyMap[j.article_id] = [];
        companyMap[j.article_id].push(name);
      }
    }
  }
  return articles.map(a => ({ ...a, companies: companyMap[a.id] || [], type: "article" as const }));
}

async function getArticles(limit = 200) {
  const { data: articles, error } = await supabase
    .from("articles")
    .select("id, slug, title, date, source, url, category, content")
    .order("date", { ascending: false })
    .limit(limit);
  if (error) console.error("getArticles error:", error.message);
  if (!articles || articles.length === 0) return [];
  return attachCompanies(articles);
}

async function getArticlesMeta(limit = 200) {
  const { data: articles, error } = await supabase
    .from("articles")
    .select("id, slug, title, date, source, url, category, report_ready, report_ready_reason")
    .order("date", { ascending: false })
    .limit(limit);
  if (error) console.error("getArticlesMeta error:", error.message);
  if (!articles || articles.length === 0) return [];
  return attachCompanies(articles);
}

async function getArticleBySlug(slug: string) {
  const { data } = await supabase.from("articles").select("id, slug, title, date, source, url, category, content").eq("slug", slug).maybeSingle();
  if (!data) return null;
  const { data: junctions } = await supabase.from("article_companies").select("companies(name)").eq("article_id", data.id);
  const companies = (junctions as any[] || []).map(j => j.companies?.name).filter(Boolean);
  return { ...data, companies, type: "article" };
}

async function getCompanies() {
  const { data } = await supabase.from("companies").select("slug, name, ticker, sector, subsector, content").order("name");
  return (data || []).map(c => ({ ...c, type: "company" as const }));
}

async function getMarketDrivers() {
  const { data } = await supabase.from("market_drivers").select("slug, title, current_signal, content").order("title");
  return (data || []).map(d => ({ ...d, type: "market-driver" as const }));
}

async function getConcepts() {
  const { data } = await supabase.from("concepts").select("slug, title, content").order("title");
  return (data || []).map(c => ({ ...c, type: "concept" as const }));
}

async function getWikiBySlug(slug: string) {
  const { data: company } = await supabase.from("companies").select("slug, name, ticker, sector, subsector, content").eq("slug", slug).maybeSingle();
  if (company) return { id: company.slug, title: company.name, type: "company", content: company.content, frontmatter: { ticker: company.ticker, sector: company.sector, subsector: company.subsector } };

  const { data: driver } = await supabase.from("market_drivers").select("slug, title, current_signal, content").eq("slug", slug).maybeSingle();
  if (driver) return { id: driver.slug, title: driver.title, type: "market-driver", content: driver.content, frontmatter: { current_signal: driver.current_signal } };

  const { data: concept } = await supabase.from("concepts").select("slug, title, content").eq("slug", slug).maybeSingle();
  if (concept) return { id: concept.slug, title: concept.title, type: "concept", content: concept.content, frontmatter: {} };

  return null;
}

async function getStats() {
  const [r1, r2, r3, r4] = await Promise.all([
    supabase.from("articles").select("*", { count: "exact", head: true }),
    supabase.from("companies").select("*", { count: "exact", head: true }),
    supabase.from("market_drivers").select("*", { count: "exact", head: true }),
    supabase.from("concepts").select("*", { count: "exact", head: true }),
  ]);

  const { data: articles } = await supabase.from("articles").select("category, date");
  const byCategory: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  let earliest = "9999", latest = "0000";
  for (const a of articles || []) {
    byCategory[a.category] = (byCategory[a.category] || 0) + 1;
    const month = (a.date || "").slice(0, 7);
    if (month) byMonth[month] = (byMonth[month] || 0) + 1;
    if (a.date < earliest) earliest = a.date;
    if (a.date > latest) latest = a.date;
  }

  const { data: junctions } = await supabase.from("article_companies").select("companies(name)");
  const companyMentions: Record<string, number> = {};
  for (const j of (junctions as any[] || [])) {
    const name = j.companies?.name;
    if (name) companyMentions[name] = (companyMentions[name] || 0) + 1;
  }

  return {
    totalArticles: r1.count || 0,
    totalWikiPages: (r2.count || 0) + (r3.count || 0) + (r4.count || 0),
    companies: r2.count || 0,
    marketDrivers: r3.count || 0,
    concepts: r4.count || 0,
    byCategory, byMonth, companyMentions,
    dateRange: (articles || []).length > 0 ? { from: earliest, to: latest } : null,
  };
}

// ---------- Search ----------
// Synonyms, expandTerms, extractExcerpts, scoreEntry imported from lib/search.ts

// PostgreSQL full-text search for articles (uses tsvector + GIN index)
async function searchArticlesFTS(query: string, limit: number) {
  const tsQuery = query.split(/\s+/).filter(t => t.length > 2).map(t => t.replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean).join(" & ");
  if (!tsQuery) return [];

  const { data: articles, error } = await supabase
    .rpc("search_articles", { search_query: tsQuery, result_limit: limit })
    .select("*");

  // Fallback to ilike search if RPC not available (pre-migration)
  if (error || !articles) {
    console.error("searchArticlesFTS failed:", error?.message || "no data returned", { tsQuery, limit });
    return null; // signal to use in-memory fallback
  }
  return articles;
}

// scoreEntry imported from lib/search.ts

async function searchKB(query: string, limit = 20) {
  const rawTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  if (rawTerms.length === 0) {
    const articles = await getArticlesMeta(limit);
    return articles.map(a => ({ entry: a, score: 1, excerpts: [] as string[], matchedTerms: [] as string[] }));
  }

  const terms = expandTerms(rawTerms);

  // Try PostgreSQL FTS for articles first (fast, indexed)
  const ftsResults = await searchArticlesFTS(query, limit * 2);

  let articleResults: any[];
  if (ftsResults) {
    // FTS succeeded — enrich with company data and score
    const articleIds = ftsResults.map((a: any) => a.id);
    const { data: junctions } = articleIds.length > 0
      ? await supabase.from("article_companies").select("article_id, companies(name)").in("article_id", articleIds)
      : { data: [] };
    const companyMap: Record<string, string[]> = {};
    if (junctions) {
      for (const j of junctions as any[]) {
        const name = j.companies?.name;
        if (name) {
          if (!companyMap[j.article_id]) companyMap[j.article_id] = [];
          companyMap[j.article_id].push(name);
        }
      }
    }
    articleResults = ftsResults.map((a: any) => {
      const entry = { ...a, companies: companyMap[a.id] || [], type: "article" as const };
      const r = scoreEntry(entry, terms, rawTerms);
      // Boost FTS rank into score
      const ftsBoost = (a.rank || 0) * 50;
      return { entry, score: r.score + ftsBoost, excerpts: extractExcerpts(a.content || "", rawTerms), matchedTerms: r.matchedTerms };
    });
  } else {
    // Fallback: in-memory search (pre-migration or RPC error)
    const articles = await getArticles(500);
    articleResults = [];
    for (const a of articles) {
      const r = scoreEntry(a, terms, rawTerms);
      if (r.score > 0) articleResults.push({ entry: a, score: r.score, excerpts: extractExcerpts(a.content, rawTerms), matchedTerms: r.matchedTerms });
    }
  }

  // Wiki pages are small enough for in-memory search
  const [companies, drivers, concepts] = await Promise.all([
    getCompanies(), getMarketDrivers(), getConcepts(),
  ]);
  const wikiResults: any[] = [];
  const wiki = [
    ...companies.map(c => ({ ...c, title: c.name })),
    ...drivers,
    ...concepts,
  ];
  for (const w of wiki) {
    const r = scoreEntry(w, terms, rawTerms);
    if (r.score > 0) wikiResults.push({ entry: w, score: r.score, excerpts: extractExcerpts(w.content, rawTerms), matchedTerms: r.matchedTerms });
  }

  const results = [...articleResults, ...wikiResults];
  results.sort((a: any, b: any) => b.score - a.score);
  return results.slice(0, limit);
}

// ---------- Router ----------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const path = (req.url || "").replace(/^\/api\/?/, "").split("?")[0];

  try {
    // /api/stats
    if (path === "stats") {
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120");
      return res.json(await getStats());
    }

    // /api/mode
    if (path === "mode") {
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.json({ aiEnabled: !!process.env.ANTHROPIC_API_KEY });
    }

    // /api/earnings-calendar
    if (path === "earnings-calendar") {
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=7200");
      const { data } = await supabase.from("earnings_calendar").select("*").gte("date", new Date().toISOString().split("T")[0]).order("date").limit(Number(req.query.limit) || 20);
      return res.json(data || []);
    }

    // /api/weekly-summary
    if (path === "weekly-summary") {
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
      const { data } = await supabase
        .from("weekly_summaries")
        .select("*")
        .order("week_end", { ascending: false })
        .limit(1);
      return res.json(data?.[0] || null);
    }

    // /api/financial-ratios
    if (path === "financial-ratios") {
      res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300");
      const period = req.query.period as string | undefined;
      const company = req.query.company as string | undefined;
      let query = supabase.from("financial_ratios").select("*").order("company");
      if (period) query = query.eq("period", period);
      if (company) query = query.ilike("company", `%${company}%`);
      const { data } = await query;
      if (company && (!data || data.length === 0)) {
        // Fallback: try matching where the search term contains the DB company name
        const { data: allData } = await supabase.from("financial_ratios").select("*").order("company");
        const cl = company.toLowerCase();
        const filtered = (allData || []).filter((r: any) => cl.includes(r.company.toLowerCase()) || r.company.toLowerCase().includes(cl));
        if (period) return res.json(filtered.filter((r: any) => r.period === period));
        return res.json(filtered);
      }
      return res.json(data || []);
    }

    // /api/financial-ratio-flags
    if (path === "financial-ratio-flags") {
      try {
        const period = req.query.period as string | undefined;
        const THRESHOLDS = [
          { field: "revenue_growth_yoy", label: "Revenue Growth YoY", threshold: 15, unit: "%", type: "revenue_anomaly" },
          { field: "cogs_sales_yoy_delta", label: "COGS / Sales", threshold: 2.0, unit: "pp", type: "margin_anomaly" },
          { field: "sga_sales_yoy_delta", label: "SG&A / Sales", threshold: 2.0, unit: "pp", type: "margin_anomaly" },
          { field: "ebitda_margin_yoy_delta", label: "EBITDA Margin", threshold: 2.0, unit: "pp", type: "margin_anomaly" },
        ];
        let query = supabase.from("financial_ratios").select("*").order("company");
        if (period) query = query.eq("period", period);
        const { data: ratios } = await query;

        // Compute the most-recent period across returned rows so we can mark
        // any unverified rows from that period with `unverified: true`.
        const mostRecentPeriod = (ratios || [])
          .map((r: any) => r.period)
          .filter(Boolean)
          .sort()
          .reverse()[0] || null;

        const flags: any[] = [];
        // Pre-fetch articles per company (one searchKB call each) to avoid N+1
        const companyArticleCache = new Map<string, any[]>();
        for (const row of (ratios || [])) {
          if (!companyArticleCache.has(row.company)) {
            const results = (await searchKB(row.company, 10)).filter(r => r.entry.type === "article").map(r => r.entry as any);
            results.sort((a: any, b: any) => {
              const catA = (a.category || "").toLowerCase().includes("earning") ? 1 : 0;
              const catB = (b.category || "").toLowerCase().includes("earning") ? 1 : 0;
              if (catB !== catA) return catB - catA;
              return (b.date || "").localeCompare(a.date || "");
            });
            companyArticleCache.set(row.company, results);
          }
          for (const t of THRESHOLDS) {
            const val = (row as any)[t.field];
            if (val == null || Math.abs(val) < t.threshold) continue;
            const direction = val < 0 ? "drop" : "surge";
            const results = companyArticleCache.get(row.company) || [];
            const best = results[0];
            const excerpt = best ? (best.content || "").split("\n").find((l: string) => l.trim().length > 40)?.trim().slice(0, 200) || "" : "";
            const isUnverified = row.manually_verified === false && row.period === mostRecentPeriod;
            flags.push({
              company: row.company, ticker: row.ticker, metric: t.field, metricLabel: t.label,
              value: val, unit: t.unit, direction,
              article: best ? { title: best.title, source: best.source, date: best.date, url: best.url, excerpt } : null,
              ...(isUnverified ? { unverified: true } : {}),
              verified_by: row.verified_by ?? null,
              verified_at: row.verified_at ?? null,
            });
          }
        }
        return res.json(flags);
      } catch (err: any) { console.error("financial-ratio-flags error:", err?.message); return res.json([]); }
    }

    // /api/articles
    if (path === "articles") {
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120");
      const q = req.query.q as string | undefined;
      const category = req.query.category as string | undefined;
      const company = req.query.company as string | undefined;
      const limit = Number(req.query.limit) || 50;

      let results: any[] = q
        ? (await searchKB(q, limit)).map(r => r.entry).filter(e => e.type === "article")
        : await getArticlesMeta(limit);

      if (category) results = results.filter((a: any) => a.category?.toLowerCase().includes(category.toLowerCase()));
      if (company) {
        const cl = company.toLowerCase();
        results = results.filter((a: any) => a.companies?.some((c: string) => c.toLowerCase().includes(cl) || cl.includes(c.toLowerCase())));
      }

      return res.json(results.slice(0, limit).map(({ content, ...rest }: any) => ({
        ...rest,
        summary: content ? content.slice(0, 250).replace(/\s+\S*$/, '') + '...' : '',
      })));
    }

    // /api/article/:slug
    if (path.startsWith("article/")) {
      const slug = path.replace("article/", "");
      const article = await getArticleBySlug(slug);
      if (!article) return res.status(404).json({ error: "Not found" });
      return res.json(article);
    }

    // /api/wiki/:slug
    if (path.startsWith("wiki/") && path !== "wiki") {
      const slug = path.replace("wiki/", "");
      const page = await getWikiBySlug(slug);
      if (!page) return res.status(404).json({ error: "Not found" });
      return res.json(page);
    }

    // /api/wiki
    if (path === "wiki" || path === "") {
      res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300");
      const type = req.query.type as string | undefined;
      const pages: any[] = [];

      if (!type || type === "company") {
        const companies = await getCompanies();
        pages.push(...companies.map(c => ({ id: c.slug, title: c.name, type: "company", frontmatter: { ticker: c.ticker, sector: c.sector, subsector: c.subsector } })));
      }
      if (!type || type === "market-driver") {
        const drivers = await getMarketDrivers();
        pages.push(...drivers.map(d => ({ id: d.slug, title: d.title, type: "market-driver", frontmatter: { current_signal: d.current_signal } })));
      }
      if (!type || type === "concept") {
        const concepts = await getConcepts();
        pages.push(...concepts.map(c => {
          let summary = '';
          if (c.content) {
            const overviewMatch = c.content.match(/## Overview\s*\n([\s\S]*?)(?=\n## |\n$)/);
            const text = (overviewMatch ? overviewMatch[1] : c.content).replace(/^#+\s.*/gm, '').trim();
            summary = text.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').slice(0, 250);
          }
          return { id: c.slug, title: c.title, type: "concept", frontmatter: { summary } };
        }));
      }
      return res.json(pages);
    }

    // /api/av-sections/:slug
    if (path?.startsWith("av-sections/")) {
      const slug = path.replace("av-sections/", "");
      const { data: sections } = await supabase
        .from("av_report_sections")
        .select("id, slug, title, description, section_order")
        .eq("slug", slug);
      if (!sections?.length) return res.status(404).json({ error: "Not found" });
      const section = sections[0];
      const { data: tagged } = await supabase
        .from("article_av_sections")
        .select("relevance_score, articles(id, slug, title, date, source, category)")
        .eq("section_id", section.id)
        .order("relevance_score", { ascending: false })
        .limit(50);
      return res.json({ ...section, articles: tagged || [] });
    }

    // /api/av-sections
    if (path === "av-sections") {
      const { data: sections } = await supabase
        .from("av_report_sections")
        .select("id, slug, title, description, section_order")
        .order("section_order");
      return res.json(sections || []);
    }

    // /api/av-coverage
    if (path === "av-coverage") {
      const { data } = await supabase
        .from("av_report_sections")
        .select("slug, title, section_order, article_av_sections(count)")
        .order("section_order");
      return res.json(data || []);
    }

    // /api/chat
    if (path === "chat") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const clientIp = (req.headers["x-forwarded-for"] as string || "unknown").split(",")[0].trim();
      if (isRateLimited(clientIp)) return res.status(429).json({ error: "Too many requests. Try again in a minute." });
      const { message, history } = req.body;
      const results = await searchKB(message, 15);

      if (process.env.ANTHROPIC_API_KEY) {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const anthropic = new Anthropic();
        const context = buildSearchContext(results);

        const msgs: any[] = [];
        if (history) for (const h of history.slice(-6)) msgs.push({ role: h.role, content: h.content });
        msgs.push({ role: "user", content: message });

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 2048,
          system: `${SYSTEM_PROMPT_PREFIX}\n\nKNOWLEDGE BASE CONTENT:\n${context}`,
          messages: msgs,
        });

        const text = response.content?.[0]?.type === "text" ? response.content[0].text : "";
        return res.json({ mode: "ai", answer: text, sources: buildSourceList(results) });
      } else {
        return res.json(buildSmartSearchResponse(results, message));
      }
    }

    // /api/synthesize-section — AI synthesis for one report section
    if (path === "synthesize-section") {
      if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
      const clientIp2 = (req.headers["x-forwarded-for"] as string || "unknown").split(",")[0].trim();
      if (isRateLimited(clientIp2)) return res.status(429).json({ error: "Too many requests. Try again in a minute." });
      const { startDate, endDate, section, sectionType } = req.body;
      if (!startDate || !endDate || !section) return res.status(400).json({ error: "startDate, endDate, section required" });

      // Fetch articles in date range
      let articles: any[];
      if (sectionType === "driver") {
        // For market drivers, search for articles mentioning the driver topic
        articles = (await searchKB(section, 50)).map(r => r.entry).filter((e: any) =>
          e.type === "article" && e.date >= startDate && e.date <= endDate
        );
      } else {
        // For news categories, filter by category
        const all = await getArticles(500);
        articles = all.filter(a => a.date >= startDate && a.date <= endDate && a.category === section);
      }

      if (!process.env.ANTHROPIC_API_KEY) {
        // KB-only fallback: extract data directly from articles
        const topArticles = articles.slice(0, 5);
        if (sectionType === "driver") {
          const dataPoints = topArticles.map((a: any) => a.title).filter(Boolean);
          const contentParts = topArticles.map((a: any) => {
            const firstLine = (a.content || "").split("\n").find((l: string) => l.trim().length > 40) || "";
            return firstLine.trim();
          }).filter(Boolean);
          return res.json({
            section, sectionType, articleCount: articles.length,
            direction: "Mixed",
            signal: topArticles[0]?.title || `${section} — ${articles.length} articles found in date range.`,
            content: contentParts.slice(0, 3).join(" ") || `${articles.length} articles related to ${section} were found between ${startDate} and ${endDate}.`,
            impact: `Based on ${articles.length} articles covering ${section}.`,
            dataPoints: dataPoints.slice(0, 5),
          });
        } else {
          const formattedArticles = topArticles.map((a: any) => ({
            title: a.title || "Untitled",
            source: a.source || "Unknown",
            analysis: (a.content || "").split("\n").find((l: string) => l.trim().length > 40)?.trim().slice(0, 300) || "",
            dataPoints: a.companies || [],
            url: a.url || "",
          }));
          return res.json({
            section, sectionType, articleCount: articles.length,
            content: `${articles.length} articles found for ${section} between ${startDate} and ${endDate}. Key sources include ${topArticles.map((a: any) => a.source).filter(Boolean).join(", ") || "various outlets"}.`,
            articles: formattedArticles,
          });
        }
      }

      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const anthropic = new Anthropic();

      const articleContext = articles.slice(0, 20).map((a: any, i: number) =>
        `[${i + 1}] "${a.title}" (${a.source}, ${a.date})\n${a.content?.slice(0, 1500) || ""}`
      ).join("\n\n---\n\n");

      const prompt = sectionType === "driver"
        ? `Analyze these articles about "${section}" in the building materials industry from ${startDate} to ${endDate}. Write:\n1. A 2-3 paragraph overview of the current state of this market driver\n2. An "Impact on Building Materials" paragraph explaining how this affects the industry\n3. A list of 4-6 key data points (numbers, percentages, dollar amounts)\n4. A one-word direction indicator: Up, Down, Stable, Mixed, Expanding, Tightening, Weakening\n5. A one-line signal summary (e.g. "30yr at 6.22%, down 25bps")\n\nRespond in JSON: { "content": "...", "impact": "...", "dataPoints": ["..."], "direction": "...", "signal": "..." }`
        : `Analyze these ${articles.length} articles in the "${section}" category for building materials from ${startDate} to ${endDate}. For each notable article, write:\n1. A detailed analysis paragraph (3-5 sentences)\n2. Key data points (numbers, percentages, dollar amounts)\n\nAlso write a 1-2 paragraph category overview summarizing the key themes.\n\nRespond in JSON: { "content": "category overview...", "articles": [{ "title": "...", "source": "...", "analysis": "...", "dataPoints": ["..."], "url": "..." }] }`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: "You are a building materials industry analyst writing a detailed professional report. Always respond with valid JSON only, no markdown fences.",
        messages: [{ role: "user", content: `${prompt}\n\nARTICLES:\n${articleContext}` }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "{}";
      try {
        const parsed = JSON.parse(text);
        return res.json({ section, sectionType, articleCount: articles.length, ...parsed });
      } catch {
        return res.json({ section, sectionType, articleCount: articles.length, content: text, articles: [] });
      }
    }

    // /api/executive-summary — synthesize executive summary from section summaries
    if (path === "executive-summary") {
      if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
      const clientIp3 = (req.headers["x-forwarded-for"] as string || "unknown").split(",")[0].trim();
      if (isRateLimited(clientIp3)) return res.status(429).json({ error: "Too many requests. Try again in a minute." });
      const { startDate, endDate, sectionSummaries } = req.body;

      if (!process.env.ANTHROPIC_API_KEY) {
        const categories = (sectionSummaries || []).filter((s: any) => s.sectionType === "category");
        const driversList = (sectionSummaries || []).filter((s: any) => s.sectionType === "driver");
        const totalArticles = categories.reduce((sum: number, s: any) => {
          const match = (s.content || "").match(/(\d+) articles/);
          return sum + (match ? parseInt(match[1]) : 0);
        }, 0);
        const driverSignals = driversList.map((d: any) => `${d.section}: ${d.direction || "Mixed"}`).join("; ");
        const summary = `Building Materials Intelligence Report for ${startDate} to ${endDate}.\n\nThis report covers ${totalArticles} articles across ${categories.length} news categories and ${driversList.length} market health drivers sourced from the knowledge base.\n\nMarket Driver Signals: ${driverSignals || "See individual driver sections for details."}\n\nNote: Set ANTHROPIC_API_KEY to enable AI-powered analysis and synthesis for richer executive summaries.`;
        return res.json({ summary });
      }

      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const anthropic = new Anthropic();

      const context = (sectionSummaries || []).map((s: any) =>
        `## ${s.section}\n${s.content || ""}\n${s.impact || ""}`
      ).join("\n\n");

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: "You are a building materials industry analyst. Write a concise, data-driven executive summary.",
        messages: [{ role: "user", content: `Write a 2-3 paragraph executive summary for a Building Materials & Building Products intelligence report covering ${startDate} to ${endDate}. Highlight the most important themes, key data points, and market implications.\n\nSECTION SUMMARIES:\n${context}` }],
      });

      const summary = response.content[0].type === "text" ? response.content[0].text : "";
      return res.json({ summary });
    }

    // /api/feedback
    if (path === "feedback") {
      if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
      const { message } = req.body;
      if (!message || typeof message !== "string" || message.trim().length === 0) return res.status(400).json({ error: "Message required" });
      await supabase.from("feedback").insert({ message: message.trim(), created_at: new Date().toISOString() });
      return res.json({ ok: true });
    }

    // /api/tracked-companies
    if (path === "tracked-companies") {
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
      const { TRACKED_COMPANIES } = await import("../lib/constants.js");
      return res.json(TRACKED_COMPANIES);
    }

    // /api/review-queue — query and manage the human review queue
    if (path === "review-queue") {
      if (req.method === "GET") {
        const status = req.query.status as string | undefined;
        const type = req.query.type as string | undefined;
        const limit = Number(req.query.limit) || 50;
        let query = supabase
          .from("human_review_queue")
          .select("*")
          .order("priority")
          .order("created_at", { ascending: false });
        if (status) query = query.eq("review_status", status);
        if (type) query = query.eq("queue_type", type);
        const { data } = await query.limit(limit);
        // Compute review_due_at inline: 48h SLA from created_at
        const enriched = (data || []).map((item: any) => {
          const createdMs = item.created_at ? Date.parse(item.created_at) : NaN;
          const dueAt = Number.isFinite(createdMs) ? new Date(createdMs + 48 * 60 * 60 * 1000).toISOString() : null;
          return { ...item, review_due_at: dueAt };
        });
        return res.json(enriched);
      }
      if (req.method === "POST") {
        // Update review status (approve, reject, modify, escalate)
        const { id, status: newStatus, notes, reviewedBy } = req.body;
        if (!id || !newStatus) return res.status(400).json({ error: "id and status required" });
        const validStatuses = ["pending", "approved", "rejected", "modified", "escalated"];
        if (!validStatuses.includes(newStatus)) return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });

        const { data: updated, error: updateErr } = await supabase
          .from("human_review_queue")
          .update({
            review_status: newStatus,
            reviewed_at: new Date().toISOString(),
            reviewed_by: reviewedBy || "api",
            review_notes: notes || null,
          })
          .eq("id", id)
          .select("reference_id, reference_table, queue_type")
          .single();

        if (updateErr) return res.status(500).json({ error: updateErr.message });

        // If approving an earnings article, promote it to report_ready
        if (newStatus === "approved" || newStatus === "modified") {
          if (updated.reference_table === "articles") {
            await supabase
              .from("articles")
              .update({
                report_ready: true,
                report_ready_timestamp: new Date().toISOString(),
                report_ready_reason: `human_reviewed_${updated.queue_type}`,
              })
              .eq("id", updated.reference_id);
          }
        }

        return res.json({ ok: true, id, status: newStatus });
      }
      return res.status(405).json({ error: "GET or POST required" });
    }

    // /api/review-queue/action — one-click approve/dismiss from email links
    if (path === "review-queue/action") {
      const id = req.query.id as string;
      const action = req.query.action as string;
      const key = req.query.key as string;

      // Light auth: service role key, CRON_SECRET, or "cron" shorthand
      const validKeys = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET, "cron"].filter(Boolean);
      if (!key || !validKeys.includes(key)) {
        return res.status(401).send(htmlPage("Unauthorized", "Invalid or missing key."));
      }
      if (!id || !action) {
        return res.status(400).send(htmlPage("Bad Request", "Missing id or action parameter."));
      }
      const validActions = ["approved", "rejected", "dismissed"];
      const status = action === "dismissed" ? "rejected" : action;
      if (!validActions.includes(action)) {
        return res.status(400).send(htmlPage("Bad Request", `Action must be one of: ${validActions.join(", ")}`));
      }

      // Fetch item context before updating
      const { data: item } = await supabase
        .from("human_review_queue")
        .select("id, queue_type, auto_context, reference_id, reference_table, review_status")
        .eq("id", id)
        .single();

      if (!item) {
        return res.send(htmlPage("Not Found", "This review item no longer exists."));
      }
      if (item.review_status !== "pending") {
        return res.send(htmlPage("Already Reviewed", `This item was already marked as <strong>${item.review_status}</strong>.`));
      }

      // Update the review item
      await supabase
        .from("human_review_queue")
        .update({
          review_status: status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: "email-action",
          review_notes: `One-click ${action} from email`,
        })
        .eq("id", id);

      // If approving, promote article to report_ready
      if (status === "approved" && item.reference_table === "articles") {
        await supabase
          .from("articles")
          .update({
            report_ready: true,
            report_ready_timestamp: new Date().toISOString(),
            report_ready_reason: `human_reviewed_${item.queue_type}`,
          })
          .eq("id", item.reference_id);
      }

      const verb = action === "approved" ? "Approved" : "Dismissed";
      const color = action === "approved" ? "#2E7D52" : "#B71C1C";
      return res.send(htmlPage(
        `${verb}`,
        `<p style="color:${color};font-size:18px;font-weight:bold">${verb}</p>
         <p style="color:#555">${(item.auto_context || "").slice(0, 200)}</p>
         <p><a href="https://building-materials-intel.vercel.app" style="color:#2E7D52">Back to Intelligence Platform</a></p>`
      ));
    }

    // /api/review-queue/stats — summary counts
    if (path === "review-queue/stats") {
      const { data } = await supabase
        .from("human_review_queue")
        .select("queue_type, review_status, priority");
      const stats: Record<string, Record<string, number>> = {};
      let totalPending = 0;
      for (const item of data || []) {
        if (!stats[item.queue_type]) stats[item.queue_type] = {};
        stats[item.queue_type][item.review_status] = (stats[item.queue_type][item.review_status] || 0) + 1;
        if (item.review_status === "pending") totalPending++;
      }
      return res.json({ totalPending, byType: stats });
    }

    // /api/healthcheck — independent staleness monitor for the ingest pipeline.
    // Lives in the main API (not daily-scan.ts) so it works even when the scan
    // function is broken. Called by the nightly trigger after the scan, and by
    // the Vercel cron as a second safety net.
    if (path === "healthcheck") {
      const key = req.query.key as string;
      const validKeys = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET, "cron"].filter(Boolean);
      if (!key || !validKeys.includes(key)) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Check the most recent article date
      const { data: latest } = await supabase
        .from("articles")
        .select("date, pull_timestamp")
        .order("date", { ascending: false })
        .limit(1)
        .single();

      const latestDate = latest?.date || "unknown";
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const latestMs = latest?.date ? Date.parse(latest.date + "T00:00:00Z") : 0;
      const staleHours = latestMs ? Math.round((now.getTime() - latestMs) / 36e5) : 999;
      const isStale = staleHours > 36;

      // Check daily_run_lock for today's run status
      const { data: todayRun } = await supabase
        .from("daily_run_lock")
        .select("status, articles_inserted, completed_at")
        .eq("run_date", todayStr)
        .maybeSingle();

      const scanStatus = todayRun
        ? { ran: true, status: todayRun.status, articles: todayRun.articles_inserted }
        : { ran: false, status: "no_run_today", articles: 0 };

      // If stale, send alert email (uses fetch to Resend directly so we don't
      // depend on lib/email.ts which could be the broken import)
      if (isStale && process.env.RESEND_API_KEY) {
        const alertHtml = `<div style="font-family:Arial,sans-serif;max-width:600px">
          <h2 style="color:#B71C1C">Pipeline Staleness Alert</h2>
          <p>The most recent article in the database is from <strong>${latestDate}</strong> (${staleHours}h ago).</p>
          <p><strong>Today's scan:</strong> ${scanStatus.ran ? `${scanStatus.status} (${scanStatus.articles} articles)` : "Did not run"}</p>
          <p>This likely means the <code>/api/daily-scan</code> function is broken. Check Vercel function logs.</p>
          <p><a href="https://building-materials-intel.vercel.app">Intelligence Platform</a></p>
        </div>`;

        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: process.env.RESEND_FROM_EMAIL || "Jarvis AI <onboarding@resend.dev>",
              to: ["gavin.gattuso@appliedvalue.com"],
              subject: `[PIPELINE DOWN] No articles ingested in ${staleHours}h — ${todayStr}`,
              html: alertHtml,
              tags: [{ name: "type", value: "pipeline-stale" }],
            }),
          });
        } catch { /* non-fatal */ }
      }

      return res.json({
        ok: !isStale,
        latestArticleDate: latestDate,
        staleHours,
        isStale,
        scanStatus,
        checkedAt: now.toISOString(),
      });
    }

    return res.status(404).json({ error: "Not found" });
  } catch (err: any) {
    console.error("API error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
