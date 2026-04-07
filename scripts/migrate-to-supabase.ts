/**
 * Migrate knowledge base markdown files into Supabase.
 * Usage: bun run scripts/migrate-to-supabase.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "fs/promises";
import { join, basename } from "path";

const SUPABASE_URL = "https://pmjqymxdaiwfpfglwqux.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY env var");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const KB = join(import.meta.dir, "..", "knowledge-base");
const ARTICLES_DIR = join(KB, "raw", "articles");
const COMPANIES_DIR = join(KB, "wiki", "companies");
const DRIVERS_DIR = join(KB, "wiki", "market-drivers");
const CONCEPTS_DIR = join(KB, "wiki", "concepts");

// Parse YAML frontmatter from markdown
function parseFrontmatter(raw: string): { meta: Record<string, any>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw };

  const meta: Record<string, any> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let val = line.slice(colon + 1).trim();

    // Parse YAML arrays: [a, b, c]
    if (val.startsWith("[") && val.endsWith("]")) {
      meta[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      meta[key] = val;
    }
  }
  return { meta, content: match[2].trim() };
}

// Extract title from first markdown heading
function extractTitle(content: string): string {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "Untitled";
}

async function migrateArticles() {
  console.log("--- Migrating articles ---");
  const files = (await readdir(ARTICLES_DIR)).filter((f) => f.endsWith(".md"));
  console.log(`Found ${files.length} articles`);

  // Collect all unique tags and company names
  const allTags = new Set<string>();
  const allCompanyNames = new Set<string>();
  const articleData: any[] = [];

  for (const file of files) {
    const raw = await readFile(join(ARTICLES_DIR, file), "utf-8");
    const { meta, content } = parseFrontmatter(raw);
    const slug = basename(file, ".md");
    const title = extractTitle(content);

    const companies: string[] = meta.companies || [];
    const tags: string[] = meta.tags || [];
    companies.forEach((c) => allCompanyNames.add(c));
    tags.forEach((t) => allTags.add(t));

    articleData.push({ slug, title, date: meta.date, source: meta.source, url: meta.url, category: meta.category, content, companies, tags });
  }

  // Insert tags
  const tagNames = [...allTags];
  if (tagNames.length > 0) {
    const { error } = await supabase.from("tags").upsert(
      tagNames.map((name) => ({ name })),
      { onConflict: "name" }
    );
    if (error) console.error("Tags insert error:", error.message);
  }

  // Fetch tag ID map
  const { data: tagRows } = await supabase.from("tags").select("id, name");
  const tagMap = new Map((tagRows || []).map((r) => [r.name, r.id]));

  // Fetch company slug->id map (companies inserted separately)
  const { data: companyRows } = await supabase.from("companies").select("id, name");
  const companyMap = new Map((companyRows || []).map((r) => [r.name, r.id]));

  // Insert articles in batches of 50
  for (let i = 0; i < articleData.length; i += 50) {
    const batch = articleData.slice(i, i + 50);
    const rows = batch.map(({ slug, title, date, source, url, category, content }) => ({
      slug, title, date, source, url, category, content,
    }));

    const { data: inserted, error } = await supabase.from("articles").upsert(rows, { onConflict: "slug" }).select("id, slug");
    if (error) {
      console.error(`Article batch ${i} error:`, error.message);
      continue;
    }

    const slugToId = new Map((inserted || []).map((r) => [r.slug, r.id]));

    // Build junction rows
    const articleCompanyRows: any[] = [];
    const articleTagRows: any[] = [];

    for (const art of batch) {
      const artId = slugToId.get(art.slug);
      if (!artId) continue;

      for (const compName of art.companies) {
        const compId = companyMap.get(compName);
        if (compId) articleCompanyRows.push({ article_id: artId, company_id: compId });
      }
      for (const tagName of art.tags) {
        const tagId = tagMap.get(tagName);
        if (tagId) articleTagRows.push({ article_id: artId, tag_id: tagId });
      }
    }

    if (articleCompanyRows.length > 0) {
      const { error: e } = await supabase.from("article_companies").upsert(articleCompanyRows, { onConflict: "article_id,company_id" });
      if (e) console.error("article_companies error:", e.message);
    }
    if (articleTagRows.length > 0) {
      const { error: e } = await supabase.from("article_tags").upsert(articleTagRows, { onConflict: "article_id,tag_id" });
      if (e) console.error("article_tags error:", e.message);
    }

    console.log(`  Articles ${i + 1}-${Math.min(i + 50, articleData.length)} inserted`);
  }
  console.log(`Done: ${articleData.length} articles, ${tagNames.length} tags`);
}

async function migrateCompanies() {
  console.log("--- Migrating companies ---");
  const files = (await readdir(COMPANIES_DIR)).filter((f) => f.endsWith(".md"));

  const rows = [];
  for (const file of files) {
    const raw = await readFile(join(COMPANIES_DIR, file), "utf-8");
    const { meta, content } = parseFrontmatter(raw);
    rows.push({
      slug: basename(file, ".md"),
      name: meta.title || extractTitle(content),
      ticker: meta.ticker || null,
      sector: meta.sector || null,
      subsector: meta.subsector || null,
      content,
    });
  }

  const { error } = await supabase.from("companies").upsert(rows, { onConflict: "slug" });
  if (error) console.error("Companies error:", error.message);
  else console.log(`Done: ${rows.length} companies`);
}

async function migrateMarketDrivers() {
  console.log("--- Migrating market drivers ---");
  const files = (await readdir(DRIVERS_DIR)).filter((f) => f.endsWith(".md"));

  const rows = [];
  for (const file of files) {
    const raw = await readFile(join(DRIVERS_DIR, file), "utf-8");
    const { meta, content } = parseFrontmatter(raw);
    rows.push({
      slug: basename(file, ".md"),
      title: meta.title || extractTitle(content),
      current_signal: meta.current_signal || null,
      content,
    });
  }

  const { error } = await supabase.from("market_drivers").upsert(rows, { onConflict: "slug" });
  if (error) console.error("Market drivers error:", error.message);
  else console.log(`Done: ${rows.length} market drivers`);
}

async function migrateConcepts() {
  console.log("--- Migrating concepts ---");
  const files = (await readdir(CONCEPTS_DIR)).filter((f) => f.endsWith(".md"));

  const rows = [];
  for (const file of files) {
    const raw = await readFile(join(CONCEPTS_DIR, file), "utf-8");
    const { meta, content } = parseFrontmatter(raw);
    rows.push({
      slug: basename(file, ".md"),
      title: meta.title || extractTitle(content),
      backlinks: meta.backlinks || [],
      content,
    });
  }

  const { error } = await supabase.from("concepts").upsert(rows, { onConflict: "slug" });
  if (error) console.error("Concepts error:", error.message);
  else console.log(`Done: ${rows.length} concepts`);
}

async function main() {
  console.log("Starting knowledge base migration to Supabase...\n");

  // Companies first (articles reference them)
  await migrateCompanies();
  await migrateMarketDrivers();
  await migrateConcepts();
  await migrateArticles();

  console.log("\nMigration complete!");
}

main().catch(console.error);
