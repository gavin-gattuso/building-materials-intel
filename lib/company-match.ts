/**
 * 2-signal company-matching rules — extracted from api/daily-scan.ts so they
 * can be re-applied to existing articles by /api/re-match without going
 * through the full ingest path. Rule contract is unchanged: ticker or
 * full-name = 1 signal; abbreviation = 1 signal but only in financial
 * context; segment keyword = weak (only adds to an existing signal).
 *
 *   2+ signals          → high confidence (low_confidence_match = false)
 *   1 non-segment       → low confidence  (low_confidence_match = true)
 *   segment-only        → dropped (false positive avoidance)
 */

export interface CompanyMatchConfig {
  slug: string;
  tickers: string[];
  fullNames: string[];
  abbreviations: string[];
  segmentKeywords: string[];
}

export interface CompanyMatch {
  slug: string;
  signals: string[];
  lowConfidence: boolean;
}

export const COMPANY_MATCH_RULES: CompanyMatchConfig[] = [
  { slug: "crh", tickers: ["CRH"], fullNames: ["crh plc", "crh group"], abbreviations: [], segmentKeywords: ["cement", "aggregates"] },
  { slug: "cemex", tickers: ["CX"], fullNames: ["cemex"], abbreviations: [], segmentKeywords: ["cement", "ready-mix"] },
  { slug: "heidelberg-materials", tickers: ["HEI.DE"], fullNames: ["heidelberg materials"], abbreviations: ["heidelberg"], segmentKeywords: ["cement", "aggregates"] },
  { slug: "holcim", tickers: ["HOLN.SW"], fullNames: ["holcim"], abbreviations: [], segmentKeywords: ["cement", "aggregates"] },
  { slug: "martin-marietta", tickers: ["MLM"], fullNames: ["martin marietta"], abbreviations: [], segmentKeywords: ["aggregates", "quarry"] },
  { slug: "vulcan-materials", tickers: ["VMC"], fullNames: ["vulcan materials"], abbreviations: ["vulcan"], segmentKeywords: ["aggregates", "quarry"] },
  { slug: "nucor", tickers: ["NUE"], fullNames: ["nucor"], abbreviations: [], segmentKeywords: ["steel", "rebar"] },
  { slug: "steel-dynamics", tickers: ["STLD"], fullNames: ["steel dynamics"], abbreviations: [], segmentKeywords: ["steel", "flat-rolled"] },
  { slug: "arcelormittal", tickers: ["MT"], fullNames: ["arcelormittal"], abbreviations: ["arcelor"], segmentKeywords: ["steel"] },
  { slug: "owens-corning", tickers: ["OC"], fullNames: ["owens corning"], abbreviations: [], segmentKeywords: ["insulation", "roofing", "fiberglass"] },
  { slug: "saint-gobain", tickers: ["SGO.PA"], fullNames: ["saint-gobain", "saint gobain"], abbreviations: [], segmentKeywords: ["glass", "insulation"] },
  { slug: "builders-firstsource", tickers: ["BLDR"], fullNames: ["builders firstsource"], abbreviations: [], segmentKeywords: ["trusses", "building products distribution"] },
  { slug: "trane-technologies", tickers: ["TT"], fullNames: ["trane technologies"], abbreviations: ["trane"], segmentKeywords: ["hvac", "climate"] },
  { slug: "carrier-global", tickers: ["CARR"], fullNames: ["carrier global"], abbreviations: ["carrier"], segmentKeywords: ["hvac", "refrigeration"] },
  { slug: "johnson-controls", tickers: ["JCI"], fullNames: ["johnson controls"], abbreviations: [], segmentKeywords: ["building automation", "fire", "security"] },
  { slug: "daikin-industries", tickers: ["6367.T"], fullNames: ["daikin industries", "daikin"], abbreviations: [], segmentKeywords: ["hvac", "air conditioning"] },
  { slug: "home-depot", tickers: ["HD"], fullNames: ["home depot"], abbreviations: [], segmentKeywords: ["home improvement", "diy"] },
  { slug: "lowes", tickers: ["LOW"], fullNames: ["lowe's", "lowes"], abbreviations: [], segmentKeywords: ["home improvement"] },
  { slug: "fortune-brands", tickers: ["FBIN"], fullNames: ["fortune brands"], abbreviations: [], segmentKeywords: ["plumbing", "doors", "security"] },
  { slug: "masco", tickers: ["MAS"], fullNames: ["masco"], abbreviations: [], segmentKeywords: ["faucets", "cabinets", "plumbing"] },
  { slug: "assa-abloy", tickers: ["ASSA-B.ST"], fullNames: ["assa abloy"], abbreviations: [], segmentKeywords: ["locks", "access solutions", "door hardware"] },
  { slug: "jeld-wen", tickers: ["JWEN"], fullNames: ["jeld-wen", "jeld wen"], abbreviations: ["jeld"], segmentKeywords: ["doors", "windows"] },
  { slug: "kingspan", tickers: ["KRX.IR"], fullNames: ["kingspan"], abbreviations: [], segmentKeywords: ["insulated panels", "building envelope"] },
  { slug: "carlisle-companies", tickers: ["CSL"], fullNames: ["carlisle companies"], abbreviations: ["carlisle"], segmentKeywords: ["roofing", "waterproofing"] },
  { slug: "weyerhaeuser", tickers: ["WY"], fullNames: ["weyerhaeuser"], abbreviations: [], segmentKeywords: ["timber", "wood products", "timberland"] },
  { slug: "west-fraser", tickers: ["WFG.TO"], fullNames: ["west fraser"], abbreviations: [], segmentKeywords: ["lumber", "osb", "wood products"] },
  { slug: "canfor", tickers: ["CFP.TO"], fullNames: ["canfor"], abbreviations: [], segmentKeywords: ["lumber", "pulp"] },
  { slug: "interfor", tickers: ["IFP.TO"], fullNames: ["interfor"], abbreviations: [], segmentKeywords: ["lumber"] },
  { slug: "ufp-industries", tickers: ["UFPI"], fullNames: ["ufp industries"], abbreviations: ["ufp"], segmentKeywords: ["wood", "packaging", "decking"] },
  { slug: "geberit", tickers: ["GEBN.SW"], fullNames: ["geberit"], abbreviations: [], segmentKeywords: ["piping", "sanitary"] },
  { slug: "advanced-drainage-systems", tickers: ["WMS"], fullNames: ["advanced drainage systems"], abbreviations: ["ads"], segmentKeywords: ["drainage", "stormwater", "piping"] },
  { slug: "wienerberger", tickers: ["WIE.VI"], fullNames: ["wienerberger"], abbreviations: [], segmentKeywords: ["bricks", "clay", "masonry"] },
  { slug: "rpm-international", tickers: ["RPM"], fullNames: ["rpm international"], abbreviations: [], segmentKeywords: ["coatings", "sealants", "waterproofing"] },
  { slug: "installed-building-products", tickers: ["IBP"], fullNames: ["installed building products"], abbreviations: [], segmentKeywords: ["insulation installation"] },
  { slug: "qxo", tickers: ["QXO"], fullNames: ["qxo"], abbreviations: ["beacon roofing"], segmentKeywords: ["roofing distribution"] },
  { slug: "agc", tickers: ["5201.T"], fullNames: ["agc inc", "asahi glass"], abbreviations: [], segmentKeywords: ["glass", "float glass"] },
  { slug: "taiheiyo-cement", tickers: ["5233.T"], fullNames: ["taiheiyo cement"], abbreviations: ["taiheiyo"], segmentKeywords: ["cement"] },
  { slug: "lixil", tickers: ["5938.T"], fullNames: ["lixil"], abbreviations: [], segmentKeywords: ["water technology", "housing technology"] },
  { slug: "sanwa-holdings", tickers: ["5929.T"], fullNames: ["sanwa holdings"], abbreviations: ["sanwa"], segmentKeywords: ["shutters", "doors", "partitions"] },
];

