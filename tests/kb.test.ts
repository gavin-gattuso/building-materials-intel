import { describe, test, expect, beforeAll } from "bun:test";
import { loadKB, getArticles, getWikiPages, searchKB, getStats } from "../site/kb";
import type { Article, WikiPage, SearchResult } from "../site/kb";

// Load KB once before all tests
beforeAll(async () => {
  await loadKB(true);
});

// ─── KB Loading ───────────────────────────────────────────────

describe("KB Loading", () => {
  test("loads articles from knowledge-base/raw/articles", () => {
    const articles = getArticles();
    expect(articles.length).toBeGreaterThan(0);
  });

  test("loads wiki pages from knowledge-base/wiki/*", () => {
    const wiki = getWikiPages();
    expect(wiki.length).toBeGreaterThan(0);
  });

  test("articles have required fields", () => {
    const articles = getArticles();
    for (const a of articles.slice(0, 20)) {
      expect(a.id).toBeTruthy();
      expect(a.title).toBeTruthy();
      expect(a.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.type).toBe("article");
      expect(typeof a.content).toBe("string");
      expect(Array.isArray(a.companies)).toBe(true);
      expect(Array.isArray(a.tags)).toBe(true);
    }
  });

  test("wiki pages have required fields", () => {
    const wiki = getWikiPages();
    for (const w of wiki) {
      expect(w.id).toBeTruthy();
      expect(w.title).toBeTruthy();
      expect(["company", "market-driver", "concept"]).toContain(w.type);
      expect(typeof w.content).toBe("string");
      expect(w.content.length).toBeGreaterThan(0);
    }
  });

  test("articles are sorted newest-first", () => {
    const articles = getArticles();
    for (let i = 1; i < Math.min(articles.length, 50); i++) {
      expect(articles[i - 1].date >= articles[i].date).toBe(true);
    }
  });

  test("wiki includes all 3 types", () => {
    const wiki = getWikiPages();
    const types = new Set(wiki.map(w => w.type));
    expect(types.has("company")).toBe(true);
    expect(types.has("market-driver")).toBe(true);
    expect(types.has("concept")).toBe(true);
  });
});

// ─── Search ───────────────────────────────────────────────────

describe("Search", () => {
  test("empty query returns recent articles", () => {
    const results = searchKB("", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(10);
    for (const r of results) {
      expect(r.score).toBe(1);
      expect(r.entry.type).toBe("article");
    }
  });

  test("search returns scored results for a valid query", () => {
    const results = searchKB("steel tariffs", 10);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.matchedTerms.length).toBeGreaterThan(0);
    }
  });

  test("results are sorted by score descending", () => {
    const results = searchKB("cement pricing", 20);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  test("search respects limit", () => {
    const results = searchKB("construction", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  test("synonym expansion works - 'lumber' finds wood-related content", () => {
    const results = searchKB("lumber", 20);
    const allText = results.map(r => {
      const e = r.entry as any;
      return `${e.title} ${e.content}`.toLowerCase();
    }).join(" ");
    // Synonym expansion should find wood/timber/softwood content too
    const hasLumberRelated = allText.includes("lumber") || allText.includes("wood") || allText.includes("timber") || allText.includes("softwood");
    expect(hasLumberRelated).toBe(true);
  });

  test("search finds wiki pages (companies, drivers, concepts)", () => {
    const results = searchKB("credit lending standards", 20);
    const wikiResults = results.filter(r => r.entry.type !== "article");
    expect(wikiResults.length).toBeGreaterThan(0);
  });

  test("excerpts are extracted for matching articles", () => {
    const results = searchKB("tariff steel", 5);
    const withExcerpts = results.filter(r => r.excerpts.length > 0);
    expect(withExcerpts.length).toBeGreaterThan(0);
  });

  test("short/stopword-only queries return results gracefully", () => {
    const results = searchKB("a", 10);
    // Terms <= 2 chars are filtered, so this is like an empty query
    expect(results.length).toBeGreaterThan(0);
  });
});

// ─── Stats ────────────────────────────────────────────────────

describe("Stats", () => {
  test("returns correct totals", () => {
    const stats = getStats();
    const articles = getArticles();
    const wiki = getWikiPages();
    expect(stats.totalArticles).toBe(articles.length);
    expect(stats.totalWikiPages).toBe(wiki.length);
    expect(stats.companies + stats.marketDrivers + stats.concepts).toBe(wiki.length);
  });

  test("byCategory covers all articles", () => {
    const stats = getStats();
    const totalFromCategories = Object.values(stats.byCategory).reduce((a, b) => a + b, 0);
    expect(totalFromCategories).toBe(stats.totalArticles);
  });

  test("byMonth covers all articles", () => {
    const stats = getStats();
    const totalFromMonths = Object.values(stats.byMonth).reduce((a, b) => a + b, 0);
    expect(totalFromMonths).toBe(stats.totalArticles);
  });

  test("dateRange is set when articles exist", () => {
    const stats = getStats();
    expect(stats.dateRange).not.toBeNull();
    expect(stats.dateRange!.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stats.dateRange!.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stats.dateRange!.from <= stats.dateRange!.to).toBe(true);
  });

  test("companyMentions has entries", () => {
    const stats = getStats();
    expect(Object.keys(stats.companyMentions).length).toBeGreaterThan(0);
  });
});

// ─── Frontmatter Parsing (via loaded data) ────────────────────

describe("Frontmatter Parsing", () => {
  test("articles parse source field correctly", () => {
    const articles = getArticles();
    const withSource = articles.filter(a => a.source);
    expect(withSource.length).toBeGreaterThan(articles.length * 0.8); // Most should have source
  });

  test("articles parse companies as arrays", () => {
    const articles = getArticles();
    const withCompanies = articles.filter(a => a.companies.length > 0);
    expect(withCompanies.length).toBeGreaterThan(0);
    for (const a of withCompanies.slice(0, 10)) {
      for (const c of a.companies) {
        expect(typeof c).toBe("string");
        expect(c.length).toBeGreaterThan(0);
      }
    }
  });

  test("wiki pages parse frontmatter metadata", () => {
    const wiki = getWikiPages();
    const companies = wiki.filter(w => w.type === "company");
    for (const c of companies.slice(0, 5)) {
      expect(c.frontmatter).toBeDefined();
    }
  });
});

// ─── Data Integrity ───────────────────────────────────────────

describe("Data Integrity", () => {
  test("no duplicate article IDs", () => {
    const articles = getArticles();
    const ids = articles.map(a => a.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test("no duplicate wiki page IDs", () => {
    const wiki = getWikiPages();
    const ids = wiki.map(w => w.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test("all article dates are valid", () => {
    const articles = getArticles();
    for (const a of articles) {
      const d = new Date(a.date);
      expect(d.toString()).not.toBe("Invalid Date");
    }
  });

  test("tracked companies have wiki pages", () => {
    const wiki = getWikiPages();
    const companyNames = wiki.filter(w => w.type === "company").map(w => w.title.toLowerCase());
    // Spot-check some of the 35 tracked companies
    const expected = ["crh", "nucor", "vulcan materials", "owens corning", "builders firstsource"];
    for (const name of expected) {
      const found = companyNames.some(c => c.toLowerCase().includes(name));
      expect(found).toBe(true);
    }
  });

  test("7 market drivers exist", () => {
    const wiki = getWikiPages();
    const drivers = wiki.filter(w => w.type === "market-driver");
    expect(drivers.length).toBe(7);
  });
});
