import { readdir, readFile, writeFile } from "fs/promises";
import { join, basename } from "path";

const KB = join(import.meta.dir, "..", "knowledge-base");

function parseFrontmatter(raw: string) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {} as Record<string,any>, content: raw };
  const meta: Record<string,any> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let val = line.slice(colon + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      meta[key] = val.slice(1,-1).split(",").map(s => s.trim()).filter(Boolean);
    } else { meta[key] = val; }
  }
  return { meta, content: match[2].trim() };
}

function extractTitle(content: string): string {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "Untitled";
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

async function parseDir(dir: string, type: string) {
  const files = (await readdir(dir)).filter(f => f.endsWith(".md"));
  const results = [];
  for (const file of files) {
    const raw = await readFile(join(dir, file), "utf-8");
    const { meta, content } = parseFrontmatter(raw);
    results.push({ slug: basename(file, ".md"), meta, content, title: meta.title || extractTitle(content) });
  }
  return results;
}

// Generate SQL
async function main() {
  // Companies
  const companies = await parseDir(join(KB, "wiki", "companies"), "company");
  const drivers = await parseDir(join(KB, "wiki", "market-drivers"), "driver");
  const concepts = await parseDir(join(KB, "wiki", "concepts"), "concept");
  const articles = await parseDir(join(KB, "raw", "articles"), "article");
  
  // Output as JSON for processing
  const output = { companies, drivers, concepts, articles };
  await writeFile(join(import.meta.dir, "kb-parsed.json"), JSON.stringify(output));
  
  console.log(`Parsed: ${companies.length} companies, ${drivers.length} drivers, ${concepts.length} concepts, ${articles.length} articles`);
}

main();
