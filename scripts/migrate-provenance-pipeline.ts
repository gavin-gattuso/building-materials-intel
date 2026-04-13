/**
 * Provenance & Pipeline Migration
 *
 * Adds provenance tracking, structured extraction, audit tables,
 * human review queue, and report-ready gating to support institutional-
 * quality report generation.
 *
 * Migration steps:
 *   1.1  Provenance fields on articles
 *   1.2  Provenance fields on financial_ratios
 *   1.3  article_extractions table
 *   1.4  rejected_articles audit table
 *   1.5  human_review_queue table
 *   1.6  report_ready flag on articles
 *   1.7  Versioning on article_av_sections
 *   1.8  corroborating_sources on articles
 *   1.9  low_confidence_match on article_companies
 *
 * Safe to re-run — all operations use IF NOT EXISTS / IF EXISTS guards.
 * Usage: bun run scripts/migrate-provenance-pipeline.ts
 */

const PROJECT_REF = "pmjqymxdaiwfpfglwqux";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

if (!ACCESS_TOKEN && !SERVICE_KEY) {
  console.error("Set SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_ROLE_KEY env var");
  process.exit(1);
}

async function execSQL(sql: string): Promise<any> {
  if (ACCESS_TOKEN) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SQL error (${res.status}): ${text}`);
    }
    return res.json();
  }
  // Fallback: use Supabase REST RPC (requires service role key)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) throw new Error(`SQL error (${res.status}): ${await res.text()}`);
  return res.json();
}

async function step(label: string, sql: string) {
  process.stdout.write(`  ${label}...`);
  try {
    await execSQL(sql);
    console.log(" Done.");
  } catch (e: any) {
    console.log(` Skipped: ${e.message.slice(0, 120)}`);
  }
}

async function main() {
  console.log("=== Provenance & Pipeline Migration ===\n");

  // ─── 1.1 Provenance fields on articles ───
  console.log("--- 1.1 Provenance fields on articles ---");

  await step("source_excerpt", `ALTER TABLE articles ADD COLUMN IF NOT EXISTS source_excerpt TEXT;`);
  await step("full_text", `ALTER TABLE articles ADD COLUMN IF NOT EXISTS full_text TEXT;`);
  await step("model_version", `ALTER TABLE articles ADD COLUMN IF NOT EXISTS model_version VARCHAR(100);`);
  await step("prompt_version", `ALTER TABLE articles ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(50);`);
  await step("pull_timestamp", `ALTER TABLE articles ADD COLUMN IF NOT EXISTS pull_timestamp TIMESTAMPTZ DEFAULT NOW();`);
  await step("last_verified", `ALTER TABLE articles ADD COLUMN IF NOT EXISTS last_verified TIMESTAMPTZ;`);
  await step("correction_flag", `ALTER TABLE articles ADD COLUMN IF NOT EXISTS correction_flag BOOLEAN DEFAULT FALSE;`);
  await step("correction_notes", `ALTER TABLE articles ADD COLUMN IF NOT EXISTS correction_notes TEXT;`);
  await step("syndication_hash", `ALTER TABLE articles ADD COLUMN IF NOT EXISTS syndication_hash VARCHAR(64);`);
  await step("corroborating_sources", `ALTER TABLE articles ADD COLUMN IF NOT EXISTS corroborating_sources TEXT[];`);
  await step("idx_syndication_hash", `CREATE INDEX IF NOT EXISTS idx_articles_syndication_hash ON articles(syndication_hash);`);
  await step("idx_correction_flag", `CREATE INDEX IF NOT EXISTS idx_articles_correction_flag ON articles(correction_flag) WHERE correction_flag = TRUE;`);

  // ─── 1.2 Provenance fields on financial_ratios ───
  console.log("\n--- 1.2 Provenance fields on financial_ratios ---");

  // data_source already exists (used by update-financial-ratios.ts), so this is safe with IF NOT EXISTS
  await step("data_source", `ALTER TABLE financial_ratios ADD COLUMN IF NOT EXISTS data_source VARCHAR(50) DEFAULT 'yahoo_finance';`);
  await step("source_url", `ALTER TABLE financial_ratios ADD COLUMN IF NOT EXISTS source_url TEXT;`);
  await step("pull_timestamp", `ALTER TABLE financial_ratios ADD COLUMN IF NOT EXISTS pull_timestamp TIMESTAMPTZ DEFAULT NOW();`);
  await step("reporting_period", `ALTER TABLE financial_ratios ADD COLUMN IF NOT EXISTS reporting_period VARCHAR(20);`);
  await step("fiscal_year_end", `ALTER TABLE financial_ratios ADD COLUMN IF NOT EXISTS fiscal_year_end VARCHAR(20);`);
  await step("currency", `ALTER TABLE financial_ratios ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'USD';`);
  await step("fx_rate_used", `ALTER TABLE financial_ratios ADD COLUMN IF NOT EXISTS fx_rate_used DECIMAL(10,6);`);
  await step("manually_verified", `ALTER TABLE financial_ratios ADD COLUMN IF NOT EXISTS manually_verified BOOLEAN DEFAULT FALSE;`);
  await step("verification_source", `ALTER TABLE financial_ratios ADD COLUMN IF NOT EXISTS verification_source TEXT;`);
  await step("verification_timestamp", `ALTER TABLE financial_ratios ADD COLUMN IF NOT EXISTS verification_timestamp TIMESTAMPTZ;`);
  await step("capiq_unique_id", `ALTER TABLE financial_ratios ADD COLUMN IF NOT EXISTS capiq_unique_id VARCHAR(100);`);

  // ─── 1.3 article_extractions table ───
  console.log("\n--- 1.3 article_extractions table ---");

  await step("CREATE article_extractions", `
    CREATE TABLE IF NOT EXISTS article_extractions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
      extraction_timestamp TIMESTAMPTZ DEFAULT NOW(),
      model_version VARCHAR(100),
      prompt_version VARCHAR(50),

      revenue_figure DECIMAL(20,2),
      revenue_period VARCHAR(50),
      revenue_currency VARCHAR(10),
      ebitda_figure DECIMAL(20,2),
      ebitda_margin_pct DECIMAL(8,4),
      yoy_growth_pct DECIMAL(8,4),

      guidance_verbatim TEXT,
      guidance_direction VARCHAR(20),
      guidance_period VARCHAR(50),

      mentioned_headwinds TEXT[],
      mentioned_tailwinds TEXT[],
      mentioned_capex TEXT,
      mentioned_volume_language TEXT,

      pricing_action VARCHAR(50),
      pricing_percentage DECIMAL(8,4),

      additional_metrics JSONB,

      extraction_confidence DECIMAL(4,3),

      fields_present TEXT[],
      fields_absent TEXT[],

      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await step("idx_article_extractions_article_id",
    `CREATE INDEX IF NOT EXISTS idx_article_extractions_article_id ON article_extractions(article_id);`);

  // ─── 1.4 rejected_articles audit table ───
  console.log("\n--- 1.4 rejected_articles audit table ---");

  await step("CREATE rejected_articles", `
    CREATE TABLE IF NOT EXISTS rejected_articles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rejection_timestamp TIMESTAMPTZ DEFAULT NOW(),
      url TEXT NOT NULL,
      title TEXT,
      source_domain VARCHAR(255),
      rejection_reason VARCHAR(100),
      rejection_detail TEXT,
      raw_feed_data JSONB
    );
  `);

  await step("idx_rejected_domain",
    `CREATE INDEX IF NOT EXISTS idx_rejected_articles_domain ON rejected_articles(source_domain);`);
  await step("idx_rejected_reason",
    `CREATE INDEX IF NOT EXISTS idx_rejected_articles_reason ON rejected_articles(rejection_reason);`);
  await step("idx_rejected_timestamp",
    `CREATE INDEX IF NOT EXISTS idx_rejected_articles_timestamp ON rejected_articles(rejection_timestamp);`);

  // ─── 1.5 human_review_queue table ───
  console.log("\n--- 1.5 human_review_queue table ---");

  await step("CREATE human_review_queue", `
    CREATE TABLE IF NOT EXISTS human_review_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by VARCHAR(100),

      queue_type VARCHAR(50) NOT NULL,
      reference_id UUID NOT NULL,
      reference_table VARCHAR(50) NOT NULL,

      priority INTEGER DEFAULT 2,
      review_status VARCHAR(20) DEFAULT 'pending',
      review_notes TEXT,
      auto_context TEXT,

      anomaly_metric VARCHAR(100),
      anomaly_value DECIMAL(20,6),
      anomaly_threshold DECIMAL(20,6),
      anomaly_direction VARCHAR(20)
    );
  `);

  await step("idx_review_status",
    `CREATE INDEX IF NOT EXISTS idx_review_queue_status ON human_review_queue(review_status);`);
  await step("idx_review_type",
    `CREATE INDEX IF NOT EXISTS idx_review_queue_type ON human_review_queue(queue_type);`);
  await step("idx_review_priority",
    `CREATE INDEX IF NOT EXISTS idx_review_queue_priority ON human_review_queue(priority, created_at);`);

  // ─── 1.6 report_ready flag on articles ───
  console.log("\n--- 1.6 report_ready flag on articles ---");

  await step("report_ready", `ALTER TABLE articles ADD COLUMN IF NOT EXISTS report_ready BOOLEAN DEFAULT FALSE;`);
  await step("report_ready_timestamp", `ALTER TABLE articles ADD COLUMN IF NOT EXISTS report_ready_timestamp TIMESTAMPTZ;`);
  await step("report_ready_reason", `ALTER TABLE articles ADD COLUMN IF NOT EXISTS report_ready_reason TEXT;`);
  await step("idx_report_ready",
    `CREATE INDEX IF NOT EXISTS idx_articles_report_ready ON articles(report_ready) WHERE report_ready = TRUE;`);

  // ─── 1.7 Versioning on article_av_sections ───
  console.log("\n--- 1.7 Versioning on article_av_sections ---");

  await step("scoring_model_version",
    `ALTER TABLE article_av_sections ADD COLUMN IF NOT EXISTS scoring_model_version VARCHAR(100);`);
  await step("scoring_prompt_version",
    `ALTER TABLE article_av_sections ADD COLUMN IF NOT EXISTS scoring_prompt_version VARCHAR(50);`);
  await step("scoring_signals",
    `ALTER TABLE article_av_sections ADD COLUMN IF NOT EXISTS scoring_signals TEXT[];`);

  // ─── 1.8 low_confidence_match on article_companies ───
  console.log("\n--- 1.8 low_confidence_match on article_companies ---");

  await step("low_confidence_match",
    `ALTER TABLE article_companies ADD COLUMN IF NOT EXISTS low_confidence_match BOOLEAN DEFAULT FALSE;`);

  // ─── Verification ───
  console.log("\n--- Verification ---");

  const verify = await execSQL(`
    SELECT
      (SELECT count(*) FROM information_schema.columns WHERE table_name = 'articles' AND column_name = 'syndication_hash') as has_syndication_hash,
      (SELECT count(*) FROM information_schema.columns WHERE table_name = 'articles' AND column_name = 'report_ready') as has_report_ready,
      (SELECT count(*) FROM information_schema.columns WHERE table_name = 'articles' AND column_name = 'source_excerpt') as has_source_excerpt,
      (SELECT count(*) FROM information_schema.columns WHERE table_name = 'financial_ratios' AND column_name = 'capiq_unique_id') as has_capiq_id,
      (SELECT count(*) FROM information_schema.tables WHERE table_name = 'article_extractions') as has_extractions_table,
      (SELECT count(*) FROM information_schema.tables WHERE table_name = 'rejected_articles') as has_rejected_table,
      (SELECT count(*) FROM information_schema.tables WHERE table_name = 'human_review_queue') as has_review_queue,
      (SELECT count(*) FROM information_schema.columns WHERE table_name = 'article_companies' AND column_name = 'low_confidence_match') as has_low_confidence;
  `);
  console.log("  Results:", JSON.stringify(verify, null, 2));

  console.log("\n=== Migration complete! ===");
}

main().catch(console.error);
