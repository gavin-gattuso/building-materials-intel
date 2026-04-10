/**
 * Knowledge Base Data Linter
 * Validates all articles in knowledge-base/raw/articles/ against quality rules.
 *
 * Rules:
 * 1. Required YAML fields: date, source, url, category
 * 2. ISO 8601 date format (YYYY-MM-DD)
 * 3. URL validity and uniqueness
 * 4. Company/tag reference validation against known lists (with alias/slug matching)
 * 5. Minimum 500 char content body
 * 6. Source whitelist compliance (domain-based, 9-tier)
 *
 * Usage: bun run scripts/lint-kb.ts [--json] [--fix] [--stats]
 *
 * Output: JSON report to stdout (--json) or human-readable summary.
 * --stats: Print source coverage statistics (articles per source/tier/company/month).
 * Exit code: 0 if clean, 1 if issues found.
 */
import { readdir, readFile } from "fs/promises";
import { join, basename } from "path";
import matter from "gray-matter";

const KB_DIR = join(import.meta.dir, "..", "knowledge-base", "raw", "articles");
const COMPANIES_DIR = join(import.meta.dir, "..", "knowledge-base", "wiki", "companies");

const jsonMode = process.argv.includes("--json");
const statsMode = process.argv.includes("--stats");

// ---------------------------------------------------------------------------
// 9-Tier Source Whitelist  (domain-based matching)
// ---------------------------------------------------------------------------

interface SourceTierEntry {
  name: string;
  domains: string[];   // matched against article URL or source field
}

