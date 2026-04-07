import { readdir, readFile } from "fs/promises";
import { join } from "path";
import matter from "gray-matter";
import { expandTerms, extractExcerpts, scoreEntry } from "../lib/search";

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

// Search uses shared utilities from lib/search.ts (single source of truth for synonyms, scoring, excerpts)

export function searchKB(query: string, limit = 20): SearchResult[] {
  const rawTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (rawTerms.length === 0) {
    return articles.slice(0, limit).map(a => ({ entry: a, score: 1, excerpts: [], matchedTerms: [] }));
  }

  const terms = expandTerms(rawTerms);
  const scored: SearchResult[] = [];

  for (const a of articles) {
    const { score: s, matchedTerms: mt } = scoreEntry(a, terms, rawTerms);
    if (s > 0) {
      scored.push({ entry: a, score: s, excerpts: extractExcerpts(a.content, rawTerms), matchedTerms: mt });
    }
  }
  for (const w of wikiPages) {
    const { score: s, matchedTerms: mt } = scoreEntry(w, terms, rawTerms);
    if (s > 0) {
      scored.push({ entry: w, score: s, excerpts: extractExcerpts(w.content, rawTerms), matchedTerms: mt });
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
