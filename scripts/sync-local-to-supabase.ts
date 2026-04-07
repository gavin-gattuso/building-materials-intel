/**
 * Sync local KB articles to Supabase that are missing from the database.
 * Uses the same REST API approach as the nightly trigger.
 *
 * Usage: bun run scripts/sync-local-to-supabase.ts
 */
import { readdir, readFile } from "fs/promises";
import { join, basename } from "path";
import matter from "gray-matter";

const SUPABASE_URL = "https://pmjqymxdaiwfpfglwqux.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtanF5bXhkYWl3ZnBmZ2x3cXV4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMDQ5NywiZXhwIjoyMDkxMDg2NDk3fQ.tN5uLhlUGVzSBunwNpHHyiV53XPxT2FmI6orae2WTFU";
const KB = join(import.meta.dir, "..", "knowledge-base");
const HEADERS = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "resolution=merge-duplicates",
};

async function getSupabaseSlugs(): Promise<Set<string>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=slug&limit=10000`, {
    headers: HEADERS,
  });
  const data = await res.json() as { slug: string }[];
  return new Set(data.map(r => r.slug));
}

async function getCompanyMap(): Promise<Record<string, string>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?select=id,name`, {
    headers: HEADERS,
  });
  const data = await res.json() as { id: string; name: string }[];
  const map: Record<string, string> = {};
  for (const c of data) map[c.name] = c.id;
  return map;
}

async function upsertArticle(article: {
  slug: string; title: string; date: string; source: string;
  url: string; category: string; content: string;
}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(article),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upsert ${article.slug}: ${res.status} ${text}`);
  }
}

async function getArticleId(slug: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=id&slug=eq.${slug}`, {
    headers: HEADERS,
  });
  const data = await res.json() as { id: string }[];
  return data[0]?.id || null;
}

async function linkArticleCompany(articleId: string, companyId: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/article_companies`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ article_id: articleId, company_id: companyId }),
  });
}

async function main() {
  console.log("Syncing local KB → Supabase...\n");

  // Get existing slugs in Supabase
  const existingSlugs = await getSupabaseSlugs();
  console.log(`Supabase has ${existingSlugs.size} articles`);

  // Get company name→id map
  const companyMap = await getCompanyMap();

  // Read all local articles
  const dir = join(KB, "raw", "articles");
  const files = (await readdir(dir)).filter(f => f.endsWith(".md"));
  console.log(`Local KB has ${files.length} articles\n`);

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    const slug = basename(file, ".md");
    if (existingSlugs.has(slug)) {
      skipped++;
      continue;
    }

    try {
      const raw = await readFile(join(dir, file), "utf-8");
      const { data: fm, content } = matter(raw);
      const title = content.split("\n").find(l => l.startsWith("# "))?.replace(/^#\s+/, "") || slug;
      const date = fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : String(fm.date || "").slice(0, 10);

      await upsertArticle({
        slug,
        title,
        date,
        source: String(fm.source || ""),
        url: String(fm.url || ""),
        category: String(fm.category || ""),
        content,
      });

      // Link to companies
      const companies: string[] = Array.isArray(fm.companies) ? fm.companies : [];
      if (companies.length > 0) {
        const articleId = await getArticleId(slug);
        if (articleId) {
          for (const name of companies) {
            const companyId = companyMap[name];
            if (companyId) {
              await linkArticleCompany(articleId, companyId);
            }
          }
        }
      }

      console.log(`  ✓ Synced: ${slug} (${companies.length} companies linked)`);
      synced++;
    } catch (err: any) {
      console.error(`  ✗ Error: ${slug}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${synced} synced, ${skipped} already existed, ${errors} errors`);

  // Verify final count
  const finalSlugs = await getSupabaseSlugs();
  console.log(`Supabase now has ${finalSlugs.size} articles`);
}

main().catch(console.error);
