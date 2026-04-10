/**
 * Push knowledge base into Supabase via Management API.
 * Usage: bun run scripts/push-to-supabase.ts
 */
import { readdir, readFile } from "fs/promises";
import { join, basename } from "path";

const PROJECT_REF = "pmjqymxdaiwfpfglwqux";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const API_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

const KB = join(import.meta.dir, "..", "knowledge-base");

async function execSQL(sql: string): Promise<any> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SQL error (${res.status}): ${text}`);
  }
  return res.json();
}

function parseFrontmatter(raw: string) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {} as Record<string, any>, content: raw };
  const meta: Record<string, any> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let val = line.slice(colon + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      meta[key] = val.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      meta[key] = val;
    }
  }
  return { meta, content: match[2].trim() };
}

function extractTitle(content: string): string {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "Untitled";
}

// Use $$ dollar quoting to avoid escaping issues
function dollarQuote(s: string): string {
  // Find a tag that doesn't appear in the string
  let tag = "$$";
  let i = 0;
  while (s.includes(tag)) {
    tag = `$q${i}$`;
    i++;
  }
  return `${tag}${s}${tag}`;
}

async function migrateCompanies() {
  console.log("--- Companies ---");
  const dir = join(KB, "wiki", "companies");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));

  // Insert in batches of 5 (large content)
  for (let i = 0; i < files.length; i += 5) {
    const batch = files.slice(i, i + 5);
    const values = [];
    for (const file of batch) {
      const raw = await readFile(join(dir, file), "utf-8");
      const { meta, content } = parseFrontmatter(raw);
      const slug = basename(file, ".md");
      const name = meta.title || extractTitle(content);
      const ticker = meta.ticker ? dollarQuote(meta.ticker) : "NULL";
      const sector = meta.sector ? dollarQuote(meta.sector) : "NULL";
      const subsector = meta.subsector ? dollarQuote(meta.subsector) : "NULL";
      values.push(`(${dollarQuote(slug)}, ${dollarQuote(name)}, ${ticker}, ${sector}, ${subsector}, ${dollarQuote(content)})`);
    }
    const sql = `INSERT INTO companies (slug, name, ticker, sector, subsector, content) VALUES ${values.join(",\n")} ON CONFLICT (slug) DO NOTHING;`;
    await execSQL(sql);
    console.log(`  ${Math.min(i + 5, files.length)}/${files.length}`);
  }
}

async function migrateMarketDrivers() {
  console.log("--- Market Drivers ---");
  const dir = join(KB, "wiki", "market-drivers");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));

  const values = [];
  for (const file of files) {
    const raw = await readFile(join(dir, file), "utf-8");
    const { meta, content } = parseFrontmatter(raw);
    const slug = basename(file, ".md");
    const title = meta.title || extractTitle(content);
    const signal = meta.current_signal ? dollarQuote(meta.current_signal) : "NULL";
    values.push(`(${dollarQuote(slug)}, ${dollarQuote(title)}, ${signal}, ${dollarQuote(content)})`);
  }
  const sql = `INSERT INTO market_drivers (slug, title, current_signal, content) VALUES ${values.join(",\n")} ON CONFLICT (slug) DO NOTHING;`;
  await execSQL(sql);
  console.log(`  ${files.length}/${files.length}`);
}

async function migrateConcepts() {
  console.log("--- Concepts ---");
  const dir = join(KB, "wiki", "concepts");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));

  const values = [];
  for (const file of files) {
    const raw = await readFile(join(dir, file), "utf-8");
    const { meta, content } = parseFrontmatter(raw);
    const slug = basename(file, ".md");
    const title = meta.title || extractTitle(content);
    const backlinks = meta.backlinks
      ? `ARRAY[${(meta.backlinks as string[]).map((b) => dollarQuote(b)).join(",")}]`
      : "NULL";
    values.push(`(${dollarQuote(slug)}, ${dollarQuote(title)}, ${backlinks}, ${dollarQuote(content)})`);
  }
  const sql = `INSERT INTO concepts (slug, title, backlinks, content) VALUES ${values.join(",\n")} ON CONFLICT (slug) DO NOTHING;`;
  await execSQL(sql);
  console.log(`  ${files.length}/${files.length}`);
}

async function migrateArticles() {
  console.log("--- Articles ---");
  const dir = join(KB, "raw", "articles");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));

  // Collect all tags
  const allTags = new Set<string>();
  const articleData: any[] = [];

  for (const file of files) {
    const raw = await readFile(join(dir, file), "utf-8");
    const { meta, content } = parseFrontmatter(raw);
    const slug = basename(file, ".md");
    const title = extractTitle(content);
    const companies: string[] = meta.companies || [];
    const tags: string[] = meta.tags || [];
    tags.forEach((t) => allTags.add(t));
    articleData.push({ slug, title, date: meta.date || new Date().toISOString().split("T")[0], source: meta.source, url: meta.url, category: meta.category, content, companies, tags });
  }

  // Insert tags
  if (allTags.size > 0) {
    const tagValues = [...allTags].map((t) => `(${dollarQuote(t)})`).join(",\n");
    await execSQL(`INSERT INTO tags (name) VALUES ${tagValues} ON CONFLICT (name) DO NOTHING;`);
    console.log(`  ${allTags.size} tags inserted`);
  }

  // Insert articles in batches of 10
  for (let i = 0; i < articleData.length; i += 10) {
    const batch = articleData.slice(i, i + 10);
    const values = [];
    for (const a of batch) {
      const source = a.source ? dollarQuote(a.source) : "NULL";
      const url = a.url ? dollarQuote(a.url) : "NULL";
      const category = a.category ? dollarQuote(a.category) : "NULL";
      values.push(`(${dollarQuote(a.slug)}, ${dollarQuote(a.title)}, '${a.date}', ${source}, ${url}, ${category}, ${dollarQuote(a.content)})`);
    }
    const sql = `INSERT INTO articles (slug, title, date, source, url, category, content) VALUES ${values.join(",\n")} ON CONFLICT (slug) DO NOTHING;`;
    await execSQL(sql);
    console.log(`  Articles: ${Math.min(i + 10, articleData.length)}/${articleData.length}`);
  }

  // Link articles to companies
  console.log("  Linking articles to companies...");
  const junctionSqls: string[] = [];
  for (const a of articleData) {
    for (const compName of a.companies) {
      junctionSqls.push(
        `INSERT INTO article_companies (article_id, company_id) SELECT a.id, c.id FROM articles a, companies c WHERE a.slug = ${dollarQuote(a.slug)} AND c.name = ${dollarQuote(compName)} ON CONFLICT DO NOTHING`
      );
    }
  }
  // Execute junction inserts in batches of 50
  for (let i = 0; i < junctionSqls.length; i += 50) {
    const batch = junctionSqls.slice(i, i + 50);
    await execSQL(batch.join(";\n") + ";");
    console.log(`  Article-companies: ${Math.min(i + 50, junctionSqls.length)}/${junctionSqls.length}`);
  }

  // Link articles to tags
  console.log("  Linking articles to tags...");
  const tagJunctions: string[] = [];
  for (const a of articleData) {
    for (const tagName of a.tags) {
      tagJunctions.push(
        `INSERT INTO article_tags (article_id, tag_id) SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = ${dollarQuote(a.slug)} AND t.name = ${dollarQuote(tagName)} ON CONFLICT DO NOTHING`
      );
    }
  }
  for (let i = 0; i < tagJunctions.length; i += 50) {
    const batch = tagJunctions.slice(i, i + 50);
    await execSQL(batch.join(";\n") + ";");
    console.log(`  Article-tags: ${Math.min(i + 50, tagJunctions.length)}/${tagJunctions.length}`);
  }
}

async function main() {
  console.log("Pushing knowledge base to Supabase...\n");

  // Test connection
  const test = await execSQL("SELECT 1 as ok;");
  console.log("Connection OK\n");

  await migrateCompanies();
  await migrateMarketDrivers();
  await migrateConcepts();
  await migrateArticles();

  // Final counts
  const counts = await execSQL(`
    SELECT
      (SELECT count(*) FROM companies) as companies,
      (SELECT count(*) FROM market_drivers) as market_drivers,
      (SELECT count(*) FROM concepts) as concepts,
      (SELECT count(*) FROM articles) as articles,
      (SELECT count(*) FROM tags) as tags,
      (SELECT count(*) FROM article_companies) as article_companies,
      (SELECT count(*) FROM article_tags) as article_tags;
  `);
  console.log("\n--- Final counts ---");
  console.log(JSON.stringify(counts, null, 2));
}

main().catch(console.error);
