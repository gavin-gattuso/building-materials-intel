/**
 * Backfill provenance data for pre-pipeline articles:
 * - Syndication hashes (computed from title + date)
 * - model_version / prompt_version markers ('pre-pipeline-v0')
 *
 * Uses Supabase Management API (SUPABASE_ACCESS_TOKEN) since
 * SUPABASE_SERVICE_ROLE_KEY may not be available locally.
 *
 * Usage: bun run scripts/backfill-provenance.ts
 */

import { computeSyndicationHash } from "../lib/syndication";

const PROJECT_REF = "pmjqymxdaiwfpfglwqux";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";
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
    if (!res.ok) throw new Error(`SQL error (${res.status}): ${await res.text()}`);
    return res.json();
  }
  // Fallback to REST API
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  // Can't run raw SQL via REST, so this path is limited
  throw new Error("Management API preferred for raw SQL");
}

function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

async function main() {
  console.log(`Using ${ACCESS_TOKEN ? "Management API" : "Service Role Key"}\n`);

  // Get all articles missing syndication_hash
  const articles = await execSQL(
    `SELECT id, title, date::text as date, syndication_hash, model_version FROM articles WHERE syndication_hash IS NULL ORDER BY date DESC;`
  ) as any[];

  console.log(`Articles missing syndication_hash: ${articles.length}`);

  let updated = 0;
  let dupes = 0;
  const seenHashes = new Map<string, string>();

  // Process in batches of 50 to build efficient SQL
  const batchSize = 50;
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    const updates: string[] = [];

    for (const a of batch) {
      if (!a.title || !a.date) continue;
      const hash = await computeSyndicationHash(a.title, a.date);

      if (seenHashes.has(hash)) {
        console.log(`  Dup hash: "${a.title?.slice(0, 50)}..." matches earlier article`);
        dupes++;
      }
      seenHashes.set(hash, a.title);

      const modelVersion = a.model_version ? null : "pre-pipeline-v0";
      let setClause = `syndication_hash = ${sqlStr(hash)}`;
      if (modelVersion) {
        setClause += `, model_version = ${sqlStr(modelVersion)}, prompt_version = ${sqlStr(modelVersion)}`;
      }
      updates.push(`UPDATE articles SET ${setClause} WHERE id = ${sqlStr(a.id)};`);
      updated++;
    }

    if (updates.length > 0) {
      await execSQL(updates.join("\n"));
      process.stdout.write(`  Batch ${Math.min(i + batchSize, articles.length)}/${articles.length}\r`);
    }
  }

  console.log(`\nUpdated: ${updated}`);
  console.log(`Internal duplicate hashes found: ${dupes}`);

  // Verify
  const remaining = await execSQL(
    `SELECT count(*) as cnt FROM articles WHERE syndication_hash IS NULL;`
  );
  console.log(`Remaining without syndication_hash: ${remaining[0]?.cnt}`);

  const noModel = await execSQL(
    `SELECT count(*) as cnt FROM articles WHERE model_version IS NULL;`
  );
  console.log(`Remaining without model_version: ${noModel[0]?.cnt}`);

  // Final summary
  const summary = await execSQL(
    `SELECT report_ready, report_ready_reason, count(*) as cnt FROM articles GROUP BY report_ready, report_ready_reason ORDER BY report_ready DESC, cnt DESC;`
  );
  console.log("\nFinal article state:");
  for (const row of summary) {
    console.log(`  report_ready=${row.report_ready}, reason="${row.report_ready_reason}": ${row.cnt}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