const SOURCE_TIERS: Record<number, { label: string; sources: SourceTierEntry[] }> = {
  1: {
    label: "Major News",
    sources: [
      { name: "Reuters", domains: ["reuters.com"] },
      { name: "Bloomberg", domains: ["bloomberg.com"] },
      { name: "WSJ", domains: ["wsj.com"] },
      { name: "Financial Times", domains: ["ft.com"] },
      { name: "New York Times", domains: ["nytimes.com"] },
      { name: "Washington Post", domains: ["washingtonpost.com"] },
      { name: "BBC", domains: ["bbc.com", "bbc.co.uk"] },
      { name: "CNBC", domains: ["cnbc.com"] },
      { name: "Forbes", domains: ["forbes.com"] },
      { name: "Fortune", domains: ["fortune.com"] },
      { name: "AP", domains: ["apnews.com", "ap.org"] },
    ],
  },
  2: {
    label: "Top Publications",
    sources: [
      { name: "TechCrunch", domains: ["techcrunch.com"] },
      { name: "The Verge", domains: ["theverge.com"] },
      { name: "Wired", domains: ["wired.com"] },
      { name: "Ars Technica", domains: ["arstechnica.com"] },
      { name: "MIT Technology Review", domains: ["technologyreview.com"] },
      { name: "VentureBeat", domains: ["venturebeat.com"] },
      { name: "ZDNet", domains: ["zdnet.com"] },
      { name: "CNET", domains: ["cnet.com"] },
    ],
  },
  3: {
    label: "Industry-Specific",
    sources: [
      { name: "Construction Dive", domains: ["constructiondive.com"] },
      { name: "BD+C", domains: ["bdcnetwork.com"] },
      { name: "ENR", domains: ["enr.com"] },
      { name: "Remodeling Magazine", domains: ["remodeling.hw.net"] },
      { name: "JLC", domains: ["jlconline.com"] },
      { name: "ProBuilder", domains: ["probuilder.com"] },
      { name: "Builder Online", domains: ["builderonline.com"] },
      { name: "Retail Dive", domains: ["retaildive.com"] },
      { name: "Supply Chain Dive", domains: ["supplychaindive.com"] },
    ],
  },
  4: {
    label: "Company IR Pages",
    sources: [
      { name: "Company IR", domains: ["investor", "ir.", "investors."] },
    ],
  },
  5: {
    label: "Associations & Research",
    sources: [
      { name: "NAHB", domains: ["nahb.org"] },
      { name: "ABC", domains: ["abc.org"] },
      { name: "PCA", domains: ["cement.org"] },
      { name: "AISI", domains: ["steel.org"] },
      { name: "AGC of America", domains: ["agc.org"] },
      { name: "Construction Analytics", domains: ["constructionanalytics.com"] },
      { name: "AIA", domains: ["aia.org"] },
      { name: "Conference Board", domains: ["conference-board.org"] },
      { name: "S&P Global", domains: ["spglobal.com"] },
      { name: "Dodge Construction Network", domains: ["construction.com"] },
      { name: "ConstructConnect", domains: ["constructconnect.com"] },
    ],
  },
  6: {
    label: "Government & Data",
    sources: [
      { name: "Census Bureau", domains: ["census.gov"] },
      { name: "BLS", domains: ["bls.gov"] },
      { name: "BEA", domains: ["bea.gov"] },
      { name: "FRED", domains: ["fred.stlouisfed.org"] },
      { name: "Federal Reserve", domains: ["federalreserve.gov", "frbsf.org", "newyorkfed.org"] },
      { name: "USGS", domains: ["usgs.gov"] },
      { name: "Procore", domains: ["procore.com"] },
      { name: "BusinessWire", domains: ["businesswire.com"] },
      { name: "PR Newswire", domains: ["prnewswire.com"] },
      { name: "GlobeNewsWire", domains: ["globenewswire.com"] },
    ],
  },
  7: {
    label: "Financial Analysis",
    sources: [
      { name: "Yahoo Finance", domains: ["finance.yahoo.com", "yahoo.com/finance"] },
      { name: "Seeking Alpha", domains: ["seekingalpha.com"] },
      { name: "MarketScreener", domains: ["marketscreener.com"] },
      { name: "MarketWatch", domains: ["marketwatch.com"] },
      { name: "Barrons", domains: ["barrons.com"] },
      { name: "IndexBox", domains: ["indexbox.io"] },
    ],
  },
  8: {
    label: "Consulting Firms",
    sources: [
      { name: "Bain", domains: ["bain.com"] },
      { name: "Deloitte", domains: ["deloitte.com"] },
      { name: "PwC", domains: ["pwc.com"] },
      { name: "KPMG", domains: ["kpmg.com"] },
      { name: "FMI Corp", domains: ["fminet.com"] },
      { name: "Capstone Partners", domains: ["capstonepartners.com"] },
      { name: "McKinsey", domains: ["mckinsey.com"] },
    ],
  },
  9: {
    label: "Construction Niche",
    sources: [
      { name: "LBM Journal", domains: ["lbmjournal.com"] },
      { name: "Steel Market Update", domains: ["steelmarketupdate.com"] },
      { name: "Fastmarkets", domains: ["fastmarkets.com"] },
      { name: "For Construction Pros", domains: ["forconstructionpros.com"] },
      { name: "Concrete Products", domains: ["concreteproducts.com"] },
      { name: "Pit & Quarry", domains: ["pitandquarry.com"] },
      { name: "Rock Products", domains: ["rockproducts.com"] },
      { name: "CemNet", domains: ["cemnet.com"] },
      { name: "HousingWire", domains: ["housingwire.com"] },
      { name: "Data Center Dynamics", domains: ["datacenterdynamics.com"] },
      { name: "Roofing Contractor", domains: ["roofingcontractor.com"] },
      { name: "Concrete Construction", domains: ["concreteconstruction.net"] },
    ],
  },
};

// Build flat lookup: lowercase name/alias -> tier number
const SOURCE_NAME_TO_TIER = new Map<string, number>();
// Build domain -> tier lookup
const DOMAIN_TO_TIER = new Map<string, number>();

for (const [tierNum, tier] of Object.entries(SOURCE_TIERS)) {
  const t = Number(tierNum);
  for (const src of tier.sources) {
    SOURCE_NAME_TO_TIER.set(src.name.toLowerCase(), t);
    for (const d of src.domains) {
      DOMAIN_TO_TIER.set(d.toLowerCase(), t);
    }
  }
}

// ---------------------------------------------------------------------------
// Company alias / slug matching
// ---------------------------------------------------------------------------

// Suffixes to strip when generating slugs for matching
const COMPANY_SUFFIXES = /\s*(,?\s*(Inc\.?|plc|Ltd\.?|S\.A\.B\.\s*de\s*C\.V\.?|Corporation|Corp\.?|Company|Co\.?|Group|AG|S\.?A\.?|Holdings?|International|Innovations?|Industries|Materials|N\.?V\.?))+\s*$/i;

