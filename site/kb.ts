import { readdir, readFile } from "fs/promises";
import { join } from "path";
import matter from "gray-matter";

const KB_ROOT = join(import.meta.dir, "..", "knowledge-base");

export interface Article {
  id: string;
  title: string;
  date: string;
  source: string;
  url: string;
  category: string;
  companies: string[];
  tags: string[];
  content: string;
  type: "article";
}

export interface WikiPage {
  id: string;
  title: string;
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  type: "company" | "market-driver" | "concept" | "foundational";
}

export type KBEntry = Article | WikiPage;

export interface SearchResult {
  entry: KBEntry;
  score: number;
  excerpts: string[];
  matchedTerms: string[];
}

let articles: Article[] = [];
let wikiPages: WikiPage[] = [];
let lastLoad = 0;

async function readMarkdownDir(dir: string): Promise<{ frontmatter: Record<string, unknown>; content: string; filename: string }[]> {
  try {
    const files = await readdir(dir);
    const results = await Promise.all(
      files.filter(f => f.endsWith(".md")).map(async (f) => {
        const raw = await readFile(join(dir, f), "utf-8");
        const { data, content } = matter(raw);
        return { frontmatter: data, content, filename: f };
      })
    );
    return results;
  } catch {
    return [];
  }
}

export async function loadKB(force = false) {
  const now = Date.now();
  if (!force && now - lastLoad < 60_000 && articles.length > 0) return;
  lastLoad = now;

  const rawArticles = await readMarkdownDir(join(KB_ROOT, "raw", "articles"));
  articles = rawArticles.map(({ frontmatter: fm, content, filename }) => ({
    id: filename.replace(/\.md$/, ""),
    title: content.split("\n").find(l => l.startsWith("# "))?.replace(/^#\s+/, "") || filename,
    date: fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : String(fm.date || "").slice(0, 10),
    source: String(fm.source || ""),
    url: String(fm.url || ""),
    category: String(fm.category || ""),
    companies: Array.isArray(fm.companies) ? fm.companies : [],
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    content,
    type: "article",
  }));
  articles.sort((a, b) => b.date.localeCompare(a.date));

  wikiPages = [];
  const wikiDirs: { dir: string; type: WikiPage["type"] }[] = [
    { dir: join(KB_ROOT, "wiki", "companies"), type: "company" },
    { dir: join(KB_ROOT, "wiki", "market-drivers"), type: "market-driver" },
    { dir: join(KB_ROOT, "wiki", "concepts"), type: "concept" },
    { dir: join(KB_ROOT, "wiki", "foundational"), type: "foundational" },
  ];
  for (const { dir, type } of wikiDirs) {
    const pages = await readMarkdownDir(dir);
    for (const { frontmatter, content, filename } of pages) {
      wikiPages.push({
        id: filename.replace(/\.md$/, ""),
        title: String(frontmatter.title || content.split("\n").find(l => l.startsWith("# "))?.replace(/^#\s+/, "") || filename),
        path: `wiki/${type === "company" ? "companies" : type === "market-driver" ? "market-drivers" : type === "foundational" ? "foundational" : "concepts"}/${filename}`,
        content,
        frontmatter,
        type,
      });
    }
  }
}

export function getArticles() { return articles; }
export function getWikiPages() { return wikiPages; }

// Expand common abbreviations and synonyms for better recall
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
  "cycle": ["cycle", "cycles", "cyclical", "boom", "bust", "downturn", "recovery", "recession", "historical"],
  "supply chain": ["supply chain", "value chain", "distribution", "logistics", "channel"],
  "consolidation": ["consolidation", "roll-up", "rollup", "platform", "private equity"],
  "regulation": ["regulation", "code", "building code", "compliance", "epa", "osha", "ibc"],
  "technology": ["technology", "innovation", "prefab", "modular", "offsite", "bim", "digitalization", "3d printing"],
  "sustainability": ["sustainability", "decarbonization", "embodied carbon", "green", "epd", "leed", "net zero"],
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
      // Clean markdown formatting
      const clean = line.replace(/^[-*]\s+/, "").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
      if (clean.length > 20) excerpts.push({ line: clean, score });
    }
  }

  excerpts.sort((a, b) => b.score - a.score);
  return excerpts.slice(0, maxExcerpts).map(e => e.line);
}

