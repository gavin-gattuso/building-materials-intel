/**
 * Sync local KB articles to Supabase that are missing from the database.
 * Uses the same REST API approach as the nightly trigger.
 * Includes multi-layer dedup: slug, URL, and content_hash (MD5 of title + first 500 chars).
 *
 * Usage: bun run scripts/sync-local-to-supabase.ts
 */
import { readdir, readFile } from "fs/promises";
import { join, basename } from "path";
import matter from "gray-matter";
import { createHash } from "crypto";

const SUPABASE_URL = "https://pmjqymxdaiwfpfglwqux.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const KB = join(import.meta.dir, "..", "knowledge-base");
const HEADERS = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "resolution=merge-duplicates",
};

/** Compute content hash: MD5 of title + first 500 chars of content body */
function computeContentHash(title: string, content: string): string {
  return createHash("md5").update(title + content.slice(0, 500)).digest("hex");
}

async function getSupabaseSlugs(): Promise<Set<string>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=slug&limit=10000`, {
    headers: HEADERS,
  });
  const data = await res.json() as { slug: string }[];
  return new Set(data.map(r => r.slug));
}

async function getSupabaseUrls(): Promise<Set<string>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=url&url=not.is.null&url=not.eq.&limit=10000`, {
    headers: HEADERS,
  });
  const data = await res.json() as { url: string }[];
  return new Set(data.map(r => r.url));
}

async function getSupabaseHashes(): Promise<Set<string>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=content_hash&content_hash=not.is.null&limit=10000`, {
    headers: HEADERS,
  });
  const data = await res.json() as { content_hash: string }[];
  return new Set(data.map(r => r.content_hash));
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
  url: string; category: string; content: string; content_hash: string;
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
  console.log("Syncing local KB → Supabase (with multi-layer dedup)...\n");

  // Get existing dedup keys from Supabase
  const [existingSlugs, existingUrls, existingHashes] = await Promise.all([
    getSupabaseSlugs(),
    getSupabaseUrls(),
    getSupabaseHashes(),
  ]);
  console.log(`Supabase has ${existingSlugs.size} articles, ${existingUrls.size} unique URLs, ${existingHashes.size} content hashes`);

  // Get company name→id map
  const companyMap = await getCompanyMap();

  // Read all local articles
  const dir = join(KB, "raw", "articles");
  const files = (await readdir(dir)).filter(f => f.endsWith(".md"));
  console.log(`Local KB has ${files.length} articles\n`);

  let synced = 0;
  let skippedSlug = 0;
  let skippedUrl = 0;
  let skippedHash = 0;
  let errors = 0;

  for (const file of files) {
    const slug = basename(file, ".md");

    // Layer 1: slug dedup
    if (existingSlugs.has(slug)) {
      skippedSlug++;
      continue;
    }

    try {
      const raw = await readFile(join(dir, file), "utf-8");
      const { data: fm, content } = matter(raw);
      const title = content.split("\n").find(l => l.startsWith("# "))?.replace(/^#\s+/, "") || slug;
      const date = fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : String(fm.date || "").slice(0, 10);
      const url = String(fm.url || "");

      // Layer 2: URL dedup
      if (url && existingUrls.has(url)) {
        console.log(`  SKIP (dup URL): ${slug} → ${url}`);
        skippedUrl++;
        continue;
      }

      // Layer 3: content hash dedup
      const contentHash = computeContentHash(title, content);
      if (existingHashes.has(contentHash)) {
        console.log(`  SKIP (dup content hash): ${slug}`);
        skippedHash++;
        continue;
      }

      await upsertArticle({
        slug,
        title,
        date,
        source: String(fm.source || ""),
        url,
        category: String(fm.category || ""),
        content,
        content_hash: contentHash,
      });

      // Track for further dedup within this run
      existingSlugs.add(slug);
      if (url) existingUrls.add(url);
      existingHashes.add(contentHash);

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

  console.log(`\nDone: ${synced} synced, ${skippedSlug} dup slug, ${skippedUrl} dup URL, ${skippedHash} dup content, ${errors} errors`);

  // Verify final count
  const finalSlugs = await getSupabaseSlugs();
  console.log(`Supabase now has ${finalSlugs.size} articles`);
}

main().catch(console.error);