function slugify(name: string): string {
  return name
    .replace(COMPANY_SUFFIXES, "")
    .replace(/['']/g, "")           // strip apostrophes
    .replace(/^the\s+/i, "")       // strip leading "The"
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

interface CompanyInfo {
  title: string;
  slug: string;        // wiki filename without .md
  aliases: string[];   // from frontmatter aliases field
}

async function getKnownCompanies(): Promise<{ byExact: Map<string, string>; bySlug: Map<string, string>; list: CompanyInfo[] }> {
  const files = await readdir(COMPANIES_DIR);
  const byExact = new Map<string, string>(); // exact name -> canonical title
  const bySlug = new Map<string, string>();   // slug -> canonical title
  const list: CompanyInfo[] = [];

  for (const f of files.filter(f => f.endsWith(".md"))) {
    const raw = await readFile(join(COMPANIES_DIR, f), "utf-8");
    const { data } = matter(raw);
    const fileSlug = basename(f, ".md");
    const title: string = data.title || "";
    const aliases: string[] = Array.isArray(data.aliases) ? data.aliases : [];

    // Add exact title -> itself
    if (title) byExact.set(title, title);

    // Also extract from first heading
    const titleMatch = raw.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      const heading = titleMatch[1].replace(/\s*\(.*\)$/, "").trim(); // strip "(TICKER)" suffix
      byExact.set(heading, title);
    }

    // Build slug-based lookups
    // 1. The wiki filename itself
    bySlug.set(fileSlug, title);

    // 2. Slugified title
    if (title) bySlug.set(slugify(title), title);

    // 3. All aliases (exact + slugified)
    for (const alias of aliases) {
      byExact.set(alias, title);
      bySlug.set(slugify(alias), title);
    }

    list.push({ title, slug: fileSlug, aliases });
  }

  return { byExact, bySlug, list };
}

function matchCompany(name: string, byExact: Map<string, string>, bySlug: Map<string, string>): string | null {
  // 1. Exact match (returns canonical title)
  if (byExact.has(name)) return byExact.get(name)!;

  // 2. Slug-based match
  const slug = slugify(name);
  if (bySlug.has(slug)) return bySlug.get(slug)!;

  // 3. Try raw lowercase against slug keys
  const lower = name.toLowerCase().replace(/['']/g, "");
  for (const [s, canonical] of bySlug) {
    if (s === lower) return canonical;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Source matching (domain + name-based)
// ---------------------------------------------------------------------------

interface SourceMatch {
  approved: boolean;
  tier: number | null;
  tierLabel: string | null;
}

function classifySource(source: string, url: string): SourceMatch {
  // 1. Try matching source name against known names
  const srcLower = source.toLowerCase().trim();
  for (const [name, tier] of SOURCE_NAME_TO_TIER) {
    if (srcLower === name || srcLower.includes(name) || name.includes(srcLower)) {
      return { approved: true, tier, tierLabel: SOURCE_TIERS[tier].label };
    }
  }

  // 2. Try matching URL domain against known domains
  if (url) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      for (const [domain, tier] of DOMAIN_TO_TIER) {
        if (hostname.includes(domain) || hostname.endsWith("." + domain)) {
          return { approved: true, tier, tierLabel: SOURCE_TIERS[tier].label };
        }
      }
    } catch { /* invalid URL handled elsewhere */ }
  }

  // 3. Company IR pages (Tier 4) -- match investor pages OR when source is a tracked company name
  const combined = (source + " " + url).toLowerCase();
  if (combined.includes("investor") || combined.includes("ir.") || combined.includes("investors")) {
    return { approved: true, tier: 4, tierLabel: SOURCE_TIERS[4].label };
  }

  // 4. If the source name matches a tracked company, it's a company press release (Tier 4)
  if (_companyNames && source) {
    for (const cn of _companyNames) {
      const cnLower = cn.toLowerCase();
      if (srcLower === cnLower || srcLower.includes(cnLower) || cnLower.includes(srcLower)) {
        return { approved: true, tier: 4, tierLabel: SOURCE_TIERS[4].label };
      }
    }
  }

  return { approved: false, tier: null, tierLabel: null };
}

// Populated after company data is loaded -- used by classifySource
let _companyNames: string[] = [];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isValidDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
}

