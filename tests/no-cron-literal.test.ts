/**
 * Regression guard for RELIABILITY-AUDIT risk #1.
 *
 * Before 2026-05-12, every cron + privileged endpoint accepted `"cron"` as a
 * valid auth key. Anyone with the URL pattern could force-approve any
 * review-queue item by UUID, trigger ingest, etc. The fix moved auth into
 * lib/auth.ts:isAuthorizedCronOrPrivileged() which only recognizes Vercel's
 * x-vercel-cron header + Bearer CRON_SECRET + matching env-var secret.
 *
 * This test guards against the literal sneaking back in a future refactor.
 * If you ever need to add a new accepted key, do it via env var, not literal.
 */
import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const s = statSync(path);
    if (s.isDirectory()) walk(path, out);
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}

describe("regression: no 'cron' literal in auth keys", () => {
  const ROOT = join(import.meta.dir, "..");
  const apiFiles = walk(join(ROOT, "api"));

  test("no api/*.ts file contains a validKeys array with 'cron' literal", () => {
    const offenders: Array<{ file: string; line: number; text: string }> = [];
    for (const file of apiFiles) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] || "";
        // Match patterns like: validKeys = [..., "cron"], filter(Boolean).includes("cron")
        if (/validKeys\s*=\s*\[[^\]]*"cron"/.test(line) ||
            /\.includes\(\s*"cron"\s*\)/.test(line) ||
            /=\s*"cron".*;.*\/\/.*auth/i.test(line)) {
          offenders.push({ file: file.replace(ROOT, ""), line: i + 1, text: line.trim() });
        }
      }
    }
    if (offenders.length > 0) {
      const msg = offenders.map(o => `  ${o.file}:${o.line}  ${o.text}`).join("\n");
      throw new Error(`Found 'cron' literal in auth code (RELIABILITY-AUDIT risk #1 regression):\n${msg}\n\nUse isAuthorizedCronOrPrivileged() from lib/auth.ts instead.`);
    }
    expect(offenders).toEqual([]);
  });

  test("isAuthorizedCronOrPrivileged is imported in every privileged endpoint", () => {
    // Endpoints that should use the helper (cron-fired or privileged).
    const protectedEndpoints = [
      "daily-scan.ts",
      "healthcheck",  // matched as substring in index.ts
      "cron-weekly.ts",
      "cron-weekly-summary.ts",
      "detect-corrections.ts",
      "backfill.ts",
      "rematch-companies.ts",
    ];
    const missing: string[] = [];
    for (const endpoint of protectedEndpoints) {
      const file = apiFiles.find(f => f.endsWith(endpoint) || f.includes(endpoint));
      if (!file) continue;
      const content = readFileSync(file, "utf-8");
      if (!content.includes("isAuthorizedCronOrPrivileged")) {
        missing.push(file.replace(ROOT, ""));
      }
    }
    expect(missing).toEqual([]);
  });
});
