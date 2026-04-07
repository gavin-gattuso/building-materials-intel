import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  (process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co").trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
);

// ---------- Data access ----------

async function getArticles(limit = 200) {
  const { data: articles } = await supabase
    .from("articles")
    .select("id, slug, title, date, source, url, category, content")
    .order("date", { ascending: false })
    .limit(limit);
  if (!articles || articles.length === 0) return [];

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

async function getArticleBySlug(slug: string) {
  const { data } = await supabase.from("articles").select("id, slug, title, date, source, url, category, content").eq("slug", slug).single();
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
  const { data: company } = await supabase.from("companies").select("slug, name, ticker, sector, subsector, content").eq("slug", slug).single();
  if (company) return { id: company.slug, title: company.name, type: "company", content: company.content, frontmatter: { ticker: company.ticker, sector: company.sector, subsector: company.subsector } };

  const { data: driver } = await supabase.from("market_drivers").select("slug, title, current_signal, content").eq("slug", slug).single();
  if (driver) return { id: driver.slug, title: driver.title, type: "market-driver", content: driver.content, frontmatter: { current_signal: driver.current_signal } };

  const { data: concept } = await supabase.from("concepts").select("slug, title, content").eq("slug", slug).single();
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

const SYNONYMS: Record<string, string[]> = {
  "tariff": ["tariffs", "tariff", "duties", "trade policy"],
  "steel": ["steel", "metals", "iron", "nucor", "arcelormittal"],
  "lumber": ["lumber", "wood", "timber", "softwood"],
  "cement": ["cement", "concrete", "aggregates", "ready-mix", "crh", "cemex", "holcim"],
  "rates": ["rates", "interest", "mortgage", "fed", "federal reserve"],
  "labor": ["labor", "workforce", "workers", "employment", "hiring"],
  "housing": ["housing", "residential", "homes", "homebuilder", "starts", "permits"],
  "m&a": ["m&a", "acquisition", "merger", "deal", "acquired", "takeover"],
  "earnings": ["earnings", "revenue", "profit", "ebitda", "results", "quarterly"],
  "hvac": ["hvac", "carrier", "daikin", "trane", "johnson controls"],
  "insulation": ["insulation", "glass", "owens corning", "saint-gobain", "roofing"],
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

function extractExcerpts(text: string, terms: string[], max = 3): string[] {
  const lines = text.split("\n").filter(l => l.trim() && !l.startsWith("---") && !l.startsWith("#"));
  const scored: { line: string; score: number }[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    let s = 0;
    for (const t of terms) { if (lower.includes(t)) s++; }
    if (s > 0) {
      const clean = line.replace(/^[-*]\s+/, "").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
      if (clean.length > 20) scored.push({ line: clean, score: s });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map(e => e.line);
}

async function searchKB(query: string, limit = 20) {
  const rawTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const [articles, companies, drivers, concepts] = await Promise.all([
    getArticles(500), getCompanies(), getMarketDrivers(), getConcepts(),
  ]);

  if (rawTerms.length === 0) {
    return articles.slice(0, limit).map(a => ({ entry: a, score: 1, excerpts: [] as string[], matchedTerms: [] as string[] }));
  }

  const terms = expandTerms(rawTerms);

  function score(entry: any) {
    const matched = new Set<string>();
    let s = 0;
    const title = (entry.title || entry.name || "").toLowerCase();
    const content = (entry.content || "").toLowerCase();
    const meta = entry.type === "article" ? `${entry.category} ${(entry.companies || []).join(" ")} ${entry.source}`.toLowerCase() : "";

    for (const term of terms) {
      if (title.includes(term)) { s += 30; matched.add(term); }
      if (meta.includes(term)) { s += 20; matched.add(term); }
      if (content.includes(term)) { s += 10; matched.add(term); s += Math.min(5, content.split(term).length - 1) * 2; }
    }
    for (const term of rawTerms) {
      if (title.includes(term)) s += 15;
      if (content.includes(term)) s += 5;
    }
    if (entry.type === "article" && entry.date) {
      const days = (Date.now() - new Date(entry.date).getTime()) / 86400000;
      if (days < 7) s += 10; else if (days < 30) s += 5;
    }
    if (entry.type !== "article") s += 5;
    return { score: s, matchedTerms: [...matched] };
  }

  const results: any[] = [];
  for (const a of articles) {
    const r = score(a);
    if (r.score > 0) results.push({ entry: a, score: r.score, excerpts: extractExcerpts(a.content, rawTerms), matchedTerms: r.matchedTerms });
  }
  const wiki = [
    ...companies.map(c => ({ ...c, title: c.name })),
    ...drivers,
    ...concepts,
  ];
  for (const w of wiki) {
    const r = score(w);
    if (r.score > 0) results.push({ entry: w, score: r.score, excerpts: extractExcerpts(w.content, rawTerms), matchedTerms: r.matchedTerms });
  }

  results.sort((a: any, b: any) => b.score - a.score);
  return results.slice(0, limit);
}

// ---------- Router ----------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const path = (req.url || "").replace(/^\/api\/?/, "").split("?")[0];

  try {
    // /api/stats
    if (path === "stats") {
      return res.json(await getStats());
    }

    // /api/mode
    if (path === "mode") {
      return res.json({ aiEnabled: !!process.env.ANTHROPIC_API_KEY });
    }

    // /api/articles
    if (path === "articles") {
      const q = req.query.q as string | undefined;
      const category = req.query.category as string | undefined;
      const company = req.query.company as string | undefined;
      const limit = Number(req.query.limit) || 50;

      let results: any[] = q
        ? (await searchKB(q, limit)).map(r => r.entry).filter(e => e.type === "article")
        : await getArticles(limit);

      if (category) results = results.filter((a: any) => a.category?.toLowerCase().includes(category.toLowerCase()));
      if (company) results = results.filter((a: any) => a.companies?.some((c: string) => c.toLowerCase().includes(company.toLowerCase())));

      return res.json(results.slice(0, limit).map(({ content, ...rest }: any) => rest));
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
        pages.push(...concepts.map(c => ({ id: c.slug, title: c.title, type: "concept", frontmatter: {} })));
      }
      return res.json(pages);
    }

    // /api/chat
    if (path === "chat") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const { message, history } = req.body;
      const results = await searchKB(message, 15);

      if (process.env.ANTHROPIC_API_KEY) {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const anthropic = new Anthropic();
        const context = results.map((r: any, i: number) => {
          const e = r.entry;
          if (e.type === "article") return `[SOURCE ${i + 1}] ${e.title}\nDate: ${e.date} | Source: ${e.source} | Category: ${e.category}\n${e.content}`;
          return `[SOURCE ${i + 1}] Wiki: ${e.title || e.name} (${e.type})\n${e.content}`;
        }).join("\n\n---\n\n");

        const msgs: any[] = [];
        if (history) for (const h of history.slice(-6)) msgs.push({ role: h.role, content: h.content });
        msgs.push({ role: "user", content: message });

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 2048,
          system: `You are an AI research assistant for the Building Materials & Building Products industry knowledge base.\nRULES:\n1. Answer ONLY from KB content below. If not in KB, say so.\n2. ALWAYS cite sources as [Source N].\n3. Be specific and data-driven.\n\nKNOWLEDGE BASE:\n${context}`,
          messages: msgs,
        });

        const text = response.content[0].type === "text" ? response.content[0].text : "";
        const sources = results.map((r: any, i: number) => {
          const e = r.entry;
          return { index: i + 1, id: e.slug, title: e.title || e.name, type: e.type, ...(e.type === "article" ? { date: e.date, source: e.source, url: e.url } : {}) };
        });
        return res.json({ mode: "ai", answer: text, sources });
      } else {
        // Smart search mode
        const wikiResults = results.filter((r: any) => r.entry.type !== "article");
        const articleResults = results.filter((r: any) => r.entry.type === "article");
        const sections: string[] = [];

        for (const r of wikiResults.slice(0, 3)) {
          const w = r.entry as any;
          const lines = (w.content || "").split("\n").filter((l: string) => l.trim() && !l.startsWith("#") && !l.startsWith("---"));
          const summary = lines.slice(0, 4).join(" ");
          if (summary.length > 50) sections.push(`**${w.title || w.name}** (${w.type})\n${summary}`);
        }
        for (const r of articleResults.slice(0, 5)) {
          const a = r.entry as any;
          const ex = r.excerpts.length > 0 ? r.excerpts.map((e: string) => `  - ${e}`).join("\n") : "";
          sections.push(`**${a.title}** (${a.source}, ${a.date})\n${ex}`);
        }

        const formatted = results.slice(0, 15).map((r: any) => {
          const e = r.entry;
          return { id: e.slug, title: e.title || e.name, type: e.type, score: r.score, excerpts: r.excerpts, matchedTerms: r.matchedTerms,
            ...(e.type === "article" ? { date: e.date, source: e.source, url: e.url, category: e.category, companies: e.companies } : { wikiType: e.type }) };
        });
        return res.json({ mode: "search", answer: sections.join("\n\n"), results: formatted });
      }
    }

    return res.status(404).json({ error: "Not found" });
  } catch (err: any) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