function isValidUrl(u: string): boolean {
  try {
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface LintIssue {
  file: string;
  rule: string;
  severity: "error" | "warning";
  message: string;
}

interface LintReport {
  timestamp: string;
  totalFiles: number;
  cleanFiles: number;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  issues: LintIssue[];
  byRule: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const files = (await readdir(KB_DIR)).filter(f => f.endsWith(".md"));
  const { byExact, bySlug, list: companyList } = await getKnownCompanies();
  // Populate company names for source classification (company press releases = Tier 4)
  _companyNames = companyList.map(c => c.title).filter(Boolean);
  for (const c of companyList) {
    for (const alias of c.aliases) _companyNames.push(alias);
  }
  const issues: LintIssue[] = [];
  const urlsSeen = new Map<string, string>(); // url -> first file that used it

  // Stats accumulators
  const sourceCount = new Map<string, number>();
  const tierCount = new Map<number, number>();
  const companyMentionCount = new Map<string, number>();
  const monthCount = new Map<string, number>();
  const tierArticles = new Map<number, Set<string>>(); // tier -> set of files

  for (const file of files) {
    const raw = await readFile(join(KB_DIR, file), "utf-8");
    const { data: fm, content } = matter(raw);

    // Rule 1: Required YAML fields
    for (const field of ["date", "source", "url", "category"]) {
      if (!fm[field]) {
        issues.push({ file, rule: "required-field", severity: "error", message: `Missing required field: ${field}` });
      }
    }

    // Rule 2: ISO 8601 date
    const dateStr = fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : String(fm.date || "");
    if (dateStr && !isValidDate(dateStr)) {
      issues.push({ file, rule: "date-format", severity: "error", message: `Invalid date format: "${dateStr}" (expected YYYY-MM-DD)` });
    }

    // Rule 3a: URL validity
    const url = String(fm.url || "");
    if (url && !isValidUrl(url)) {
      issues.push({ file, rule: "url-invalid", severity: "error", message: `Invalid URL: "${url}"` });
    }

    // Rule 3b: URL uniqueness
    if (url) {
      if (urlsSeen.has(url)) {
        issues.push({ file, rule: "url-duplicate", severity: "warning", message: `Duplicate URL also in: ${urlsSeen.get(url)}` });
      } else {
        urlsSeen.set(url, file);
      }
    }

    // Rule 4: Company reference validation (with alias/slug matching)
    const companies: string[] = Array.isArray(fm.companies) ? fm.companies : [];
    for (const c of companies) {
      const matched = matchCompany(c, byExact, bySlug);
      if (!matched) {
        issues.push({ file, rule: "unknown-company", severity: "warning", message: `Company "${c}" not found in wiki/companies/ (slug: ${slugify(c)})` });
      }
    }

    // Rule 5: Minimum content length
    const bodyText = content.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim();
    if (bodyText.length < 500) {
      issues.push({ file, rule: "content-too-short", severity: "warning", message: `Content body is ${bodyText.length} chars (minimum 500)` });
    }

    // Rule 6: Source whitelist (domain-based, with tier reporting)
    const source = String(fm.source || "");
    const srcMatch = classifySource(source, url);
    if (source && !srcMatch.approved) {
      issues.push({
        file,
        rule: "source-not-whitelisted",
        severity: "warning",
        message: `Source "${source}" not in any approved tier (URL: ${url})`,
      });
    }

    // --- Accumulate stats ---
    if (source) {
      sourceCount.set(source, (sourceCount.get(source) || 0) + 1);
    }
    if (srcMatch.tier !== null) {
      tierCount.set(srcMatch.tier, (tierCount.get(srcMatch.tier) || 0) + 1);
      if (!tierArticles.has(srcMatch.tier)) tierArticles.set(srcMatch.tier, new Set());
      tierArticles.get(srcMatch.tier)!.add(file);
    }
    for (const c of companies) {
      const canonical = matchCompany(c, byExact, bySlug) || c;
      companyMentionCount.set(canonical, (companyMentionCount.get(canonical) || 0) + 1);
    }
    if (dateStr && isValidDate(dateStr)) {
      const month = dateStr.slice(0, 7); // YYYY-MM
      monthCount.set(month, (monthCount.get(month) || 0) + 1);
    }
  }

  // Build report
  const byRule: Record<string, number> = {};
  for (const i of issues) {
    byRule[i.rule] = (byRule[i.rule] || 0) + 1;
  }

  const filesWithIssues = new Set(issues.map(i => i.file));
  const report: LintReport = {
    timestamp: new Date().toISOString(),
    totalFiles: files.length,
    cleanFiles: files.length - filesWithIssues.size,
    issueCount: issues.length,
    errorCount: issues.filter(i => i.severity === "error").length,
    warningCount: issues.filter(i => i.severity === "warning").length,
    issues,
    byRule,
  };

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n📋 KB Lint Report — ${report.timestamp}\n`);
    console.log(`  Total files:  ${report.totalFiles}`);
    console.log(`  Clean files:  ${report.cleanFiles}`);
    console.log(`  Errors:       ${report.errorCount}`);
    console.log(`  Warnings:     ${report.warningCount}`);
    console.log(`\n  By rule:`);
    for (const [rule, count] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${rule}: ${count}`);
    }

    if (issues.length > 0) {
      console.log(`\n  Issues:`);
      for (const i of issues) {
        const icon = i.severity === "error" ? "✗" : "⚠";
        console.log(`    ${icon} [${i.rule}] ${i.file}: ${i.message}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // --stats: Source coverage statistics
  // ---------------------------------------------------------------------------

  if (statsMode) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`  📊 SOURCE COVERAGE STATISTICS`);
    console.log(`${"=".repeat(70)}\n`);

    // Articles per source (sorted by count desc)
    console.log(`  ── Articles per Source (top 30) ──`);
    const sortedSources = [...sourceCount.entries()].sort((a, b) => b[1] - a[1]);
    for (const [src, count] of sortedSources.slice(0, 30)) {
      const match = classifySource(src, "");
      const tierTag = match.tier ? `[T${match.tier}]` : "[???]";
      console.log(`    ${String(count).padStart(4)}  ${tierTag.padEnd(6)} ${src}`);
    }
    if (sortedSources.length > 30) {
      console.log(`    ... and ${sortedSources.length - 30} more sources`);
    }

    // Articles per tier
    console.log(`\n  ── Articles per Tier ──`);
    for (let t = 1; t <= 9; t++) {
      const count = tierCount.get(t) || 0;
      const label = SOURCE_TIERS[t].label;
      const flag = count < 5 ? " ⚠ LOW COVERAGE" : "";
      console.log(`    Tier ${t}: ${String(count).padStart(4)}  ${label}${flag}`);
    }
    const untiered = files.length - [...tierCount.values()].reduce((a, b) => a + b, 0);
    if (untiered > 0) {
      console.log(`    Untiered: ${String(untiered).padStart(2)}  (not matched to any tier)`);
    }

    // Articles per company (sorted by count desc)
    console.log(`\n  ── Articles per Company ──`);
    // Include all 39 tracked companies even if 0 mentions
    for (const co of companyList) {
      if (!companyMentionCount.has(co.title)) {
        companyMentionCount.set(co.title, 0);
      }
    }
    const sortedCompanies = [...companyMentionCount.entries()].sort((a, b) => b[1] - a[1]);
    for (const [company, count] of sortedCompanies) {
      const flag = count < 3 ? " ⚠ GAP" : "";
      console.log(`    ${String(count).padStart(4)}  ${company}${flag}`);
    }

    // Date distribution (articles per month)
    console.log(`\n  ── Articles per Month ──`);
    const sortedMonths = [...monthCount.entries()].sort();
    for (const [month, count] of sortedMonths) {
      const bar = "█".repeat(Math.min(count, 50));
      console.log(`    ${month}: ${String(count).padStart(4)}  ${bar}`);
    }

    // Coverage gaps summary
    console.log(`\n  ── Coverage Gaps ──`);
    const lowCompanies = sortedCompanies.filter(([, c]) => c < 3);
    if (lowCompanies.length > 0) {
      console.log(`    Companies with <3 articles (${lowCompanies.length}):`);
      for (const [company, count] of lowCompanies) {
        console.log(`      ${company}: ${count}`);
      }
    } else {
      console.log(`    All companies have 3+ articles.`);
    }

    const lowTiers: string[] = [];
    for (let t = 1; t <= 9; t++) {
      if ((tierCount.get(t) || 0) < 5) {
        lowTiers.push(`Tier ${t} (${SOURCE_TIERS[t].label}): ${tierCount.get(t) || 0}`);
      }
    }
    if (lowTiers.length > 0) {
      console.log(`    Tiers with <5 articles:`);
      for (const l of lowTiers) console.log(`      ${l}`);
    } else {
      console.log(`    All tiers have 5+ articles.`);
    }

    console.log("");
  }

  if (!jsonMode && !statsMode) console.log("");
  process.exit(report.errorCount > 0 ? 1 : 0);
}

main().catch(console.error);
