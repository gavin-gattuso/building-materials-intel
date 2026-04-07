import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- Types ----------

export interface Article {
  id: string;
  slug: string;
  title: string;
  date: string;
  source: string;
  url: string;
  category: string;
  companies: string[];
  content: string;
  type: "article";
}

export interface Company {
  slug: string;
  name: string;
  ticker: string;
  sector: string;
  subsector: string;
  content: string;
  type: "company";
}

export interface MarketDriver {
  slug: string;
  title: string;
  current_signal: string;
  content: string;
  type: "market-driver";
}

export interface Concept {
  slug: string;
  title: string;
  content: string;
  type: "concept";
}

export type WikiPage = (Company & { type: "company" }) | (MarketDriver & { type: "market-driver" }) | (Concept & { type: "concept" });

// ---------- Queries ----------

export async function getArticles(limit = 200): Promise<Article[]> {
  const { data: articles } = await supabase
    .from("articles")
    .select("id, slug, title, date, source, url, category, content")
    .order("date", { ascending: false })
    .limit(limit);

  if (!articles || articles.length === 0) return [];

  // Batch-fetch company associations
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

  return articles.map(a => ({
    ...a,
    companies: companyMap[a.id] || [],
    type: "article" as const,
  }));
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const { data } = await supabase
    .from("articles")
    .select("id, slug, title, date, source, url, category, content")
    .eq("slug", slug)
    .single();

  if (!data) return null;

  const { data: junctions } = await supabase
    .from("article_companies")
    .select("companies(name)")
    .eq("article_id", data.id);

  const companies = (junctions as any[] || []).map(j => j.companies?.name).filter(Boolean);

  return { ...data, companies, type: "article" };
}

export async function getCompanies(): Promise<Company[]> {
  const { data } = await supabase
    .from("companies")
    .select("slug, name, ticker, sector, subsector, content")
    .order("name");

  return (data || []).map(c => ({ ...c, type: "company" as const }));
}

export async function getCompanyBySlug(slug: string): Promise<Company | null> {
  const { data } = await supabase
    .from("companies")
    .select("slug, name, ticker, sector, subsector, content")
    .eq("slug", slug)
    .single();

  return data ? { ...data, type: "company" } : null;
}

export async function getMarketDrivers(): Promise<MarketDriver[]> {
  const { data } = await supabase
    .from("market_drivers")
    .select("slug, title, current_signal, content")
    .order("title");

  return (data || []).map(d => ({ ...d, type: "market-driver" as const }));
}

export async function getMarketDriverBySlug(slug: string): Promise<MarketDriver | null> {
  const { data } = await supabase
    .from("market_drivers")
    .select("slug, title, current_signal, content")
    .eq("slug", slug)
    .single();

  return data ? { ...data, type: "market-driver" } : null;
}

export async function getConcepts(): Promise<Concept[]> {
  const { data } = await supabase
    .from("concepts")
    .select("slug, title, content")
    .order("title");

  return (data || []).map(c => ({ ...c, type: "concept" as const }));
}

export async function getConceptBySlug(slug: string): Promise<Concept | null> {
  const { data } = await supabase
    .from("concepts")
    .select("slug, title, content")
    .eq("slug", slug)
    .single();

  return data ? { ...data, type: "concept" } : null;
}

export async function getStats() {
  const [
    { count: totalArticles },
    { count: totalCompanies },
    { count: totalDrivers },
    { count: totalConcepts },
  ] = await Promise.all([
    supabase.from("articles").select("*", { count: "exact", head: true }),
    supabase.from("companies").select("*", { count: "exact", head: true }),
    supabase.from("market_drivers").select("*", { count: "exact", head: true }),
    supabase.from("concepts").select("*", { count: "exact", head: true }),
  ]);

  // Category breakdown
  const { data: articles } = await supabase
    .from("articles")
    .select("category, date");

  const byCategory: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  let earliest = "9999";
  let latest = "0000";

  for (const a of articles || []) {
    byCategory[a.category] = (byCategory[a.category] || 0) + 1;
    const month = (a.date || "").slice(0, 7);
    if (month) byMonth[month] = (byMonth[month] || 0) + 1;
    if (a.date < earliest) earliest = a.date;
    if (a.date > latest) latest = a.date;
  }

  // Company mention counts via junction table
  const { data: junctions } = await supabase
    .from("article_companies")
    .select("companies(name)");

  const companyMentions: Record<string, number> = {};
  for (const j of (junctions as any[] || [])) {
    const name = j.companies?.name;
    if (name) companyMentions[name] = (companyMentions[name] || 0) + 1;
  }

  return {
    totalArticles: totalArticles || 0,
    totalWikiPages: (totalCompanies || 0) + (totalDrivers || 0) + (totalConcepts || 0),
    companies: totalCompanies || 0,
    marketDrivers: totalDrivers || 0,
    concepts: totalConcepts || 0,
    byCategory,
    byMonth,
    companyMentions,
    dateRange: (articles || []).length > 0 ? { from: earliest, to: latest } : null,
  };
}

// ---------- Search ----------

