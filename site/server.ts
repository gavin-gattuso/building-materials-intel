import { serve } from "bun";
import { readFile } from "fs/promises";
import { join } from "path";
import { loadKB, getArticles, getWikiPages, searchKB, getStats, type SearchResult } from "./kb";

// Supabase config for AV report section queries
const SUPABASE_URL = process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SB_HEADERS = SUPABASE_KEY ? {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
} : null;

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = join(import.meta.dir, "public");

// AI mode: set ANTHROPIC_API_KEY to enable, otherwise smart search
let anthropic: any = null;
let aiEnabled = false;
try {
  if (process.env.ANTHROPIC_API_KEY) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    anthropic = new Anthropic();
    aiEnabled = true;
    console.log("AI chat mode: enabled (Anthropic API key found)");
  } else {
    console.log("AI chat mode: disabled (no ANTHROPIC_API_KEY). Using smart search mode.");
  }
} catch {
  console.log("AI chat mode: disabled. Using smart search mode.");
}

await loadKB();
console.log(`Knowledge base loaded: ${getArticles().length} articles, ${getWikiPages().length} wiki pages`);

function buildSmartSearchResponse(results: SearchResult[], query: string) {
  if (results.length === 0) {
    return {
      mode: "search",
      answer: `No results found for "${query}". Try broader terms or check the Articles and Companies pages.`,
      results: [],
    };
  }

  // Group results by type
  const wikiResults = results.filter(r => r.entry.type !== "article");
  const articleResults = results.filter(r => r.entry.type === "article");

  // Build a structured answer from top results
  const sections: string[] = [];

  // Lead with wiki pages (synthesized knowledge)
  for (const r of wikiResults.slice(0, 3)) {
    const w = r.entry as any;
    // Extract the first meaningful paragraph or section
    const lines = w.content.split("\n").filter((l: string) => l.trim() && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("|") && !l.startsWith(">"));
    const summary = lines.slice(0, 4).join(" ").replace(/\*\*/g, "**");
    if (summary.length > 50) {
      sections.push(`**${w.title}** (${w.type})\n${summary}`);
    }
  }

  // Add top article findings
  for (const r of articleResults.slice(0, 5)) {
    const a = r.entry as any;
    const excerptText = r.excerpts.length > 0
      ? r.excerpts.map(e => `  - ${e}`).join("\n")
      : "";
    sections.push(`**${a.title}** (${a.source}, ${a.date})\n${excerptText}`);
  }

  const answer = sections.join("\n\n");

  // Format results for the frontend
  const formattedResults = results.slice(0, 15).map(r => ({
    id: r.entry.type === "article" ? (r.entry as any).id : (r.entry as any).id,
    title: r.entry.type === "article" ? (r.entry as any).title : (r.entry as any).title,
    type: r.entry.type,
    score: r.score,
    excerpts: r.excerpts,
    matchedTerms: r.matchedTerms,
    ...(r.entry.type === "article" ? {
      date: (r.entry as any).date,
      source: (r.entry as any).source,
      url: (r.entry as any).url,
      category: (r.entry as any).category,
      companies: (r.entry as any).companies,
    } : {
      wikiType: (r.entry as any).type,
    }),
  }));

  return { mode: "search", answer, results: formattedResults };
}

