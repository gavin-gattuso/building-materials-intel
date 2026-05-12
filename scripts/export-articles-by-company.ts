/**
 * Export every Supabase article to a per-company filesystem mirror so the
 * data is greppable, easily diffable, and shareable as static markdown.
 *
 * Layout:
 *   knowledge-base/by-company/
 *     _index.md                 ← company → article count summary
 *     _unlinked/                ← articles with no company links (macro/policy)
 *       2026-05-12-foo.md
 *     titan-america/
 *       2026-05-08-titan-america-q1-earnings.md
 *     trane-technologies/
 *       2026-05-06-...
 *     ... (39 tracked-company folders + _unlinked)
 *
 * Each markdown file carries rich YAML frontmatter (date, source, tier,
 * companies, sections, tags, extraction figures, body length, report-ready
 * state) so you can grep / fzf / ripgrep the entire archive without
 * touching Supabase.
 *
 * Articles linked to multiple companies are written ONCE per company so
 * `ls knowledge-base/by-company/nucor/` lists every Nucor article. The
 * file body is identical across copies; the frontmatter `primary_company`
 * field tells you which folder you're in.
 *
 * Usage:
 *   bun scripts/export-articles-by-company.ts                    # full export
 *   bun scripts/export-articles-by-company.ts --since 2026-05-01 # incremental
 *   bun scripts/export-articles-by-company.ts --dry-run          # no writes
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getSourceTier, getSourceDomain } from "../lib/whitelist";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_KEY) { console.error("SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const args = process.argv.slice(2);
const sinceIdx = args.indexOf("--since");
const since = sinceIdx >= 0 && args[sinceIdx + 1] ? args[sinceIdx + 1]! : null;
const dryRun = args.includes("--dry-run");

const ROOT = join(import.meta.dir, "..", "knowledge-base", "by-company");
const UNLINKED_DIR = "_unlinked";

// ── Helpers ──────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function yamlEscape(v: any): string {
  if (v == null) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return "\n" + v.map(item => "  - " + yamlEscapeInline(item)).join("\n");
  }
  if (typeof v === "object") {
    return "\n" + Object.entries(v).map(([k, val]) => "  " + k + ": " + yamlEscapeInline(val)).join("\n");
  }
  return yamlEscapeInline(v);
}

function yamlEscapeInline(v: any): string {
  if (v == null) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  // Quote if contains special yaml chars
  if (/[:#&*!|>'"%@`{},\[\]]|^\s|\s$|^[-?]/.test(s) || s === "") {
    return JSON.stringify(s);
  }
  return s;
}

function buildFrontmatter(art: any, primaryCompanySlug: string | null, allCompanies: any[], sections: any[], tags: string[], extraction: any): string {
  const fm: Record<string, any> = {
    slug: art.slug,
    article_id: art.id,
    title: art.title,
    date: art.date,
    source: art.source,
    source_url: art.url,
    source_domain: getSourceDomain(art.url || ""),
    source_tier: art.url ? getSourceTier(art.url) : null,
    category: art.category,
    primary_company: primaryCompanySlug,
    companies: allCompanies.map(c => ({
      slug: c.slug,
      name: c.name,
      confidence: c.low_confidence_match ? "low" : "high",
    })),
    sections: sections.map(s => ({ slug: s.slug, relevance_score: s.relevance_score })),
    tags,
    report_ready: art.report_ready === true,
    report_ready_reason: art.report_ready_reason,
    correction_flag: art.correction_flag === true,
    syndication_hash: art.syndication_hash,
    corroborating_sources: art.corroborating_sources || [],
    content_length: (art.content || "").length,
    has_body: !!(art.full_text && art.full_text.length >= 200),
    body_length: (art.full_text || "").length,
    created_at: art.created_at,
    pull_timestamp: art.pull_timestamp,
    model_version: art.model_version,
    prompt_version: art.prompt_version,
  };
  if (extraction) {
    fm.has_extraction = true;
    fm.extraction = {
      confidence: extraction.extraction_confidence,
      model: extraction.model_version,
      prompt_version: extraction.prompt_version,
      revenue_figure: extraction.revenue_figure,
      revenue_period: extraction.revenue_period,
      revenue_currency: extraction.revenue_currency,
      ebitda_figure: extraction.ebitda_figure,
      ebitda_margin_pct: extraction.ebitda_margin_pct,
      yoy_growth_pct: extraction.yoy_growth_pct,
      guidance_direction: extraction.guidance_direction,
      guidance_period: extraction.guidance_period,
      pricing_action: extraction.pricing_action,
      pricing_percentage: extraction.pricing_percentage,
      headwinds: extraction.mentioned_headwinds || [],
      tailwinds: extraction.mentioned_tailwinds || [],
      fields_present: extraction.fields_present || [],
    };
  } else {
    fm.has_extraction = false;
  }
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${yamlEscape(v)}`);
  return "---\n" + lines.join("\n") + "\n---\n";
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`Export — since=${since || "all"}, dry_run=${dryRun}`);
  console.log(`Root: ${ROOT}`);

  let aq = supabase.from("articles").select("id, slug, title, date, source, url, category, content, full_text, syndication_hash, corroborating_sources, report_ready, report_ready_reason, correction_flag, created_at, pull_timestamp, model_version, prompt_version");
  if (since) aq = aq.gte("date", since);
  const { data: articles, error: aErr } = await aq.order("date", { ascending: false });
  if (aErr) { console.error("articles query failed:", aErr); process.exit(1); }
  if (!articles || articles.length === 0) { console.log("No articles."); return; }

  // Load junction data in bulk
  const articleIds = articles.map(a => a.id);
  const [
    { data: companies },
    { data: companyLinks },
    { data: sectionRows },
    { data: sectionLinks },
    { data: tagRows },
    { data: tagLinks },
    { data: extractions },
  ] = await Promise.all([
    supabase.from("companies").select("id, slug, name"),
    supabase.from("article_companies").select("article_id, company_id, low_confidence_match").in("article_id", articleIds),
    supabase.from("av_report_sections").select("id, slug"),
    supabase.from("article_av_sections").select("article_id, section_id, relevance_score").in("article_id", articleIds),
    supabase.from("tags").select("id, name"),
    supabase.from("article_tags").select("article_id, tag_id").in("article_id", articleIds),
    supabase.from("article_extractions").select("article_id, model_version, prompt_version, revenue_figure, revenue_period, revenue_currency, ebitda_figure, ebitda_margin_pct, yoy_growth_pct, guidance_direction, guidance_period, pricing_action, pricing_percentage, mentioned_headwinds, mentioned_tailwinds, fields_present, extraction_confidence").in("article_id", articleIds),
  ]);

  const companyById = new Map((companies || []).map(c => [c.id, c]));
  const sectionById = new Map((sectionRows || []).map(s => [s.id, s]));
  const tagById = new Map((tagRows || []).map(t => [t.id, t]));

  const articleCompanies = new Map<string, any[]>();
  for (const link of companyLinks || []) {
    const c = companyById.get(link.company_id);
    if (!c) continue;
    const arr = articleCompanies.get(link.article_id) || [];
    arr.push({ ...c, low_confidence_match: link.low_confidence_match });
    articleCompanies.set(link.article_id, arr);
  }
  const articleSections = new Map<string, any[]>();
  for (const link of sectionLinks || []) {
    const s = sectionById.get(link.section_id);
    if (!s) continue;
    const arr = articleSections.get(link.article_id) || [];
    arr.push({ ...s, relevance_score: link.relevance_score });
    articleSections.set(link.article_id, arr);
  }
  const articleTags = new Map<string, string[]>();
  for (const link of tagLinks || []) {
    const t = tagById.get(link.tag_id);
    if (!t) continue;
    const arr = articleTags.get(link.article_id) || [];
    arr.push(t.name);
    articleTags.set(link.article_id, arr);
  }
  const articleExtraction = new Map<string, any>();
  for (const ex of extractions || []) {
    articleExtraction.set(ex.article_id, ex);
  }

  if (!dryRun) {
    mkdirSync(ROOT, { recursive: true });
  }

  // Pre-create company folders
  const companySlugs = new Set<string>([UNLINKED_DIR]);
  for (const c of companies || []) companySlugs.add(c.slug);
  if (!dryRun) {
    for (const s of companySlugs) mkdirSync(join(ROOT, s), { recursive: true });
  }

  const articleCountByCompany = new Map<string, number>();
  let filesWritten = 0;

  for (const art of articles) {
    const linkedCompanies = articleCompanies.get(art.id) || [];
    const sections = articleSections.get(art.id) || [];
    const tags = articleTags.get(art.id) || [];
    const extraction = articleExtraction.get(art.id);

    const fileName = `${art.date}-${slugify(art.title)}.md`;
    const body = art.full_text && art.full_text.length >= 200
      ? art.full_text
      : (art.content || "");

    if (linkedCompanies.length === 0) {
      // Article has no company link — goes in _unlinked
      const fm = buildFrontmatter(art, null, [], sections, tags, extraction);
      const path = join(ROOT, UNLINKED_DIR, fileName);
      if (!dryRun) writeFileSync(path, fm + "\n" + body + "\n");
      filesWritten++;
      articleCountByCompany.set(UNLINKED_DIR, (articleCountByCompany.get(UNLINKED_DIR) || 0) + 1);
    } else {
      // Write once per linked company
      for (const co of linkedCompanies) {
        const fm = buildFrontmatter(art, co.slug, linkedCompanies, sections, tags, extraction);
        const path = join(ROOT, co.slug, fileName);
        if (!dryRun) writeFileSync(path, fm + "\n" + body + "\n");
        filesWritten++;
        articleCountByCompany.set(co.slug, (articleCountByCompany.get(co.slug) || 0) + 1);
      }
    }
  }

  // Write _index.md
  const sortedCompanies = [...articleCountByCompany.entries()].sort((a, b) => b[1] - a[1]);
  const indexLines = [
    "# Articles by Company",
    "",
    `Generated ${new Date().toISOString().slice(0, 19)}Z from Supabase. ${articles.length} source articles → ${filesWritten} per-company files.`,
    "",
    "| Company | Articles |",
    "|---|---|",
    ...sortedCompanies.map(([slug, count]) => `| [${slug}](./${slug}/) | ${count} |`),
    "",
    `**${UNLINKED_DIR}** = articles with no tracked-company link (macro/policy/sector pieces).`,
  ];
  if (!dryRun) writeFileSync(join(ROOT, "_index.md"), indexLines.join("\n") + "\n");

  console.log(`\nDONE — ${articles.length} source articles, ${filesWritten} files in ${articleCountByCompany.size} folders.`);
  console.log("Top folders by count:");
  for (const [slug, count] of sortedCompanies.slice(0, 10)) console.log(`  ${slug}: ${count}`);
}

main().catch(err => { console.error(err); process.exit(1); });