const SYNONYMS: Record<string, string[]> = {
  "tariff": ["tariffs", "tariff", "duties", "trade policy", "section 232", "ieepa"],
  "steel": ["steel", "metals", "iron", "nucor", "arcelormittal", "steel dynamics"],
  "lumber": ["lumber", "wood", "timber", "softwood", "canfor", "interfor", "west fraser", "weyerhaeuser"],
  "cement": ["cement", "concrete", "aggregates", "ready-mix", "crh", "cemex", "holcim", "heidelberg", "vulcan", "martin marietta"],
  "rates": ["rates", "interest", "mortgage", "fed", "fomc", "federal reserve"],
  "labor": ["labor", "workforce", "workers", "employment", "hiring", "wages"],
  "housing": ["housing", "residential", "homes", "homebuilder", "starts", "permits", "nahb"],
  "infrastructure": ["infrastructure", "iija", "highway", "bridges", "public construction"],
  "m&a": ["m&a", "acquisition", "merger", "deal", "acquired", "takeover", "buyout"],
  "earnings": ["earnings", "revenue", "profit", "ebitda", "results", "quarterly", "guidance"],
  "hvac": ["hvac", "carrier", "daikin", "trane", "johnson controls", "heating", "cooling", "climate"],
  "plumbing": ["plumbing", "drainage", "fixtures", "masco", "fortune brands", "geberit", "advanced drainage"],
  "doors": ["doors", "windows", "assa abloy", "jeld-wen", "lixil", "sanwa"],
  "insulation": ["insulation", "glass", "owens corning", "saint-gobain", "agc", "fiberglass", "roofing"],
};

function expandTerms(terms: string[]): string[] {
  const expanded = new Set(terms);
  for (const term of terms) {
    for (const [, synonyms] of Object.entries(SYNONYMS)) {
      if (synonyms.some(s => s.includes(term) || term.includes(s))) {
        for (const s of synonyms) expanded.add(s);
      }
    }
  }
  return [...expanded];
}

export interface SearchResult {
  entry: Article | (WikiPage & { id?: string });
  score: number;
  excerpts: string[];
  matchedTerms: string[];
}

function extractExcerpts(text: string, terms: string[], maxExcerpts = 3): string[] {
  const lines = text.split("\n").filter(l => l.trim() && !l.startsWith("---") && !l.startsWith("#"));
  const excerpts: { line: string; score: number }[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (lower.includes(term)) score++;
    }
    if (score > 0) {
      const clean = line.replace(/^[-*]\s+/, "").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
      if (clean.length > 20) excerpts.push({ line: clean, score });
    }
  }
  excerpts.sort((a, b) => b.score - a.score);
  return excerpts.slice(0, maxExcerpts).map(e => e.line);
}

export async function searchKB(query: string, limit = 20): Promise<SearchResult[]> {
  const rawTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  // Fetch all data in parallel for in-memory scoring (same as before)
  const [articles, companies, drivers, concepts] = await Promise.all([
    getArticles(500),
    getCompanies(),
    getMarketDrivers(),
    getConcepts(),
  ]);

  if (rawTerms.length === 0) {
    return articles.slice(0, limit).map(a => ({ entry: a, score: 1, excerpts: [], matchedTerms: [] }));
  }

  const terms = expandTerms(rawTerms);

  function score(entry: any): { score: number; matchedTerms: string[] } {
    const matched = new Set<string>();
    let s = 0;
    const title = entry.title || entry.name || "";
    const content = entry.content || "";
    const titleLower = title.toLowerCase();
    const contentLower = content.toLowerCase();
    const metaText = entry.type === "article"
      ? `${entry.category} ${(entry.companies || []).join(" ")} ${entry.source}`.toLowerCase()
      : "";

    for (const term of terms) {
      if (titleLower.includes(term)) { s += 30; matched.add(term); }
      if (metaText.includes(term)) { s += 20; matched.add(term); }
      if (contentLower.includes(term)) {
        s += 10;
        matched.add(term);
        const count = Math.min(5, (contentLower.split(term).length - 1));
        s += count * 2;
      }
    }
    for (const term of rawTerms) {
      if (titleLower.includes(term)) s += 15;
      if (contentLower.includes(term)) s += 5;
    }
    if (entry.type === "article" && entry.date) {
      const daysAgo = (Date.now() - new Date(entry.date).getTime()) / 86400000;
      if (daysAgo < 7) s += 10;
      else if (daysAgo < 30) s += 5;
    }
    if (entry.type !== "article") s += 5;
    return { score: s, matchedTerms: [...matched] };
  }

  const scored: SearchResult[] = [];

  for (const a of articles) {
    const { score: s, matchedTerms: mt } = score(a);
    if (s > 0) scored.push({ entry: a, score: s, excerpts: extractExcerpts(a.content, rawTerms), matchedTerms: mt });
  }
  const wikiEntries: WikiPage[] = [
    ...companies.map(c => ({ ...c, title: c.name, type: "company" as const })),
    ...drivers,
    ...concepts,
  ];
  for (const w of wikiEntries) {
    const { score: s, matchedTerms: mt } = score(w);
    if (s > 0) scored.push({ entry: w as any, score: s, excerpts: extractExcerpts(w.content, rawTerms), matchedTerms: mt });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
