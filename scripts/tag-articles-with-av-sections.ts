/**
 * Tag articles with relevant AV report sections using keyword-based semantic matching.
 * Maps each article's category, tags, companies, and content to the 9 AV report sections.
 *
 * Usage: bun run scripts/tag-articles-with-av-sections.ts [--dry-run]
 */
import { readdir, readFile } from "fs/promises";
import { join, basename } from "path";
import matter from "gray-matter";
import { TRACKED_COMPANY_NAMES } from "../lib/constants";

// Supports both REST API (SUPABASE_SERVICE_ROLE_KEY) and Management API (SUPABASE_ACCESS_TOKEN)
const PROJECT_REF = "pmjqymxdaiwfpfglwqux";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";
const KB_DIR = join(import.meta.dir, "..", "knowledge-base", "raw", "articles");
const dryRun = process.argv.includes("--dry-run");

const useManagementAPI = !SUPABASE_KEY && !!ACCESS_TOKEN;

if (!SUPABASE_KEY && !ACCESS_TOKEN) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ACCESS_TOKEN env var");
  process.exit(1);
}

const HEADERS = SUPABASE_KEY ? {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates",
} : null;

async function execSQL(sql: string): Promise<any> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`SQL error (${res.status}): ${await res.text()}`);
  return res.json();
}

