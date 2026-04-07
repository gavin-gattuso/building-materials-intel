// Extract markdown article blocks from agent output (JSON conversation format) and write to KB
import { readFile, writeFile, readdir } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";

const outputFile = process.argv[2];
if (!outputFile) {
  console.error("Usage: bun run scripts/extract-articles.ts <output-file> [--no-date-filter]");
  process.exit(1);
}

// Date filtering: only ingest articles published today unless --no-date-filter is passed
const noDateFilter = process.argv.includes("--no-date-filter");
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
if (!noDateFilter) {
  console.log(`Date filter active: only ingesting articles dated ${today}`);
  console.log(`  Pass --no-date-filter to skip this check\n`);
} else {
  console.log(`Date filter DISABLED: ingesting all articles regardless of date\n`);
}

const KB_DIR = join(import.meta.dir, "..", "knowledge-base", "raw", "articles");
const existing = new Set(await readdir(KB_DIR));

const raw = await readFile(outputFile, "utf-8");

// The output file has JSON objects separated by newlines, extract all text content
let fullText = "";

// Try to parse as newline-delimited JSON
for (const line of raw.split("\n")) {
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    // Extract assistant message content
    if (obj.message?.role === "assistant") {
      const content = obj.message.content;
      if (typeof content === "string") {
        fullText += content + "\n";
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text") fullText += block.text + "\n";
        }
      }
    }
    // Also check for tool results that might contain file writes
    if (obj.type === "tool_result" || obj.type === "tool_use") {
      const content = obj.message?.content;
      if (typeof content === "string") fullText += content + "\n";
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text") fullText += block.text + "\n";
        }
      }
    }
  } catch {
    // Not JSON, treat as plain text
    fullText += line + "\n";
  }
}

console.log(`Extracted ${fullText.length} chars of text content`);

// Now find article blocks - look for frontmatter patterns
const articleRegex = /---\s*\ndate:\s*(\d{4}-\d{2}-\d{2})\s*\n([\s\S]*?)---\s*\n([\s\S]*?)(?=\n---\s*\ndate:|\n#{1,3}\s+`?2026-|$)/g;

const articles: { filename: string; content: string }[] = [];
let match;

while ((match = articleRegex.exec(fullText)) !== null) {
  const date = match[1];
  const frontmatterBody = match[2];
  const body = match[3].trim();

  const fullArticle = `---\ndate: ${date}\n${frontmatterBody}---\n\n${body}`;

  // Extract title for filename
  const titleMatch = body.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    const slug = titleMatch[1]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    const filename = `${date}-${slug}.md`;
    articles.push({ filename, content: fullArticle });
  }
}

// Alternative: look for code-block wrapped articles
const codeBlockRegex = /```(?:markdown|md)?\s*\n(---\s*\ndate:[\s\S]*?)\n```/g;
while ((match = codeBlockRegex.exec(fullText)) !== null) {
  const blockContent = match[1].trim();
  const dateMatch = blockContent.match(/date:\s*(\d{4}-\d{2}-\d{2})/);
  const titleMatch = blockContent.match(/^#\s+(.+)$/m);
  if (dateMatch && titleMatch) {
    const slug = titleMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    const filename = `${dateMatch[1]}-${slug}.md`;
    // Avoid duplicates
    if (!articles.find(a => a.filename === filename)) {
      articles.push({ filename, content: blockContent });
    }
  }
}

console.log(`Found ${articles.length} articles`);

// Deduplicate by filename AND content hash
const seen = new Map<string, string>();
const seenHashes = new Set<string>();

// Build content hashes for existing articles to detect cross-file duplicates
for (const existingFile of existing) {
  try {
    const raw = await readFile(join(KB_DIR, existingFile), "utf-8");
    const titleMatch = raw.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : existingFile;
    const hash = createHash("md5").update(title + raw.slice(0, 500)).digest("hex");
    seenHashes.add(hash);
  } catch { /* skip unreadable */ }
}

for (const a of articles) {
  const titleMatch = a.content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : a.filename;
  const hash = createHash("md5").update(title + a.content.slice(0, 500)).digest("hex");

  if (seenHashes.has(hash)) {
    console.log(`  SKIP (dup content hash): ${a.filename}`);
    continue;
  }

  if (!seen.has(a.filename) || a.content.length > (seen.get(a.filename)?.length || 0)) {
    seen.set(a.filename, a.content);
    seenHashes.add(hash);
  }
}

let written = 0;
let skipped = 0;
let dateFiltered = 0;
for (const [filename, content] of seen) {
  if (existing.has(filename)) {
    console.log(`  SKIP (exists): ${filename}`);
    skipped++;
    continue;
  }
  // Validate article has minimum structure
  if (!content.includes("date:") || !content.includes("#")) {
    console.log(`  SKIP (invalid): ${filename}`);
    continue;
  }

  // Date filtering: only ingest articles from today
  if (!noDateFilter) {
    const dateMatch = content.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m);
    const articleDate = dateMatch ? dateMatch[1] : null;

    if (!articleDate) {
      // No date found at all — extract title for warning
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : filename;
      console.log(`  ⚠ No publishedDate found for: ${title} — skipping (no fallback date)`);
      dateFiltered++;
      continue;
    }

    if (articleDate !== today) {
      console.log(`  SKIP (date ${articleDate} ≠ today ${today}): ${filename}`);
      dateFiltered++;
      continue;
    }
  }

  await writeFile(join(KB_DIR, filename), content + "\n");
  console.log(`  WROTE: ${filename}`);
  written++;
}

console.log(`\nDone: ${written} written, ${skipped} skipped (already exist), ${dateFiltered} filtered by date, ${seen.size} total unique`);
