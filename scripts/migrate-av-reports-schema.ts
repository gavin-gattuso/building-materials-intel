/**
 * Create AV Report tables in Supabase.
 * - av_report_sections: stores the 9 standard AV report sections
 * - article_av_sections: links articles to relevant AV report sections
 *
 * Usage: bun run scripts/migrate-av-reports-schema.ts
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
  console.log("Creating AV Report tables...\n");

  // 1. Create av_report_sections table
  console.log("1. Creating av_report_sections table...");
  await execSQL(`
    CREATE TABLE IF NOT EXISTS av_report_sections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      section_order INT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  console.log("   Done.");

  // 2. Seed the 9 standard AV report sections
  console.log("2. Seeding AV report sections...");
  await execSQL(`
    INSERT INTO av_report_sections (slug, title, description, section_order) VALUES
      ('intro-exec-summary', 'Intro & Executive Summary', 'High-level overview and key takeaways for the reporting period', 1),
      ('market-scope', 'Market Scope', 'Definition and boundaries of the building materials market being analyzed', 2),
      ('market-context-outlook', 'Market Context & Outlook', 'Current market conditions, trends, and forward-looking analysis', 3),
      ('drivers-market-health', 'Drivers of Market Health', 'Analysis of the 7 key market health drivers: rates, labor, materials, demand, infrastructure, credit, GDP', 4),
      ('public-company-performance', 'Public Company Performance', 'Financial performance analysis of tracked public building materials companies', 5),
      ('positioning-eoy', 'Positioning for EOY', 'Strategic positioning recommendations and year-end outlook', 6),
      ('trend-continuity-retrospective', 'Trend Continuity & Retrospective', 'Assessment of ongoing trends and look-back analysis of prior predictions', 7),
      ('how-av-can-help', 'How AV Can Help', 'Applied Value service offerings and value propositions relevant to current conditions', 8),
      ('public-company-snapshot', 'Public Company Performance Snapshot', 'Condensed performance metrics and comparison tables for tracked companies', 9)
    ON CONFLICT (slug) DO NOTHING;
  `);
  console.log("   Done.");

  // 3. Create article_av_sections junction table
  console.log("3. Creating article_av_sections table...");
  await execSQL(`
    CREATE TABLE IF NOT EXISTS article_av_sections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      section_id UUID NOT NULL REFERENCES av_report_sections(id) ON DELETE CASCADE,
      relevance_score FLOAT DEFAULT 0.5,
      tagged_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (article_id, section_id)
    );
  `);
  console.log("   Done.");

  // 4. Add indexes
  console.log("4. Creating indexes...");
  await execSQL(`
    CREATE INDEX IF NOT EXISTS idx_article_av_sections_article ON article_av_sections(article_id);
    CREATE INDEX IF NOT EXISTS idx_article_av_sections_section ON article_av_sections(section_id);
    CREATE INDEX IF NOT EXISTS idx_article_av_sections_relevance ON article_av_sections(relevance_score DESC);
  `);
  console.log("   Done.");

  // 5. Verify
  console.log("\n5. Verifying...");
  const result = await execSQL(`
    SELECT
      (SELECT count(*) FROM av_report_sections) as sections,
      (SELECT count(*) FROM article_av_sections) as tagged_articles;
  `);
  console.log("   Result:", JSON.stringify(result));

  console.log("\nMigration complete!");
}

main().catch(console.error);
