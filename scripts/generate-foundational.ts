/**
 * Foundational Knowledge Base Generator
 *
 * Generates 25 evergreen reference articles that encode 20+ years of
 * industry expertise. Uses batch API calls for token efficiency.
 *
 * Usage: ANTHROPIC_API_KEY=sk-... bun run scripts/generate-foundational.ts
 *
 * To use for a different industry, import a different config.
 */

import Anthropic from "@anthropic-ai/sdk";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { buildingMaterialsConfig, type FoundationalConfig, type ArticleSpec } from "../knowledge-base/templates/foundational-config";

const config: FoundationalConfig = buildingMaterialsConfig;
const OUTPUT_DIR = join(import.meta.dir, "..", "knowledge-base", "wiki", "foundational");
const INDEX_DIR = join(import.meta.dir, "..", "knowledge-base", "wiki", "indexes");
const TODAY = new Date().toISOString().slice(0, 10);

const anthropic = new Anthropic();

function buildSystemPrompt(): string {
  return `You are a senior industry analyst with 25+ years of experience in the ${config.industryLabel} sector. You are writing foundational reference articles for an intelligence platform's knowledge base.

IMPORTANT GUIDELINES:
1. Write with the authority and pattern-recognition of a veteran expert. Include specific data points, dates, and figures from your deep knowledge.
2. Be data-rich: include actual historical statistics (housing starts, pricing indices, deal values, market shares). Use real figures from well-known public sources (Census Bureau, BLS, FRED, S&P Global, company filings).
3. Each article should be 150-300 lines of dense, useful content.
4. Use the exact markdown format specified — YAML frontmatter followed by the section structure.
5. Tables should use markdown table syntax.
6. The "Current Context" section should connect historical patterns to the 2024-2025 period.
7. The "Data Sources" section should list specific public data sources (FRED series IDs, Census tables, BLS series) where readers can get updates.
8. Cross-reference other articles in the set using relative links like [Title](filename.md).
9. Write for a professional audience — consulting partners, equity analysts, corporate strategists.
10. DO NOT fabricate precise numbers if uncertain. Use ranges or approximate figures with qualifiers ("approximately", "roughly") when exact data isn't certain.`;
}

function buildArticlePrompt(articles: ArticleSpec[]): string {
  const specs = articles.map((a, i) => {
    return `### Article ${i + 1}: ${a.title}
- **Filename**: ${a.filename}.md
- **Category**: ${a.category}
- **Time range**: ${a.timeRange}
- **Key topics to cover**: ${a.keyTopics.join("; ")}
- **Expected data tables**: ${a.dataTables.join("; ")}
- **Cross-links to**: ${a.crosslinks.join(", ")}`;
  }).join("\n\n");

  return `Generate the following ${articles.length} foundational reference articles. For EACH article, output the complete markdown file including YAML frontmatter.

Separate each article with a line containing only: ===ARTICLE_SEPARATOR===

Use this exact frontmatter format for each article:
\`\`\`
---
title: "Article Title"
type: foundational
category: ${articles[0].category}
created: ${TODAY}
last_updated: ${TODAY}
update_frequency: annual
industry: ${config.industry}
crosslinks: [list, of, crosslinked, filenames]
---
\`\`\`

Each article body must have these sections in order:
## Overview
## Historical Timeline
## Key Patterns
## Current Context
## Implications for ${config.industryLabel}
## Data Sources

${specs}

Generate all ${articles.length} articles now, separated by ===ARTICLE_SEPARATOR===`;
}

function parseArticles(response: string, specs: ArticleSpec[]): { filename: string; content: string }[] {
  const parts = response.split("===ARTICLE_SEPARATOR===").map(p => p.trim()).filter(p => p.length > 0);
  return parts.map((content, i) => ({
    filename: specs[i]?.filename || `article-${i}`,
    content,
  }));
}

async function generateBatch(articles: ArticleSpec[], batchNum: number, totalBatches: number): Promise<void> {
  console.log(`\n[Batch ${batchNum}/${totalBatches}] Generating ${articles.length} articles: ${articles.map(a => a.filename).join(", ")}`);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: buildArticlePrompt(articles) }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  console.log(`  Response: ${text.length} chars, ${response.usage.output_tokens} output tokens`);

  const parsed = parseArticles(text, articles);

  for (const { filename, content } of parsed) {
    const filePath = join(OUTPUT_DIR, `${filename}.md`);
    await writeFile(filePath, content, "utf-8");
    console.log(`  Wrote: ${filename}.md (${content.split("\n").length} lines)`);
  }
}

async function generateIndex(articles: ArticleSpec[]): Promise<void> {
  const categoryGroups: Record<string, ArticleSpec[]> = {};
  for (const a of articles) {
    if (!categoryGroups[a.category]) categoryGroups[a.category] = [];
    categoryGroups[a.category].push(a);
  }

  const catLabels: Record<string, string> = {};
  for (const c of config.categories) catLabels[c.id] = c.label;

  let md = `---
title: "Foundational Knowledge Index"
type: index
created: ${TODAY}
last_updated: ${TODAY}
---

# Foundational Knowledge Index

This index catalogs ${articles.length} evergreen reference articles covering 20+ years of expertise in the ${config.industryLabel} industry. These articles provide structural knowledge, historical context, and pattern recognition that complements the daily news feed and current-event analysis.

## How to Use

- **For historical context**: When analyzing a current event, check the relevant foundational article for historical parallels
- **For cycle positioning**: Use the Industry Cycles articles to understand where we are in current cycles
- **For structural understanding**: Supply Chain articles explain the industry's underlying economics

## Articles by Category

`;

  for (const cat of config.categories) {
    const group = categoryGroups[cat.id] || [];
    md += `### ${cat.label} (${group.length})\n\n`;
    for (const a of group) {
      md += `- [${a.title}](../foundational/${a.filename}.md) — ${a.keyTopics.slice(0, 3).join(", ")}\n`;
    }
    md += "\n";
  }

  md += `## Statistics

- **Total articles**: ${articles.length}
- **Categories**: ${config.categories.length}
- **Industry**: ${config.industryLabel}
- **Update frequency**: Annual (Current Context sections)
- **Generated**: ${TODAY}
`;

  await writeFile(join(INDEX_DIR, "FOUNDATIONAL-INDEX.md"), md, "utf-8");
  console.log("\nWrote FOUNDATIONAL-INDEX.md");
}

async function main() {
  console.log(`Foundational Knowledge Generator`);
  console.log(`Industry: ${config.industryLabel}`);
  console.log(`Articles: ${config.articles.length}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  try { await mkdir(OUTPUT_DIR, { recursive: true }); } catch {}

  // Group articles into batches by category
  const batches: ArticleSpec[][] = [];
  const categoryGroups: Record<string, ArticleSpec[]> = {};
  for (const a of config.articles) {
    if (!categoryGroups[a.category]) categoryGroups[a.category] = [];
    categoryGroups[a.category].push(a);
  }
  for (const group of Object.values(categoryGroups)) {
    batches.push(group);
  }

  console.log(`Batches: ${batches.length} (grouped by category)`);

  for (let i = 0; i < batches.length; i++) {
    await generateBatch(batches[i], i + 1, batches.length);
  }

  await generateIndex(config.articles);

  console.log(`\nDone! Generated ${config.articles.length} foundational articles.`);
}

main().catch(console.error);
