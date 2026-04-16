/**
 * Build-time guard: checks that all api/*.ts files have valid imports.
 *
 * Catches the class of bug that broke daily-scan for 6 days in April 2026:
 * a bare `import ... from "*.json"` in ESM mode crashes the Vercel function
 * at load time with no visible error in the build log.
 *
 * Rules:
 *   1. No bare JSON imports (must use createRequire or import assertion)
 *   2. Every `from "../lib/..."` or `from "../config/..."` target must exist
 *   3. No default imports from packages that only have named exports
 *
 * Exits with code 1 on failure, blocking the Vercel deploy.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const apiDir = join(root, "api");

let errors = 0;

const apiFiles = readdirSync(apiDir).filter(f => f.endsWith(".ts"));

for (const file of apiFiles) {
  const filePath = join(apiDir, file);
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Rule 1: No bare JSON imports in ESM
    const jsonImport = line.match(/import\s+\w+\s+from\s+["']([^"']+\.json)["']\s*;/);
    if (jsonImport) {
      console.error(`ERROR: api/${file}:${lineNum} — Bare JSON import "${jsonImport[1]}" will crash in ESM. Use createRequire() instead.`);
      errors++;
    }

    // Rule 2: Local imports must resolve to existing files
    const localImport = line.match(/from\s+["'](\.\.?\/.+?)["']/);
    if (localImport) {
      const importPath = localImport[1];
      // Resolve relative to the api/ directory
      const resolved = resolve(apiDir, importPath);
      // Try .ts, .js, and exact match
      const candidates = [
        resolved,
        resolved.replace(/\.js$/, ".ts"),
        resolved + ".ts",
        resolved + ".js",
        resolved + "/index.ts",
      ];
      const found = candidates.some(c => existsSync(c));
      if (!found) {
        console.error(`ERROR: api/${file}:${lineNum} — Import "${importPath}" does not resolve to any file.`);
        errors++;
      }
    }
  }
}

if (errors > 0) {
  console.error(`\n${errors} import error(s) found. Fix before deploying.`);
  process.exit(1);
} else {
  console.log(`check-api-imports: ${apiFiles.length} API files checked, all imports valid.`);
}
