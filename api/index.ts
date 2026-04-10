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
    .select("id, slug, title, date, source, url, category")
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
          { field: "revenue_growth_yoy", label: "Revenue Growth YoY", threshold: 15, unit: "%" },
          { field: "cogs_sales_yoy_delta", label: "COGS / Sales", threshold: 2.0, unit: "pp" },
          { field: "sga_sales_yoy_delta", label: "SG&A / Sales", threshold: 1.5, unit: "pp" },
          { field: "ebitda_margin_yoy_delta", label: "EBITDA Margin", threshold: 3.0, unit: "pp" },
        ];
        let query = supabase.from("financial_ratios").select("*").order("company");
        if (period) query = query.eq("period", period);
        const { data: ratios } = await query;
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
            flags.push({
              company: row.company, ticker: row.ticker, metric: t.field, metricLabel: t.label,
              value: val, unit: t.unit, direction,
              article: best ? { title: best.title, source: best.source, date: best.date, url: best.url, excerpt } : null,
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

    return res.status(404).json({ error: "Not found" });
  } catch (err: any) {
    console.error("API error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
