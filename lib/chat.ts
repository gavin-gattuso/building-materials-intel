/**
 * Shared chat response builders for smart search and AI synthesis modes.
 * Used by both site/server.ts (local dev) and api/index.ts (Vercel production).
 */

export interface SearchResultEntry {
  entry: any;
  score: number;
  excerpts: string[];
  matchedTerms: string[];
}

export function buildSmartSearchResponse(results: SearchResultEntry[], query: string) {
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
    const w = r.entry;
    const lines = (w.content || "").split("\n").filter((l: string) =>
      l.trim() && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("|") && !l.startsWith(">")
    );
    const summary = lines.slice(0, 4).join(" ").replace(/\*\*/g, "**");
    if (summary.length > 50) {
      sections.push(`**${w.title || w.name}** (${w.type})\n${summary}`);
    }
  }

  for (const r of articleResults.slice(0, 5)) {
    const a = r.entry;
    const excerptText = r.excerpts.length > 0
      ? r.excerpts.map(e => `  - ${e}`).join("\n")
      : "";
    sections.push(`**${a.title}** (${a.source}, ${a.date})\n${excerptText}`);
  }

  const formatted = results.slice(0, 15).map(r => {
    const e = r.entry;
    return {
      id: e.slug || e.id,
      title: e.title || e.name,
      type: e.type,
      score: r.score,
      excerpts: r.excerpts,
      matchedTerms: r.matchedTerms,
      ...(e.type === "article" ? {
        date: e.date, source: e.source, url: e.url,
        category: e.category, companies: e.companies,
      } : { wikiType: e.type }),
    };
  });

  return { mode: "search", answer: sections.join("\n\n"), results: formatted };
}

export function buildSearchContext(results: SearchResultEntry[]): string {
  return results.map((r, i) => {
    const e = r.entry;
    if (e.type === "article") {
      return `[SOURCE ${i + 1}] ${e.title}\nDate: ${e.date} | Source: ${e.source} | Category: ${e.category}\nCompanies: ${(e.companies || []).join(", ") || "None"}\nURL: ${e.url}\n${e.content}`;
    }
    return `[SOURCE ${i + 1}] Wiki: ${e.title || e.name} (${e.type})\n${e.content}`;
  }).join("\n\n---\n\n");
}

export const SYSTEM_PROMPT_PREFIX = `You are an AI research assistant for the Building Materials & Building Products industry knowledge base. You have access to foundational reference articles covering 20+ years of industry history, cycles, supply chain economics, consolidation patterns, and regulatory evolution. Use these to provide historical context and expert-level perspective when relevant.

RULES:
1. Answer questions ONLY from the knowledge base content provided below. If the information isn't in the KB, say so.
2. ALWAYS cite your sources using the format [Source N] where N is the source number. Include the article date and publication.
3. When citing specific data points (numbers, percentages, dollar amounts), always include the source.
4. Be specific and data-driven. Include actual figures when available.
5. If multiple sources cover a topic, synthesize them and cite all relevant ones.
6. When answering about current events, connect them to historical patterns from foundational articles when relevant.`;

export function buildSourceList(results: SearchResultEntry[]) {
  return results.map((r, i) => {
    const e = r.entry;
    return {
      index: i + 1,
      id: e.slug || e.id,
      title: e.title || e.name,
      type: e.type,
      ...(e.type === "article" ? { date: e.date, source: e.source, url: e.url } : {}),
    };
  });
}
