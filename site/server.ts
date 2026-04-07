import { serve } from "bun";
import { readFile } from "fs/promises";
import { join } from "path";
import { loadKB, getArticles, getWikiPages, searchKB, getStats, type SearchResult } from "./kb";
import { getUpcomingEarnings } from "./earnings-calendar";
import { buildReportDocument } from "../lib/docx-formatting";

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

      if (url.pathname === "/api/weekly-summary") {
        if (!SB_HEADERS) return Response.json(null, { headers });
        const res = await fetch(`${SUPABASE_URL}/rest/v1/weekly_summaries?select=*&order=week_end.desc&limit=1`, { headers: SB_HEADERS });
        const data = await res.json();
        return Response.json(data?.[0] || null, { headers });
      }

      if (url.pathname === "/api/financial-ratios") {
        if (!SB_HEADERS) return Response.json([], { headers });
        const period = url.searchParams.get("period");
        let sbUrl = `${SUPABASE_URL}/rest/v1/financial_ratios?select=*&order=company`;
        if (period) sbUrl += `&period=eq.${encodeURIComponent(period)}`;
        const res = await fetch(sbUrl, { headers: SB_HEADERS });
        return Response.json(await res.json(), { headers });
      }

      if (url.pathname === "/api/financial-ratio-flags") {
        try {
          const period = url.searchParams.get("period");
          // Thresholds for "large change" flags
          const THRESHOLDS = [
            { field: "revenue_growth_yoy", label: "Revenue Growth YoY", threshold: 15, unit: "%" },
            { field: "cogs_sales_yoy_delta", label: "COGS / Sales", threshold: 2.0, unit: "pp" },
            { field: "sga_sales_yoy_delta", label: "SG&A / Sales", threshold: 1.5, unit: "pp" },
            { field: "ebitda_margin_yoy_delta", label: "EBITDA Margin", threshold: 3.0, unit: "pp" },
          ];

          // Fetch ratios from Supabase or static file
          let ratios: any[] = [];
          if (SB_HEADERS) {
            let sbUrl = `${SUPABASE_URL}/rest/v1/financial_ratios?select=*&order=company`;
            if (period) sbUrl += `&period=eq.${encodeURIComponent(period)}`;
            const res = await fetch(sbUrl, { headers: SB_HEADERS });
            ratios = await res.json();
          }

          // Check each company against thresholds
          const flags: any[] = [];
          await loadKB();
          for (const row of ratios) {
            for (const t of THRESHOLDS) {
              const val = row[t.field];
              if (val == null || Math.abs(val) < t.threshold) continue;
              const direction = val < 0 ? "drop" : "surge";

              // Search KB for relevant articles about this company
              const results = searchKB(row.company, 10);
              const articleEntries = results
                .filter(r => r.entry.type === "article")
                .map(r => r.entry as any);

              // Prefer earnings/financial category articles, most recent first
              articleEntries.sort((a: any, b: any) => {
                const catA = (a.category || "").toLowerCase().includes("earning") ? 1 : 0;
                const catB = (b.category || "").toLowerCase().includes("earning") ? 1 : 0;
                if (catB !== catA) return catB - catA;
                return (b.date || "").localeCompare(a.date || "");
              });

              const best = articleEntries[0];
              const excerpt = best
                ? (best.content || "").split("\n").find((l: string) => l.trim().length > 40)?.trim().slice(0, 200) || ""
                : "";

              flags.push({
                company: row.company,
                ticker: row.ticker,
                metric: t.field,
                metricLabel: t.label,
                value: val,
                unit: t.unit,
                direction,
                article: best ? {
                  title: best.title,
                  source: best.source,
                  date: best.date,
                  url: best.url,
                  excerpt,
                } : null,
              });
            }
          }
          return Response.json(flags, { headers });
        } catch (err: any) {
          console.error("Financial ratio flags error:", err);
          return Response.json([], { headers });
        }
      }

      if (url.pathname === "/api/earnings-calendar") {
        const limit = Number(url.searchParams.get("limit")) || 10;
        return Response.json(getUpcomingEarnings(limit), { headers });
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

      // --- Custom Report Generation endpoints ---

      if (url.pathname === "/api/synthesize-section" && req.method === "POST") {
        try {
          const { startDate, endDate, section, sectionType } = await req.json() as any;

          await loadKB();
          // Search KB for articles matching this section topic within date range
          const searchResults = searchKB(section, 30);
          const articles = searchResults
            .filter(r => r.entry.type === "article")
            .map(r => r.entry as any)
            .filter(a => {
              if (!a.date) return true;
              const d = a.date;
              return (!startDate || d >= startDate) && (!endDate || d <= endDate);
            })
            .slice(0, 15);

          // AI-powered synthesis when API key is available
          if (aiEnabled) {
            const articleContext = articles.map((a: any, i: number) =>
              `[${i + 1}] "${a.title}" (${a.source}, ${a.date})\n${a.content?.slice(0, 1500) || ""}`
            ).join("\n\n---\n\n");

            const prompt = sectionType === "driver"
              ? `You are a Building Materials industry analyst. Analyze the "${section}" market driver based on these articles from ${startDate} to ${endDate}.

Provide:
1. A "direction" (one of: Positive, Negative, Mixed, Neutral)
2. A brief "signal" sentence (the key takeaway)
3. A "content" paragraph (2-4 sentences of detailed analysis)
4. An "impact" sentence (what this means for the industry)
5. Up to 5 "dataPoints" (specific numbers, rates, or statistics mentioned)

Respond in JSON: { "direction": "...", "signal": "...", "content": "...", "impact": "...", "dataPoints": ["..."] }

Articles:
${articleContext || "No articles found for this period."}`
              : `You are a Building Materials industry analyst. Synthesize the "${section}" news category based on these articles from ${startDate} to ${endDate}.

Provide:
1. A "content" paragraph (3-5 sentences summarizing key developments)
2. An "articles" array of the top 5 most important articles, each with: title, source, analysis (1-2 sentence takeaway), dataPoints (key numbers), url

Respond in JSON: { "content": "...", "articles": [{ "title": "...", "source": "...", "analysis": "...", "dataPoints": ["..."], "url": "..." }] }

Articles:
${articleContext || "No articles found for this period."}`;

            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-6",
              max_tokens: 2048,
              messages: [{ role: "user", content: prompt }],
            });

            const text = response.content[0].type === "text" ? response.content[0].text : "{}";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const result = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
            return Response.json({ ...result, section, sectionType }, { headers });
          }

          // KB-only fallback: extract data directly from articles
          const topArticles = articles.slice(0, 5);
          if (sectionType === "driver") {
            // Extract first sentence from each article as data points
            const dataPoints = topArticles
              .map(a => a.title)
              .filter(Boolean);
            const contentParts = topArticles
              .map(a => {
                const firstLine = (a.content || "").split("\n").find((l: string) => l.trim().length > 40) || "";
                return firstLine.trim();
              })
              .filter(Boolean);
            return Response.json({
              section,
              sectionType,
              direction: "Mixed",
              signal: topArticles[0]?.title || `${section} — ${articles.length} articles found in date range.`,
              content: contentParts.slice(0, 3).join(" ") || `${articles.length} articles related to ${section} were found between ${startDate} and ${endDate}.`,
              impact: `Based on ${articles.length} articles covering ${section}.`,
              dataPoints: dataPoints.slice(0, 5),
            }, { headers });
          } else {
            const formattedArticles = topArticles.map(a => ({
              title: a.title || "Untitled",
              source: a.source || "Unknown",
              analysis: (a.content || "").split("\n").find((l: string) => l.trim().length > 40)?.trim().slice(0, 300) || "",
              dataPoints: a.companies || [],
              url: a.url || "",
            }));
            return Response.json({
              section,
              sectionType,
              content: `${articles.length} articles found for ${section} between ${startDate} and ${endDate}. Key sources include ${topArticles.map(a => a.source).filter(Boolean).join(", ") || "various outlets"}.`,
              articles: formattedArticles,
            }, { headers });
          }
        } catch (err: any) {
          console.error("Synthesize section error:", err);
          return Response.json({ error: err.message, content: "", articles: [] }, { status: 500, headers });
        }
      }

      if (url.pathname === "/api/executive-summary" && req.method === "POST") {
        try {
          const { startDate, endDate, sectionSummaries } = await req.json() as any;

          // AI-powered executive summary when API key is available
          if (aiEnabled) {
            const summaryContext = (sectionSummaries || []).map((s: any) =>
              `**${s.section}** (${s.sectionType}): ${s.content || s.signal || "No data"}`
            ).join("\n\n");

            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-6",
              max_tokens: 1024,
              messages: [{ role: "user", content: `You are a Building Materials industry analyst. Write a concise executive summary (3-5 paragraphs) for a Building Materials Intelligence Report covering ${startDate} to ${endDate}.

Based on these section summaries:
${summaryContext}

The executive summary should:
- Open with the overall market sentiment and key themes
- Highlight the most significant developments
- Note critical market driver signals
- Close with a forward-looking outlook

Respond in JSON: { "summary": "..." }` }],
            });

            const text = response.content[0].type === "text" ? response.content[0].text : "{}";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: "" };
            return Response.json(result, { headers });
          }

          // KB-only fallback: build summary from section data
          const categories = (sectionSummaries || []).filter((s: any) => s.sectionType === "category");
          const driversList = (sectionSummaries || []).filter((s: any) => s.sectionType === "driver");
          const totalArticles = categories.reduce((sum: number, s: any) => {
            const match = (s.content || "").match(/(\d+) articles/);
            return sum + (match ? parseInt(match[1]) : 0);
          }, 0);

          const driverSignals = driversList
            .map((d: any) => `${d.section}: ${d.direction || "Mixed"}`)
            .join("; ");

          const summary = `Building Materials Intelligence Report for ${startDate} to ${endDate}.\n\nThis report covers ${totalArticles} articles across ${categories.length} news categories and ${driversList.length} market health drivers sourced from the knowledge base.\n\nMarket Driver Signals: ${driverSignals || "See individual driver sections for details."}\n\nNote: This report was generated from knowledge base data. Set ANTHROPIC_API_KEY to enable AI-powered analysis and synthesis for richer executive summaries and deeper insights.`;

          return Response.json({ summary }, { headers });
        } catch (err: any) {
          console.error("Executive summary error:", err);
          return Response.json({ error: err.message, summary: "" }, { status: 500, headers });
        }
      }

      if (url.pathname === "/api/build-report" && req.method === "POST") {
        try {
          const { startDate, endDate, executiveSummary, sections, drivers } = await req.json() as any;
          const buffer = await buildReportDocument({
            startDate,
            endDate,
            executiveSummary: executiveSummary || "",
            sections: sections || [],
            drivers: drivers || [],
          });
          return new Response(buffer, {
            headers: {
              "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "Content-Disposition": `attachment; filename="Building_Materials_Report_${startDate}_to_${endDate}.docx"`,
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (err: any) {
          console.error("Build report error:", err.message, err.stack);
          return Response.json({ error: err.message }, { status: 500, headers });
        }
      }

      // Reports API: list available PDF reports
      if (url.pathname === "/api/reports") {
        try {
          const reportsDir = join(PUBLIC, "reports");
          const { readdirSync, statSync } = require("fs");
          const files = readdirSync(reportsDir)
            .filter((f: string) => f.toLowerCase().endsWith(".pdf"))
            .map((f: string) => {
              const stat = statSync(join(reportsDir, f));
              const name = f.replace(/\.pdf$/i, "").replace(/_/g, " ");
              return { filename: f, name, size: stat.size, modified: stat.mtime };
            })
            .sort((a: any, b: any) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
          return Response.json(files, { headers });
        } catch {
          return Response.json([], { headers });
        }
      }

      return Response.json({ error: "Not found" }, { status: 404, headers });
    }

    // Static files
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      const file = await readFile(join(PUBLIC, filePath));
      const ext = filePath.split(".").pop();
      const types: Record<string, string> = { html: "text/html", css: "text/css", js: "application/javascript", png: "image/png", svg: "image/svg+xml", pdf: "application/pdf" };
      return new Response(file, { headers: { "Content-Type": types[ext || ""] || "application/octet-stream" } });
    } catch {
      const index = await readFile(join(PUBLIC, "index.html"));
      return new Response(index, { headers: { "Content-Type": "text/html" } });
    }
  },
});

console.log(`Building Materials KB running at http://localhost:${PORT}`);
