import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadKB, searchKB, type SearchResult } from "./kb-loader";

function buildSmartSearchResponse(results: SearchResult[], query: string) {
  if (results.length === 0) {
    return {
      mode: "search",
      answer: `No results found for "${query}". Try broader terms or check the Articles and Companies pages.`,
      results: [],
    };
  }

  const wikiResults = results.filter(r => r.entry.type !== "article");
  const articleResults = results.filter(r => r.entry.type === "article");
  const sections: string[] = [];

  for (const r of wikiResults.slice(0, 3)) {
    const w = r.entry as any;
    const lines = w.content.split("\n").filter((l: string) => l.trim() && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("|") && !l.startsWith(">"));
    const summary = lines.slice(0, 4).join(" ").replace(/\*\*/g, "**");
    if (summary.length > 50) sections.push(`**${w.title}** (${w.type})\n${summary}`);
  }

  for (const r of articleResults.slice(0, 5)) {
    const a = r.entry as any;
    const excerptText = r.excerpts.length > 0 ? r.excerpts.map((e: string) => `  - ${e}`).join("\n") : "";
    sections.push(`**${a.title}** (${a.source}, ${a.date})\n${excerptText}`);
  }

  const formattedResults = results.slice(0, 15).map(r => ({
    id: (r.entry as any).id,
    title: (r.entry as any).title,
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

  return { mode: "search", answer: sections.join("\n\n"), results: formattedResults };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, history } = req.body;
    loadKB();

    if (process.env.ANTHROPIC_API_KEY) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const anthropic = new Anthropic();
      const results = searchKB(message, 15);
      const context = results.map((r, i) => {
        const entry = r.entry;
        if (entry.type === "article") {
          return `[SOURCE ${i + 1}] Article ID: ${entry.id}\nDate: ${entry.date} | Source: ${entry.source} | Category: ${entry.category}\nCompanies: ${entry.companies.join(", ") || "None"}\nURL: ${entry.url}\n${entry.content}`;
        }
        return `[SOURCE ${i + 1}] Wiki: ${entry.title} (${entry.type})\n${entry.content}`;
      }).join("\n\n---\n\n");

      const systemPrompt = `You are an AI research assistant for the Building Materials & Building Products industry knowledge base.

RULES:
1. Answer questions ONLY from the knowledge base content provided below. If the information isn't in the KB, say so.
2. ALWAYS cite your sources using the format [Source N] where N is the source number. Include the article date and publication.
3. When citing specific data points (numbers, percentages, dollar amounts), always include the source.
4. Be specific and data-driven. Include actual figures when available.
5. If multiple sources cover a topic, synthesize them and cite all relevant ones.

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
        id: (r.entry as any).id,
        title: (r.entry as any).title,
        type: r.entry.type,
        ...(r.entry.type === "article" ? { date: (r.entry as any).date, source: (r.entry as any).source, url: (r.entry as any).url } : {}),
      }));

      return res.json({ mode: "ai", answer: text, sources });
    } else {
      const results = searchKB(message, 15);
      return res.json(buildSmartSearchResponse(results, message));
    }
  } catch (err: any) {
    console.error("Chat error:", err);
    return res.status(500).json({ error: err.message || "Chat failed" });
  }
}
