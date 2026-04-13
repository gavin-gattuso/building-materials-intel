/**
 * Prompt governance lint.
 *
 * Walks api/, lib/, and services/ looking for Anthropic API call sites
 * (fetch to api.anthropic.com/v1/messages, SDK client.messages.create, or
 * model string literals). For each site, verifies the surrounding code
 * references at least one key from config/prompt-versions.json — either
 * an ID (e.g. "extraction-v1.0") or one of the model strings listed there.
 *
 * Output-only, non-blocking. Summary: "X/Y call sites reference versioned prompts."
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir || process.cwd(), "..");
const SCAN_DIRS = ["api", "lib", "services"];
const registry = JSON.parse(readFileSync(join(ROOT, "config/prompt-versions.json"), "utf-8"));
const knownIds: string[] = (registry.versions || []).map((v: any) => v.id).filter(Boolean);
const knownModels: string[] = [...new Set((registry.versions || []).map((v: any) => v.model).filter(Boolean))];
const knownNeedles = [...knownIds, ...knownModels];

const CALL_SITE_RE = /(anthropic\.com\/v1\/messages|messages\.create\b|"model"\s*:\s*"claude|'model'\s*:\s*'claude)/i;
const CONTEXT_WINDOW_LINES = 20;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

let totalSites = 0;
let versionedSites = 0;
const unversioned: { file: string; line: number }[] = [];

for (const d of SCAN_DIRS) {
  const abs = join(ROOT, d);
  let files: string[] = [];
  try { files = walk(abs); } catch { continue; }
  for (const f of files) {
    const src = readFileSync(f, "utf-8");
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!CALL_SITE_RE.test(lines[i])) continue;
      totalSites++;
      const start = Math.max(0, i - CONTEXT_WINDOW_LINES);
      const end = Math.min(lines.length, i + CONTEXT_WINDOW_LINES);
      const ctx = lines.slice(start, end).join("\n");
      const refsVersioned = knownNeedles.some(n => n && ctx.includes(n));
      if (refsVersioned) versionedSites++;
      else unversioned.push({ file: relative(ROOT, f), line: i + 1 });
    }
  }
}

console.log(`[lint-prompts] Scanned ${SCAN_DIRS.join(", ")} for Anthropic call sites.`);
console.log(`[lint-prompts] ${versionedSites}/${totalSites} call sites reference versioned prompts from config/prompt-versions.json.`);
if (unversioned.length > 0) {
  console.log(`[lint-prompts] WARNING: ${unversioned.length} unversioned call site(s):`);
  for (const u of unversioned) console.log(`  - ${u.file}:${u.line}`);
  console.log(`[lint-prompts] Add a prompt ID or model reference near each site, or append an entry to config/prompt-versions.json.`);
}
// Non-blocking: always exit 0 for now.
process.exit(0);