async function buildAIResponse(message: string, history: any[]) {
  const results = searchKB(message, 15);
  const context = results.map((r, i) => {
    const entry = r.entry;
    if (entry.type === "article") {
      return `[SOURCE ${i + 1}] Article ID: ${entry.id}\nDate: ${entry.date} | Source: ${entry.source} | Category: ${entry.category}\nCompanies: ${entry.companies.join(", ") || "None"}\nURL: ${entry.url}\n${entry.content}`;
    }
    return `[SOURCE ${i + 1}] Wiki: ${entry.title} (${entry.type})\n${entry.content}`;
  }).join("\n\n---\n\n");

  const systemPrompt = `You are an AI research assistant for the Building Materials & Building Products industry knowledge base. You have access to foundational reference articles covering 20+ years of industry history, cycles, supply chain economics, consolidation patterns, and regulatory evolution. Use these to provide historical context and expert-level perspective when relevant.

RULES:
1. Answer questions ONLY from the knowledge base content provided below. If the information isn't in the KB, say so.
2. ALWAYS cite your sources using the format [Source N] where N is the source number. Include the article date and publication.
3. When citing specific data points (numbers, percentages, dollar amounts), always include the source.
4. Be specific and data-driven. Include actual figures when available.
5. If multiple sources cover a topic, synthesize them and cite all relevant ones.
6. When answering about current events, connect them to historical patterns from foundational articles when relevant.

KNOWLEDGE BASE CONTENT:
${context}`;

  const messages: any[] = [];
  if (history) {
    for (const h of history.slice(-6)) {
      messages.push({ role: h.role, content: h.content });
    }
  }
  messages.push({ role: "user", content: message });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  const sources = results.map((r, i) => ({
    index: i + 1,
    id: r.entry.type === "article" ? (r.entry as any).id : (r.entry as any).id,
    title: r.entry.type === "article" ? (r.entry as any).title : (r.entry as any).title,
    type: r.entry.type,
    ...(r.entry.type === "article" ? { date: (r.entry as any).date, source: (r.entry as any).source, url: (r.entry as any).url } : {}),
  }));

  return { mode: "ai", answer: text, sources };
}

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/")) {
      const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

      if (url.pathname === "/api/stats") {
        await loadKB();
        return Response.json(getStats(), { headers });
      }

      if (url.pathname === "/api/mode") {
        return Response.json({ aiEnabled }, { headers });
      }

      if (url.pathname === "/api/articles") {
        await loadKB();
        const q = url.searchParams.get("q");
        const category = url.searchParams.get("category");
        const company = url.searchParams.get("company");
        const limit = Number(url.searchParams.get("limit")) || 50;
        let results = q
          ? searchKB(q, limit).map(r => r.entry).filter(e => e.type === "article")
          : getArticles();
        if (category) results = results.filter(a => a.type === "article" && a.category.toLowerCase().includes(category.toLowerCase()));
        if (company) results = results.filter(a => a.type === "article" && a.companies.some(c => c.toLowerCase().includes(company.toLowerCase())));
        const slim = (results as any[]).slice(0, limit).map(({ content, ...rest }) => rest);
        return Response.json(slim, { headers });
      }

      if (url.pathname.startsWith("/api/article/")) {
        await loadKB();
        const id = url.pathname.replace("/api/article/", "");
        const article = getArticles().find(a => a.id === id);
        if (!article) return Response.json({ error: "Not found" }, { status: 404, headers });
        return Response.json(article, { headers });
      }

      if (url.pathname === "/api/wiki") {
        await loadKB();
        const type = url.searchParams.get("type");
        let pages = getWikiPages();
        if (type) pages = pages.filter(p => p.type === type);
        const slim = pages.map(({ content, ...rest }) => rest);
        return Response.json(slim, { headers });
      }

      if (url.pathname.startsWith("/api/wiki/")) {
        await loadKB();
        const id = url.pathname.replace("/api/wiki/", "");
        const page = getWikiPages().find(p => p.id === id);
        if (!page) return Response.json({ error: "Not found" }, { status: 404, headers });
        return Response.json(page, { headers });
      }

      if (url.pathname === "/api/chat" && req.method === "POST") {
        try {
          const { message, history } = await req.json() as { message: string; history?: any[] };
          await loadKB();

          if (aiEnabled) {
            const result = await buildAIResponse(message, history || []);
            return Response.json(result, { headers });
          } else {
            const results = searchKB(message, 15);
            const result = buildSmartSearchResponse(results, message);
            return Response.json(result, { headers });
          }
        } catch (err: any) {
          console.error("Chat error:", err);
          return Response.json({ error: err.message || "Chat failed" }, { status: 500, headers });
        }
      }

      // --- AV Report Section endpoints ---

      if (url.pathname === "/api/av-sections" && SB_HEADERS) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/av_report_sections?select=id,slug,title,description,section_order&order=section_order`, { headers: SB_HEADERS });
        const sections = await res.json();
        return Response.json(sections, { headers });
      }

      if (url.pathname.startsWith("/api/av-sections/") && SB_HEADERS) {
        const slug = url.pathname.replace("/api/av-sections/", "");
        // Get section info
        const secRes = await fetch(`${SUPABASE_URL}/rest/v1/av_report_sections?select=id,slug,title,description,section_order&slug=eq.${slug}`, { headers: SB_HEADERS });
        const sections = await secRes.json() as any[];
        if (!sections.length) return Response.json({ error: "Not found" }, { status: 404, headers });
        const section = sections[0];

        // Get articles tagged to this section
        const tagRes = await fetch(`${SUPABASE_URL}/rest/v1/article_av_sections?select=relevance_score,articles(id,slug,title,date,source,category)&section_id=eq.${section.id}&order=relevance_score.desc&limit=50`, { headers: SB_HEADERS });
        const tagged = await tagRes.json();

        return Response.json({ ...section, articles: tagged }, { headers });
      }

      if (url.pathname === "/api/av-coverage" && SB_HEADERS) {
        // Coverage summary: how many articles per section
        const res = await fetch(`${SUPABASE_URL}/rest/v1/av_report_sections?select=slug,title,section_order,article_av_sections(count)&order=section_order`, { headers: SB_HEADERS });
        const data = await res.json();
        return Response.json(data, { headers });
      }

      if (req.method === "OPTIONS") {
        return new Response(null, { headers: { ...headers, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
      }

      return Response.json({ error: "Not found" }, { status: 404, headers });
    }

    // Static files
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      const file = await readFile(join(PUBLIC, filePath));
      const ext = filePath.split(".").pop();
      const types: Record<string, string> = { html: "text/html", css: "text/css", js: "application/javascript", png: "image/png", svg: "image/svg+xml" };
      return new Response(file, { headers: { "Content-Type": types[ext || ""] || "application/octet-stream" } });
    } catch {
      const index = await readFile(join(PUBLIC, "index.html"));
      return new Response(index, { headers: { "Content-Type": "text/html" } });
    }
  },
});

console.log(`Building Materials KB running at http://localhost:${PORT}`);