export function matchCompanies(title: string, content: string): CompanyMatch[] {
  const raw = " " + title + " " + content + " ";
  const text = raw.toLowerCase();
  const matches: CompanyMatch[] = [];

  const hasFinancialContext = /\b(earnings|revenue|quarter|fiscal|shares|stock|eps|guidance|analyst|dividend|margin)\b/.test(text);

  for (const rule of COMPANY_MATCH_RULES) {
    const signals: string[] = [];

    // Tickers are matched case-SENSITIVELY against the original-case text. Real
    // ticker mentions are uppercase ("NYSE:LOW", "$LOW", "(LOW)"); matching them
    // case-insensitively against lowercased text made short tickers collide with
    // common words — e.g. LOW (Lowe's) firing on "low carbon" / "low-carbon",
    // the single biggest source of false-positive matches on this beat.
    for (const ticker of rule.tickers) {
      const tickerPattern = new RegExp(`\\b${ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (tickerPattern.test(raw)) signals.push(`ticker:${ticker}`);
    }

    for (const name of rule.fullNames) {
      if (text.includes(name.toLowerCase())) signals.push(`name:${name}`);
    }

    if (hasFinancialContext) {
      for (const abbr of rule.abbreviations) {
        // Word-boundary match, not substring: "ads" (Advanced Drainage) must
        // not fire inside "leads"/"upgrades", "ufp" inside other tokens, etc.
        const abbrPattern = new RegExp(`\\b${abbr.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
        if (abbrPattern.test(text)) signals.push(`abbr:${abbr}`);
      }
    }

    let segmentHit = false;
    for (const kw of rule.segmentKeywords) {
      if (text.includes(kw.toLowerCase())) { segmentHit = true; break; }
    }
    const nonSegmentSignals = signals.length;
    if (segmentHit && nonSegmentSignals > 0) signals.push("segment_keyword");

    if (signals.length === 0) continue;
    if (signals.length >= 2) {
      matches.push({ slug: rule.slug, signals, lowConfidence: false });
    } else if (nonSegmentSignals >= 1) {
      matches.push({ slug: rule.slug, signals, lowConfidence: true });
    }
  }
  return matches;
}
