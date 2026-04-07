import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const data = JSON.parse(await readFile(join(import.meta.dir, "kb-parsed.json"), "utf-8"));

function esc(s: string): string {
  if (!s) return "";
  return s.replace(/'/g, "''");
}

// Companies SQL
let companiesSql = "";
for (const c of data.companies) {
  const name = esc(c.title);
  const slug = esc(c.slug);
  const ticker = c.meta.ticker ? `'${esc(c.meta.ticker)}'` : "NULL";
  const sector = c.meta.sector ? `'${esc(c.meta.sector)}'` : "NULL";
  const subsector = c.meta.subsector ? `'${esc(c.meta.subsector)}'` : "NULL";
  const content = esc(c.content);
  companiesSql += `INSERT INTO companies (slug, name, ticker, sector, subsector, content) VALUES ('${slug}', '${name}', ${ticker}, ${sector}, ${subsector}, '${content}') ON CONFLICT (slug) DO NOTHING;\n`;
}
await writeFile(join(import.meta.dir, "sql-companies.sql"), companiesSql);

// Market drivers SQL
let driversSql = "";
for (const d of data.drivers) {
  const title = esc(d.title);
  const slug = esc(d.slug);
  const signal = d.meta.current_signal ? `'${esc(d.meta.current_signal)}'` : "NULL";
  const content = esc(d.content);
  driversSql += `INSERT INTO market_drivers (slug, title, current_signal, content) VALUES ('${slug}', '${title}', ${signal}, '${content}') ON CONFLICT (slug) DO NOTHING;\n`;
}
await writeFile(join(import.meta.dir, "sql-drivers.sql"), driversSql);

// Concepts SQL
let conceptsSql = "";
for (const c of data.concepts) {
  const title = esc(c.title);
  const slug = esc(c.slug);
  const backlinks = c.meta.backlinks ? `ARRAY[${(c.meta.backlinks as string[]).map(b => `'${esc(b)}'`).join(",")}]` : "NULL";
  const content = esc(c.content);
  conceptsSql += `INSERT INTO concepts (slug, title, backlinks, content) VALUES ('${slug}', '${title}', ${backlinks}, '${content}') ON CONFLICT (slug) DO NOTHING;\n`;
}
await writeFile(join(import.meta.dir, "sql-concepts.sql"), conceptsSql);

// Tags - collect unique
const allTags = new Set<string>();
for (const a of data.articles) {
  const tags: string[] = a.meta.tags || [];
  tags.forEach(t => allTags.add(t));
}
let tagsSql = "";
for (const t of allTags) {
  tagsSql += `INSERT INTO tags (name) VALUES ('${esc(t)}') ON CONFLICT (name) DO NOTHING;\n`;
}
await writeFile(join(import.meta.dir, "sql-tags.sql"), tagsSql);

// Articles SQL - in batches of 25
for (let i = 0; i < data.articles.length; i += 25) {
  const batch = data.articles.slice(i, i + 25);
  let sql = "";
  for (const a of batch) {
    const slug = esc(a.slug);
    const title = esc(a.title);
    const date = a.meta.date || "2026-01-01";
    const source = a.meta.source ? `'${esc(a.meta.source)}'` : "NULL";
    const url = a.meta.url ? `'${esc(a.meta.url)}'` : "NULL";
    const category = a.meta.category ? `'${esc(a.meta.category)}'` : "NULL";
    const content = esc(a.content);
    sql += `INSERT INTO articles (slug, title, date, source, url, category, content) VALUES ('${slug}', '${title}', '${date}', ${source}, ${url}, ${category}, '${content}') ON CONFLICT (slug) DO NOTHING;\n`;
  }
  await writeFile(join(import.meta.dir, `sql-articles-${String(i).padStart(3,"0")}.sql`), sql);
}

// Article-company junction SQL
let junctionSql = "";
for (const a of data.articles) {
  const companies: string[] = a.meta.companies || [];
  for (const compName of companies) {
    junctionSql += `INSERT INTO article_companies (article_id, company_id) SELECT a.id, c.id FROM articles a, companies c WHERE a.slug = '${esc(a.slug)}' AND c.name = '${esc(compName)}' ON CONFLICT DO NOTHING;\n`;
  }
}
await writeFile(join(import.meta.dir, "sql-article-companies.sql"), junctionSql);

// Article-tag junction SQL
let tagJunctionSql = "";
for (const a of data.articles) {
  const tags: string[] = a.meta.tags || [];
  for (const tagName of tags) {
    tagJunctionSql += `INSERT INTO article_tags (article_id, tag_id) SELECT a.id, t.id FROM articles a, tags t WHERE a.slug = '${esc(a.slug)}' AND t.name = '${esc(tagName)}' ON CONFLICT DO NOTHING;\n`;
  }
}
await writeFile(join(import.meta.dir, "sql-article-tags.sql"), tagJunctionSql);

console.log(`Generated SQL files: ${data.companies.length} companies, ${data.drivers.length} drivers, ${data.concepts.length} concepts, ${[...allTags].length} tags, ${data.articles.length} articles`);
console.log(`Article batches: ${Math.ceil(data.articles.length / 25)}`);
