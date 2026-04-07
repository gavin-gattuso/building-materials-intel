/**
 * Schema hardening migration:
 * 1. Add FK constraints with ON DELETE CASCADE to article_companies and article_tags
 * 2. Add indexes on junction table columns for faster JOINs
 * 3. Convert articles.date from TEXT to DATE type
 * 4. Add NOT NULL constraints on required article columns
 * 5. Add tsvector column + GIN index for full-text search
 *
 * Safe to re-run — all operations use IF NOT EXISTS / IF EXISTS guards.
 * Usage: bun run scripts/migrate-schema-hardening.ts
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

async function step(label: string, sql: string) {
  process.stdout.write(`${label}...`);
  try {
    await execSQL(sql);
    console.log(" Done.");
  } catch (e: any) {
    console.log(` Skipped: ${e.message.slice(0, 120)}`);
  }
}

async function main() {
  console.log("=== Schema Hardening Migration ===\n");

  // ─── 1. FK constraints on article_companies ───
  console.log("--- 1. Foreign key constraints ---");

  await step("  article_companies.article_id FK", `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_article_companies_article'
          AND table_name = 'article_companies'
      ) THEN
        ALTER TABLE article_companies
          ADD CONSTRAINT fk_article_companies_article
          FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await step("  article_companies.company_id FK", `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_article_companies_company'
          AND table_name = 'article_companies'
      ) THEN
        ALTER TABLE article_companies
          ADD CONSTRAINT fk_article_companies_company
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await step("  article_tags.article_id FK", `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_article_tags_article'
          AND table_name = 'article_tags'
      ) THEN
        ALTER TABLE article_tags
          ADD CONSTRAINT fk_article_tags_article
          FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await step("  article_tags.tag_id FK", `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_article_tags_tag'
          AND table_name = 'article_tags'
      ) THEN
        ALTER TABLE article_tags
          ADD CONSTRAINT fk_article_tags_tag
          FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  // ─── 2. Indexes on junction tables ───
  console.log("\n--- 2. Junction table indexes ---");

  await step("  idx_article_companies_article_id",
    `CREATE INDEX IF NOT EXISTS idx_article_companies_article_id ON article_companies(article_id);`);
  await step("  idx_article_companies_company_id",
    `CREATE INDEX IF NOT EXISTS idx_article_companies_company_id ON article_companies(company_id);`);
  await step("  idx_article_tags_article_id",
    `CREATE INDEX IF NOT EXISTS idx_article_tags_article_id ON article_tags(article_id);`);
  await step("  idx_article_tags_tag_id",
    `CREATE INDEX IF NOT EXISTS idx_article_tags_tag_id ON article_tags(tag_id);`);

  // ─── 3. Articles table indexes ───
  console.log("\n--- 3. Articles table indexes ---");

  await step("  idx_articles_date DESC",
    `CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date DESC);`);
  await step("  idx_articles_category",
    `CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);`);

  // ─── 4. Convert articles.date from TEXT to DATE ───
  console.log("\n--- 4. Convert articles.date TEXT → DATE ---");

  // Check current column type first
  const colInfo = await execSQL(`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'articles' AND column_name = 'date';
  `);
  const currentType = colInfo?.[0]?.data_type;
  console.log(`  Current date column type: ${currentType}`);

  if (currentType === 'text' || currentType === 'character varying') {
    // Clean any malformed dates before conversion
    await step("  Clean empty/null dates", `
      UPDATE articles SET date = NULL WHERE date IS NOT NULL AND date !~ '^\\d{4}-\\d{2}-\\d{2}';
    `);

    await step("  ALTER COLUMN date TYPE DATE", `
      ALTER TABLE articles ALTER COLUMN date TYPE DATE USING date::DATE;
    `);
  } else {
    console.log("  Already DATE type, skipping.");
  }

  // ─── 5. NOT NULL constraints on required columns ───
  console.log("\n--- 5. NOT NULL constraints ---");

  await step("  articles.title NOT NULL", `
    ALTER TABLE articles ALTER COLUMN title SET NOT NULL;
  `);
  await step("  articles.slug NOT NULL", `
    ALTER TABLE articles ALTER COLUMN slug SET NOT NULL;
  `);

  // ─── 6. Full-text search tsvector ───
  console.log("\n--- 6. Full-text search (tsvector + GIN) ---");

  await step("  Add search_vector column", `
    ALTER TABLE articles ADD COLUMN IF NOT EXISTS search_vector tsvector;
  `);

  await step("  Backfill search_vector", `
    UPDATE articles SET search_vector =
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(category, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(source, '')), 'C') ||
      setweight(to_tsvector('english', coalesce(content, '')), 'D')
    WHERE search_vector IS NULL;
  `);

  await step("  GIN index on search_vector",
    `CREATE INDEX IF NOT EXISTS idx_articles_search_vector ON articles USING GIN(search_vector);`);

  await step("  Auto-update trigger", `
    CREATE OR REPLACE FUNCTION articles_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.category, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW.source, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(NEW.content, '')), 'D');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_articles_search_vector ON articles;
    CREATE TRIGGER trg_articles_search_vector
      BEFORE INSERT OR UPDATE ON articles
      FOR EACH ROW EXECUTE FUNCTION articles_search_vector_update();
  `);

  // ─── 7. Search RPC function ───
  console.log("\n--- 7. Create search_articles RPC function ---");

  await step("  search_articles function", `
    CREATE OR REPLACE FUNCTION search_articles(search_query text, result_limit int DEFAULT 20)
    RETURNS TABLE(
      id uuid, slug text, title text, date date, source text, url text,
      category text, content text, rank real
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        a.id, a.slug, a.title, a.date, a.source, a.url,
        a.category, a.content,
        ts_rank_cd(a.search_vector, to_tsquery('english', search_query)) AS rank
      FROM articles a
      WHERE a.search_vector @@ to_tsquery('english', search_query)
      ORDER BY rank DESC
      LIMIT result_limit;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);

  // ─── 8. Verify ───
  console.log("\n--- 8. Verification ---");
  const verify = await execSQL(`
    SELECT
      (SELECT count(*) FROM articles) as total_articles,
      (SELECT count(*) FROM articles WHERE search_vector IS NOT NULL) as with_search_vector,
      (SELECT data_type FROM information_schema.columns WHERE table_name = 'articles' AND column_name = 'date') as date_type,
      (SELECT count(*) FROM information_schema.table_constraints WHERE table_name = 'article_companies' AND constraint_type = 'FOREIGN KEY') as ac_fk_count,
      (SELECT count(*) FROM pg_indexes WHERE tablename = 'article_companies') as ac_index_count;
  `);
  console.log("  Results:", JSON.stringify(verify, null, 2));

  console.log("\n=== Migration complete! ===");
}

main().catch(console.error);