export function searchKB(query: string, limit = 20): SearchResult[] {
  const rawTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (rawTerms.length === 0) {
    return articles.slice(0, limit).map(a => ({ entry: a, score: 1, excerpts: [], matchedTerms: [] }));
  }

  const terms = expandTerms(rawTerms);

  function score(entry: KBEntry): { score: number; matchedTerms: string[] } {
    const matched = new Set<string>();
    let s = 0;

    const title = entry.type === "article" ? entry.title : entry.title;
    const content = entry.content;
    const titleLower = title.toLowerCase();
    const contentLower = content.toLowerCase();

    // Extra searchable fields for articles
    const metaText = entry.type === "article"
      ? `${entry.category} ${entry.companies.join(" ")} ${entry.tags.join(" ")} ${entry.source}`.toLowerCase()
      : "";

    for (const term of terms) {
      // Title match (highest value)
      if (titleLower.includes(term)) { s += 30; matched.add(term); }
      // Meta match (category, companies, tags)
      if (metaText.includes(term)) { s += 20; matched.add(term); }
      // Content match
      if (contentLower.includes(term)) {
        s += 10;
        matched.add(term);
        // Bonus for frequency (up to 5 occurrences)
        const count = Math.min(5, (contentLower.split(term).length - 1));
        s += count * 2;
      }
    }

    // Bonus for matching original (non-expanded) terms
    for (const term of rawTerms) {
      if (titleLower.includes(term)) s += 15;
      if (contentLower.includes(term)) s += 5;
    }

    // Recency bonus for articles (newer = higher)
    if (entry.type === "article" && entry.date) {
      const daysAgo = (Date.now() - new Date(entry.date).getTime()) / 86400000;
      if (daysAgo < 7) s += 10;
      else if (daysAgo < 30) s += 5;
    }

    // Wiki pages get a slight boost (they're synthesized knowledge)
    if (entry.type !== "article") s += 5;

    return { score: s, matchedTerms: [...matched] };
  }

  const scored: SearchResult[] = [];

  for (const a of articles) {
    const { score: s, matchedTerms: mt } = score(a);
    if (s > 0) {
      const excerpts = extractExcerpts(a.content, rawTerms);
      scored.push({ entry: a, score: s, excerpts, matchedTerms: mt });
    }
  }
  for (const w of wikiPages) {
    const { score: s, matchedTerms: mt } = score(w);
    if (s > 0) {
      const excerpts = extractExcerpts(w.content, rawTerms);
      scored.push({ entry: w, score: s, excerpts, matchedTerms: mt });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function getStats() {
  const byCategory: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  const companyMentions: Record<string, number> = {};

  for (const a of articles) {
    byCategory[a.category] = (byCategory[a.category] || 0) + 1;
    const month = a.date.slice(0, 7);
    if (month) byMonth[month] = (byMonth[month] || 0) + 1;
    for (const c of a.companies) {
      companyMentions[c] = (companyMentions[c] || 0) + 1;
    }
  }

  return {
    totalArticles: articles.length,
    totalWikiPages: wikiPages.length,
    companies: wikiPages.filter(w => w.type === "company").length,
    marketDrivers: wikiPages.filter(w => w.type === "market-driver").length,
    concepts: wikiPages.filter(w => w.type === "concept").length,
    foundational: wikiPages.filter(w => w.type === "foundational").length,
    byCategory,
    byMonth,
    companyMentions,
    dateRange: articles.length > 0
      ? { from: articles[articles.length - 1].date, to: articles[0].date }
      : null,
  };
}
