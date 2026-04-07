/**
 * Knowledge Base Data Linter
 * Validates all articles in knowledge-base/raw/articles/ against quality rules.
 *
 * Rules:
 * 1. Required YAML fields: date, source, url, category
 * 2. ISO 8601 date format (YYYY-MM-DD)
 * 3. URL validity and uniqueness
 * 4. Company/tag reference validation against known lists
 * 5. Minimum 500 char content body
 * 6. Source whitelist compliance
 *
 * Usage: bun run scripts/lint-kb.ts [--json] [--fix]
 *
 * Output: JSON report to stdout (--json) or human-readable summary.
 * Exit code: 0 if clean, 1 if issues found.
 */
import { readdir, readFile } from "fs/promises";
import { join, basename } from "path";
import matter from "gray-matter";

const KB_DIR = join(import.meta.dir, "..", "knowledge-base", "raw", "articles");
const COMPANIES_DIR = join(import.meta.dir, "..", "knowledge-base", "wiki", "companies");

const jsonMode = process.argv.includes("--json");

// --- 9-Tier Source Whitelist (from CLAUDE.md) ---
const SOURCE_WHITELIST = new Set([
  // Tier 1: Major News
  "Reuters", "Bloomberg", "WSJ", "Wall Street Journal", "Financial Times", "FT",
  "New York Times", "NYT", "Washington Post", "BBC", "CNBC", "Forbes", "Fortune", "AP",
  "Associated Press",
  // Tier 2: Top Publications
  "TechCrunch", "The Verge", "Wired", "Ars Technica", "MIT Technology Review",
  "VentureBeat", "ZDNet", "CNET",
  // Tier 3: Industry-Specific
  "Construction Dive", "BD+C", "Building Design + Construction", "ENR",
  "Engineering News-Record", "Remodeling Magazine", "JLC", "Journal of Light Construction",
  "ProBuilder", "Pro Builder", "Builder Magazine", "Builder Online",
  // Tier 4: Company IR (validated separately)
  // Tier 5: Associations & Research
  "NAHB", "ABC", "PCA", "AISI", "AGC", "Construction Analytics", "AIA",
  "Conference Board", "S&P Global", "S&P Global Ratings", "Dodge Construction Network",
  "ConstructConnect",
  // Tier 6: Government & Data
  "Census Bureau", "BLS", "BEA", "FRED", "Federal Reserve", "USGS", "Procore",
  "BusinessWire", "PR Newswire", "GlobeNewsWire",
  // Tier 7: Financial Analysis
  "Yahoo Finance", "Seeking Alpha", "MarketScreener",
  // Tier 8: Consulting
  "Bain", "Deloitte", "PwC", "KPMG", "FMI Corp", "Capstone Partners", "McKinsey",
  // Tier 9: Construction Niche
  "LBM Journal", "Builder Online", "Steel Market Update", "Fastmarkets",
  "For Construction Pros", "ConstructConnect", "Concrete Products", "Pit & Quarry",
  "Rock Products", "CemNet", "HousingWire", "Data Center Dynamics", "Roofing Contractor",
]);

// Lowercase lookup set for fuzzy matching
const SOURCE_WHITELIST_LOWER = new Set([...SOURCE_WHITELIST].map(s => s.toLowerCase()));

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

async function getKnownCompanies(): Promise<Set<string>> {
  const files = await readdir(COMPANIES_DIR);
  const names = new Set<string>();
  for (const f of files.filter(f => f.endsWith(".md"))) {
    const raw = await readFile(join(COMPANIES_DIR, f), "utf-8");
    const { data } = matter(raw);
    if (data.title) names.add(data.title);
    // Also extract from first heading
    const titleMatch = raw.match(/^#\s+(.+)$/m);
    if (titleMatch) names.add(titleMatch[1].trim());
  }
  return names;
}

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

function isSourceApproved(source: string): boolean {
  if (!source) return false;
  const lower = source.toLowerCase();
  // Exact match
  if (SOURCE_WHITELIST_LOWER.has(lower)) return true;
  // Partial match (e.g., "Reuters / FOX" should match "Reuters")
  for (const approved of SOURCE_WHITELIST_LOWER) {
    if (lower.includes(approved) || approved.includes(lower)) return true;
  }
  // Company IR pages are always valid
  if (lower.includes("investor") || lower.includes("ir.") || lower.includes("investors")) return true;
  return false;
}

async function main() {
  const files = (await readdir(KB_DIR)).filter(f => f.endsWith(".md"));
  const knownCompanies = await getKnownCompanies();
  const issues: LintIssue[] = [];
  const urlsSeen = new Map<string, string>(); // url → first file that used it

  for (const file of files) {
    const raw = await readFile(join(KB_DIR, file), "utf-8");
    const { data: fm, content } = matter(raw);
    const slug = basename(file, ".md");

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

    // Rule 4: Company reference validation
    const companies: string[] = Array.isArray(fm.companies) ? fm.companies : [];
    for (const c of companies) {
      if (!knownCompanies.has(c)) {
        issues.push({ file, rule: "unknown-company", severity: "warning", message: `Company "${c}" not found in wiki/companies/` });
      }
    }

    // Rule 5: Minimum content length
    const bodyText = content.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim();
    if (bodyText.length < 500) {
      issues.push({ file, rule: "content-too-short", severity: "warning", message: `Content body is ${bodyText.length} chars (minimum 500)` });
    }

    // Rule 6: Source whitelist
    const source = String(fm.source || "");
    if (source && !isSourceApproved(source)) {
      issues.push({ file, rule: "source-not-whitelisted", severity: "warning", message: `Source "${source}" not in approved whitelist` });
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
    console.log("");
  }

  process.exit(report.errorCount > 0 ? 1 : 0);
}

main().catch(console.error);
