/**
 * Add deduplication columns and constraints to the articles table.
 * - content_hash: MD5 of title + first 500 chars of content
 * - UNIQUE constraint on url (where url is not empty)
 * - UNIQUE constraint on content_hash
 *
 * Usage: bun run scripts/migrate-dedup-schema.ts
 */

const PROJECT_REF = "pmjqymxdaiwfpfglwqux";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const API_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

if (!ACCESS_TOKEN) {
  console.error("Set SUPABASE_ACCESS_TOKEN env var");
  process.exit(1);
}

async function execSQL(sql: string): Promise<any> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
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

async function main() {
  console.log("Adding dedup columns and constraints...\n");

  // 1. Add content_hash column (nullable initially for backfill)
  console.log("1. Adding content_hash column...");
  try {
    await execSQL(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_hash TEXT;`);
    console.log("   Done.");
  } catch (e: any) {
    console.log(`   Skipped (may already exist): ${e.message}`);
  }

  // 2. Backfill content_hash for existing articles
  console.log("2. Backfilling content_hash for existing articles...");
  const result = await execSQL(`
    UPDATE articles
    SET content_hash = md5(title || left(content, 500))
    WHERE content_hash IS NULL;
  `);
  console.log("   Backfilled:", JSON.stringify(result));

  // 3. Add unique index on content_hash
  console.log("3. Adding UNIQUE index on content_hash...");
  try {
    await execSQL(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_content_hash
      ON articles (content_hash);
    `);
    console.log("   Done.");
  } catch (e: any) {
    console.log(`   Skipped: ${e.message}`);
  }

  // 4. Add unique index on url (only where url is non-empty)
  console.log("4. Adding UNIQUE index on url (non-empty only)...");
  try {
    await execSQL(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_url_unique
      ON articles (url)
      WHERE url IS NOT NULL AND url != '';
    `);
    console.log("   Done.");
  } catch (e: any) {
    console.log(`   Skipped: ${e.message}`);
  }

  // 5. Verify
  console.log("\n5. Verifying...");
  const counts = await execSQL(`
    SELECT
      count(*) as total,
      count(content_hash) as with_hash,
      count(DISTINCT url) FILTER (WHERE url IS NOT NULL AND url != '') as unique_urls
    FROM articles;
  `);
  console.log("   Result:", JSON.stringify(counts));

  console.log("\nMigration complete!");
}

main().catch(console.error);
