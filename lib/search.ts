/**
 * Shared search utilities: synonyms, term expansion, scoring, excerpt extraction.
 * Used by both site/kb.ts (local dev) and api/index.ts (Vercel production).
 */

export const SYNONYMS: Record<string, string[]> = {
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

export function expandTerms(terms: string[]): string[] {
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

export function extractExcerpts(text: string, terms: string[], maxExcerpts = 3): string[] {
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

export interface ScoreResult {
  score: number;
  matchedTerms: string[];
}

/**
 * Score an entry against search terms. Works for articles and wiki pages.
 * @param entry - Must have title/name, content, and optionally type/category/companies/source
 */
export function scoreEntry(entry: any, terms: string[], rawTerms: string[]): ScoreResult {
  const matched = new Set<string>();
  let s = 0;
  const title = (entry.title || entry.name || "").toLowerCase();
  const content = (entry.content || "").toLowerCase();
  const meta = entry.type === "article"
    ? `${entry.category || ""} ${(entry.companies || []).join(" ")} ${(entry.tags || []).join(" ")} ${entry.source || ""}`.toLowerCase()
    : "";

  for (const term of terms) {
    if (title.includes(term)) { s += 30; matched.add(term); }
    if (meta.includes(term)) { s += 20; matched.add(term); }
    if (content.includes(term)) {
      s += 10;
      matched.add(term);
      s += Math.min(5, content.split(term).length - 1) * 2;
    }
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