async function queryDB(restPath: string): Promise<any> {
  if (HEADERS) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${restPath}`, { headers: HEADERS });
    return res.json();
  }
  // Fall back to Management API SQL
  // Parse the rest path to SQL (simple cases only)
  throw new Error("Complex REST queries require SUPABASE_SERVICE_ROLE_KEY");
}

// Section slug → matching rules (keywords in category, tags, content)
const SECTION_RULES: Record<string, { keywords: string[]; categories: string[]; weight: number }> = {
  "intro-exec-summary": {
    keywords: ["overview", "outlook", "forecast", "summary", "key takeaway", "highlights"],
    categories: [],
    weight: 0.3, // Low base — most articles get tagged here only if they're broad
  },
  "market-scope": {
    keywords: ["market size", "market share", "TAM", "addressable market", "market definition", "segment", "subsegment", "building materials market"],
    categories: [],
    weight: 0.5,
  },
  "market-context-outlook": {
    keywords: ["outlook", "forecast", "trend", "conditions", "sentiment", "economic", "macro", "environment"],
    categories: ["GDP & Consumer Confidence", "Pricing & Cost Trends"],
    weight: 0.5,
  },
  "drivers-market-health": {
    keywords: ["interest rate", "mortgage", "labor", "workforce", "material cost", "energy cost", "demand", "housing", "infrastructure", "credit", "lending", "gdp", "consumer confidence", "fed", "fomc"],
    categories: ["Interest & Mortgage Rates", "Labor Dynamics", "Material & Energy Costs", "Demand Visibility", "Government Infrastructure Spending", "Credit Availability & Lending Standards", "Credit & Lending", "GDP Growth & Consumer Confidence"],
    weight: 0.7,
  },
  "public-company-performance": {
    keywords: ["earnings", "revenue", "ebitda", "margin", "guidance", "quarterly", "annual results", "profit", "fiscal", "eps", "share price"],
    categories: ["Company Earnings & Performance", "Capital Markets & Investment"],
    weight: 0.8,
  },
  "positioning-eoy": {
    keywords: ["strategy", "positioning", "year-end", "eoy", "second half", "h2", "outlook", "planning", "backlog"],
    categories: [],
    weight: 0.4,
  },
  "trend-continuity-retrospective": {
    keywords: ["trend", "cycle", "historical", "compared to", "year-over-year", "yoy", "prior year", "retrospective", "continuity", "pattern"],
    categories: [],
    weight: 0.4,
  },
  "how-av-can-help": {
    keywords: ["consulting", "advisory", "due diligence", "transaction", "valuation", "strategic"],
    categories: ["M&A and Corporate Strategy"],
    weight: 0.3,
  },
  "public-company-snapshot": {
    keywords: ["stock", "share price", "market cap", "pe ratio", "dividend", "analyst", "upgrade", "downgrade", "rating"],
    categories: ["Capital Markets & Investment", "Company Earnings & Performance"],
    weight: 0.6,
  },
};

// The 35 tracked companies trigger public-company-performance tagging (from lib/constants.ts)

function scoreArticleForSection(
  sectionSlug: string,
  article: { category: string; tags: string[]; companies: string[]; content: string; title: string }
): number {
  const rule = SECTION_RULES[sectionSlug];
  if (!rule) return 0;

  let score = 0;
  const lower = (article.content + " " + article.title).toLowerCase();
  const categoryLower = article.category.toLowerCase();

  // Category match (strong signal)
  for (const cat of rule.categories) {
    if (categoryLower.includes(cat.toLowerCase())) {
      score += 0.4;
      break;
    }
  }

  // Keyword matches in content/title
  let keywordHits = 0;
  for (const kw of rule.keywords) {
    if (lower.includes(kw.toLowerCase())) keywordHits++;
  }
  if (rule.keywords.length > 0) {
    score += Math.min(0.4, (keywordHits / rule.keywords.length) * 0.6);
  }

  // Company-specific boost for performance sections
  if (sectionSlug === "public-company-performance" || sectionSlug === "public-company-snapshot") {
    for (const c of article.companies) {
      if (TRACKED_COMPANY_NAMES.has(c)) {
        score += 0.2;
        break;
      }
    }
  }

  // M&A boost for how-av-can-help
  if (sectionSlug === "how-av-can-help") {
    const maTags = ["m&a", "acquisition", "merger", "divestiture", "ipo", "private equity"];
    for (const t of article.tags) {
      if (maTags.includes(t.toLowerCase())) {
        score += 0.3;
        break;
      }
    }
  }

  // Apply section weight
  score *= rule.weight;

  return Math.min(1.0, score);
}

async function main() {
  console.log(`Tagging articles with AV report sections${dryRun ? " (DRY RUN)" : ""}...`);
  console.log(`Using ${useManagementAPI ? "Management API" : "REST API"}\n`);

  // Get sections from Supabase
  let sections: { id: string; slug: string }[];
  let articles: { id: string; slug: string; title: string; category: string; content: string }[];

  if (useManagementAPI) {
    sections = await execSQL("SELECT id, slug FROM av_report_sections ORDER BY section_order;") as any;
    articles = await execSQL("SELECT id, slug, title, category, content FROM articles;") as any;
  } else {
    const sectionsRes = await fetch(`${SUPABASE_URL}/rest/v1/av_report_sections?select=id,slug&order=section_order`, { headers: HEADERS! });
    sections = (await sectionsRes.json()) as any[];
    const articlesRes = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=id,slug,title,category,content&limit=10000`, { headers: HEADERS! });
    articles = (await articlesRes.json()) as any[];
  }

  console.log(`Loaded ${sections.length} AV report sections`);
  console.log(`Loaded ${articles.length} articles from Supabase`);

  // Load local articles for tags/companies (not stored in Supabase articles table)
  const localFiles = (await readdir(KB_DIR)).filter(f => f.endsWith(".md"));
  const localMeta = new Map<string, { tags: string[]; companies: string[] }>();
  for (const f of localFiles) {
    const raw = await readFile(join(KB_DIR, f), "utf-8");
    const { data: fm } = matter(raw);
    const slug = basename(f, ".md");
    localMeta.set(slug, {
      tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
      companies: Array.isArray(fm.companies) ? fm.companies.map(String) : [],
    });
  }

  // Score and tag
  const THRESHOLD = 0.15;
  let tagged = 0;
  let skipped = 0;
  const sectionCounts: Record<string, number> = {};
  const insertBatch: string[] = [];

  for (const article of articles) {
    const meta = localMeta.get(article.slug) || { tags: [], companies: [] };
    const articleData = {
      category: article.category || "",
      tags: meta.tags,
      companies: meta.companies,
      content: article.content || "",
      title: article.title || "",
    };

    for (const section of sections) {
      const score = scoreArticleForSection(section.slug, articleData);
      if (score < THRESHOLD) continue;

      sectionCounts[section.slug] = (sectionCounts[section.slug] || 0) + 1;

      if (!dryRun) {
        if (useManagementAPI) {
          const roundedScore = Math.round(score * 100) / 100;
          insertBatch.push(`('${article.id}', '${section.id}', ${roundedScore})`);
        } else {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/article_av_sections`, {
            method: "POST",
            headers: HEADERS!,
            body: JSON.stringify({
              article_id: article.id,
              section_id: section.id,
              relevance_score: Math.round(score * 100) / 100,
            }),
          });
          if (res.ok) tagged++;
          else skipped++;
        }
      }
      tagged++;
    }
  }

  // Batch insert via Management API
  if (useManagementAPI && !dryRun && insertBatch.length > 0) {
    console.log(`\nInserting ${insertBatch.length} tags via SQL...`);
    // Insert in batches of 100
    for (let i = 0; i < insertBatch.length; i += 100) {
      const batch = insertBatch.slice(i, i + 100);
      const sql = `INSERT INTO article_av_sections (article_id, section_id, relevance_score) VALUES ${batch.join(",\n")} ON CONFLICT (article_id, section_id) DO NOTHING;`;
      await execSQL(sql);
      console.log(`  Batch ${Math.min(i + 100, insertBatch.length)}/${insertBatch.length}`);
    }
  }

  console.log(`\nResults:`);
  console.log(`  Tagged: ${tagged}`);
  console.log(`  Skipped (dup): ${skipped}`);
  console.log(`\n  Articles per section:`);
  for (const [slug, count] of Object.entries(sectionCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${slug}: ${count}`);
  }
}

main().catch(console.error);
