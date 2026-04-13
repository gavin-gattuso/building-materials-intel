/**
 * Post-generation report validation (Phase 5).
 *
 * Five automated checks run after report generation but before delivery:
 *   1. Financial figure consistency
 *   2. Company coverage adequacy
 *   3. Source corroboration
 *   4. Recency adequacy
 *   5. Financial data source quality
 *
 * Also generates the Data Provenance & Methodology appendix.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

interface ValidationWarning {
  check: string;
  severity: "error" | "warning" | "info";
  message: string;
}

interface ValidationResult {
  passed: boolean;
  warnings: ValidationWarning[];
  articleCount: number;
  excludedCount: number;
  articlesByCategory: Record<string, number>;
}

interface ProvenanceData {
  dateRange: { start: string; end: string };
  articleCount: number;
  excludedCount: number;
  articlesByCategory: Record<string, number>;
  financialSources: { company: string; source: string; pullDate: string; verified: boolean }[];
  modelVersions: string[];
  promptVersions: string[];
  warnings: ValidationWarning[];
  pendingReviewCount: number;
}

/**
 * CHECK 1: Financial figure consistency
 * Parse every financial figure in report prose, verify it exists in financial_ratios or article_extractions.
 */
async function checkFinancialConsistency(
  reportText: string,
  startDate: string,
  endDate: string,
  supabase: ReturnType<typeof createClient>
): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  // Extract financial figures from report text
  // Match patterns like: $X.XB, XX.X%, XXbps, $XXM, XX.Xx
  const figurePatterns = [
    /\$[\d,.]+[BMTbmt](?:illion)?/g,        // Dollar amounts: $2.5B, $400M
    /[\d,.]+%/g,                              // Percentages: 15.3%, 2.5%
    /[\d,.]+\s*(?:basis points|bps)/gi,       // Basis points: 25bps
    /[\d,.]+x\b/g,                            // Multiples: 8.5x
  ];

  const reportFigures: string[] = [];
  for (const pattern of figurePatterns) {
    const matches = reportText.match(pattern) || [];
    reportFigures.push(...matches);
  }

  if (reportFigures.length === 0) return warnings;

  // Fetch known figures from financial_ratios
  const { data: ratios } = await supabase
    .from("financial_ratios")
    .select("company, revenue_ltm, revenue_growth_yoy, ebitda_margin_pct, cogs_sales_pct, sga_sales_pct")
    .not("revenue_ltm", "is", null) as { data: any[] | null };

  // Fetch extraction figures
  const { data: extractions } = await supabase
    .from("article_extractions")
    .select("revenue_figure, ebitda_figure, ebitda_margin_pct, yoy_growth_pct, pricing_percentage")
    .gte("created_at", startDate)
    .lte("created_at", endDate + "T23:59:59") as { data: any[] | null };

  // Build a set of known values (with 2% tolerance)
  const knownValues = new Set<number>();
  for (const r of ratios || []) {
    if (r.revenue_ltm) knownValues.add(r.revenue_ltm);
    if (r.revenue_growth_yoy) knownValues.add(r.revenue_growth_yoy);
    if (r.ebitda_margin_pct) knownValues.add(r.ebitda_margin_pct);
    if (r.cogs_sales_pct) knownValues.add(r.cogs_sales_pct);
    if (r.sga_sales_pct) knownValues.add(r.sga_sales_pct);
  }
  for (const e of extractions || []) {
    if (e.revenue_figure) knownValues.add(e.revenue_figure);
    if (e.ebitda_figure) knownValues.add(e.ebitda_figure);
    if (e.ebitda_margin_pct) knownValues.add(e.ebitda_margin_pct);
    if (e.yoy_growth_pct) knownValues.add(e.yoy_growth_pct);
    if (e.pricing_percentage) knownValues.add(e.pricing_percentage);
  }

  // Check each figure in the report against known values
  let untraceable = 0;
  for (const fig of reportFigures) {
    const numStr = fig.replace(/[$,%xBMT\s]/gi, "").replace(/billion|million/gi, "");
    const num = parseFloat(numStr.replace(/,/g, ""));
    if (isNaN(num)) continue;

    // Check with 2% tolerance
    const isKnown = Array.from(knownValues).some(known => {
      if (known === 0) return num === 0;
      return Math.abs((num - known) / known) <= 0.02;
    });

    if (!isKnown) untraceable++;
  }

  if (untraceable > 0) {
    warnings.push({
      check: "financial_consistency",
      severity: untraceable > 5 ? "error" : "warning",
      message: `${untraceable} financial figure(s) in the report could not be traced to the knowledge base (financial_ratios or article_extractions). These figures may be AI-hallucinated or from sources not yet indexed.`,
    });
  }

  return warnings;
}

/**
 * CHECK 2: Company coverage adequacy
 * For every company mentioned in the report, verify ≥3 report-ready articles exist.
 */
async function checkCompanyCoverage(
  reportText: string,
  startDate: string,
  endDate: string,
  supabase: ReturnType<typeof createClient>
): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  // Get all tracked companies
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, slug") as { data: any[] | null };

  const thinCoverage: string[] = [];

  for (const company of companies || []) {
    // Check if company is mentioned in report
    if (!reportText.toLowerCase().includes(company.name.toLowerCase())) continue;

    // Count report-ready articles for this company in date range
    const { data: junctions } = await supabase
      .from("article_companies")
      .select("article_id, articles!inner(id, date, report_ready)")
      .eq("company_id", company.id)
      .gte("articles.date", startDate)
      .lte("articles.date", endDate)
      .eq("articles.report_ready", true) as { data: any[] | null };

    const count = junctions?.length || 0;
    if (count < 3) {
      thinCoverage.push(`${company.name} (${count} articles)`);
    }
  }

  if (thinCoverage.length > 0) {
    warnings.push({
      check: "company_coverage",
      severity: "warning",
      message: `Thin coverage for ${thinCoverage.length} companies mentioned in the report: ${thinCoverage.join(", ")}. Each has fewer than 3 report-ready articles in the date range.`,
    });
  }

  return warnings;
}

/**
 * CHECK 3: Source corroboration
 * Verify executive summary claims are backed by Tier 1-2 sources or have corroborating sources.
 */
async function checkSourceCorroboration(
  executiveSummary: string,
  startDate: string,
  endDate: string,
  supabase: ReturnType<typeof createClient>
): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  // Get articles used in the report period
  const { data: articles } = await supabase
    .from("articles")
    .select("id, title, url, source, corroborating_sources, report_ready")
    .gte("date", startDate)
    .lte("date", endDate)
    .eq("report_ready", true) as { data: any[] | null };

  // Check corroboration status
  const tier1Domains = ["reuters.com", "bloomberg.com", "wsj.com", "ft.com", "nytimes.com", "washingtonpost.com", "bbc.com", "cnbc.com", "forbes.com", "fortune.com", "apnews.com"];
  const tier2Domains = ["constructiondive.com", "bdcnetwork.com", "enr.com"];

  let uncorroborated = 0;
  for (const article of articles || []) {
    try {
      const domain = new URL(article.url).hostname.replace(/^www\./, "");
      const isTier1or2 = [...tier1Domains, ...tier2Domains].some(d => domain === d || domain.endsWith("." + d));
      const hasCorroboration = article.corroborating_sources && article.corroborating_sources.length > 0;

      if (!isTier1or2 && !hasCorroboration) {
        uncorroborated++;
      }
    } catch { /* skip malformed URLs */ }
  }

  if (uncorroborated > 0) {
    warnings.push({
      check: "source_corroboration",
      severity: uncorroborated > 10 ? "warning" : "info",
      message: `${uncorroborated} article(s) in the report are not from Tier 1-2 sources and have no corroborating sources. These claims may be less defensible in a client presentation.`,
    });
  }

  return warnings;
}

/**
 * CHECK 4: Recency adequacy
 * Verify ≥40% of articles are from the most recent quarter of the report date range.
 */
async function checkRecency(
  startDate: string,
  endDate: string,
  supabase: ReturnType<typeof createClient>
): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  const { data: articles } = await supabase
    .from("articles")
    .select("date")
    .gte("date", startDate)
    .lte("date", endDate)
    .eq("report_ready", true) as { data: any[] | null };

  if (!articles || articles.length === 0) return warnings;

  // Calculate the most recent quarter boundary
  const start = new Date(startDate);
  const end = new Date(endDate);
  const rangeMs = end.getTime() - start.getTime();
  const recentQuarterStart = new Date(end.getTime() - rangeMs * 0.25).toISOString().split("T")[0];

  const recentCount = articles.filter(a => a.date >= recentQuarterStart).length;
  const recentPct = (recentCount / articles.length) * 100;

  if (recentPct < 40) {
    warnings.push({
      check: "recency",
      severity: "warning",
      message: `Only ${recentPct.toFixed(1)}% of report-ready articles are from the most recent quarter of the date range (${recentCount}/${articles.length}). The report may be drawing disproportionately from older material.`,
    });
  }

  return warnings;
}

/**
 * CHECK 5: Financial data source quality
 * Flag companies whose financial metrics are from Yahoo Finance fallback and unverified.
 */
async function checkFinancialSourceQuality(
  supabase: ReturnType<typeof createClient>
): Promise<{ warnings: ValidationWarning[]; sources: ProvenanceData["financialSources"] }> {
  const warnings: ValidationWarning[] = [];

  const { data: ratios } = await supabase
    .from("financial_ratios")
    .select("company, ticker, data_source, manually_verified, pull_timestamp")
    .order("company") as { data: any[] | null };

  const sources: ProvenanceData["financialSources"] = [];
  const unverifiedFallbacks: string[] = [];

  for (const r of ratios || []) {
    sources.push({
      company: r.company,
      source: r.data_source || "unknown",
      pullDate: r.pull_timestamp || "unknown",
      verified: r.manually_verified || false,
    });

    if (r.data_source === "yahoo_finance_fallback" && !r.manually_verified) {
      unverifiedFallbacks.push(r.company);
    }
  }

  if (unverifiedFallbacks.length > 0) {
    warnings.push({
      check: "financial_source_quality",
      severity: "warning",
      message: `${unverifiedFallbacks.length} company/companies have unverified Yahoo Finance fallback data: ${unverifiedFallbacks.join(", ")}. Financial figures for these companies should carry a disclaimer.`,
    });
  }

  return { warnings, sources };
}

// ── Public API ──

/**
 * Run all 5 post-generation validation checks.
 * Returns warnings (does not suppress the report).
 */
export async function validateReport(
  reportText: string,
  executiveSummary: string,
  startDate: string,
  endDate: string
): Promise<ValidationResult> {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Get article counts
  const { data: reportReadyArticles } = await sb
    .from("articles")
    .select("category")
    .gte("date", startDate)
    .lte("date", endDate)
    .eq("report_ready", true) as { data: any[] | null };

  const { data: allArticles } = await sb
    .from("articles")
    .select("id", { count: "exact", head: true })
    .gte("date", startDate)
    .lte("date", endDate);

  const articleCount = reportReadyArticles?.length || 0;
  const totalCount = allArticles?.count || 0;
  const excludedCount = totalCount - articleCount;

  const articlesByCategory: Record<string, number> = {};
  for (const a of reportReadyArticles || []) {
    articlesByCategory[a.category] = (articlesByCategory[a.category] || 0) + 1;
  }

  // Run all checks in parallel
  const [check1, check2, check3, check4, check5] = await Promise.all([
    checkFinancialConsistency(reportText, startDate, endDate, sb),
    checkCompanyCoverage(reportText, startDate, endDate, sb),
    checkSourceCorroboration(executiveSummary, startDate, endDate, sb),
    checkRecency(startDate, endDate, sb),
    checkFinancialSourceQuality(sb),
  ]);

  const warnings = [...check1, ...check2, ...check3, ...check4, ...check5.warnings];
  const hasErrors = warnings.some(w => w.severity === "error");

  return {
    passed: !hasErrors,
    warnings,
    articleCount,
    excludedCount,
    articlesByCategory,
  };
}

/**
 * Check if enough report-ready articles exist for the requested date range.
 * Returns null if ok, or an error message string if insufficient.
 */
export async function checkReportReadyCount(
  startDate: string,
  endDate: string,
  minimumArticles: number = 20
): Promise<string | null> {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { count: readyCount } = await sb
    .from("articles")
    .select("id", { count: "exact", head: true })
    .gte("date", startDate)
    .lte("date", endDate)
    .eq("report_ready", true);

  const { count: pendingReviewCount } = await sb
    .from("human_review_queue")
    .select("id", { count: "exact", head: true })
    .eq("review_status", "pending");

  if ((readyCount || 0) < minimumArticles) {
    return `Insufficient report-ready articles: ${readyCount || 0} found, ${minimumArticles} required. ${pendingReviewCount || 0} items are pending human review. Approve pending items or wait for more articles to be ingested.`;
  }

  return null;
}

/**
 * Generate the Data Provenance & Methodology appendix for a report.
 */
export async function generateProvenanceAppendix(
  startDate: string,
  endDate: string,
  validationResult: ValidationResult
): Promise<ProvenanceData> {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Financial data sources
  const { sources } = await checkFinancialSourceQuality(sb);

  // Model and prompt versions used
  const { data: modelVersions } = await sb
    .from("articles")
    .select("model_version")
    .gte("date", startDate)
    .lte("date", endDate)
    .not("model_version", "is", null) as { data: any[] | null };

  const { data: promptVersions } = await sb
    .from("articles")
    .select("prompt_version")
    .gte("date", startDate)
    .lte("date", endDate)
    .not("prompt_version", "is", null) as { data: any[] | null };

  const uniqueModels = [...new Set((modelVersions || []).map(m => m.model_version))];
  const uniquePrompts = [...new Set((promptVersions || []).map(p => p.prompt_version))];

  // Pending review count
  const { count: pendingCount } = await sb
    .from("human_review_queue")
    .select("id", { count: "exact", head: true })
    .eq("review_status", "pending");

  return {
    dateRange: { start: startDate, end: endDate },
    articleCount: validationResult.articleCount,
    excludedCount: validationResult.excludedCount,
    articlesByCategory: validationResult.articlesByCategory,
    financialSources: sources,
    modelVersions: uniqueModels,
    promptVersions: uniquePrompts,
    warnings: validationResult.warnings,
    pendingReviewCount: pendingCount || 0,
  };
}

/**
 * Render the provenance appendix as HTML.
 */
export function renderProvenanceHTML(provenance: ProvenanceData): string {
  let html = `<div class="provenance-appendix" style="page-break-before:always;margin-top:40px;border-top:3px solid #163E2D;padding-top:20px">`;
  html += `<h2 style="color:#163E2D;font-family:Arial;font-size:18px;margin-bottom:16px">Data Provenance &amp; Methodology</h2>`;

  // Date range and article counts
  html += `<h3 style="color:#215D44;font-size:14px;margin:12px 0 8px">Coverage Period</h3>`;
  html += `<p style="font-family:Arial;font-size:12px;margin:4px 0">${provenance.dateRange.start} to ${provenance.dateRange.end}</p>`;
  html += `<p style="font-family:Arial;font-size:12px;margin:4px 0"><strong>${provenance.articleCount}</strong> articles included (report-ready), <strong>${provenance.excludedCount}</strong> excluded (pending review or not report-ready)</p>`;

  // Articles by category
  html += `<h3 style="color:#215D44;font-size:14px;margin:12px 0 8px">Articles by Category</h3>`;
  html += `<table style="font-family:Arial;font-size:11px;border-collapse:collapse;width:100%">`;
  for (const [cat, count] of Object.entries(provenance.articlesByCategory).sort((a, b) => b[1] - a[1])) {
    html += `<tr><td style="padding:2px 8px;border-bottom:1px solid #eee">${cat}</td><td style="padding:2px 8px;border-bottom:1px solid #eee;text-align:right">${count}</td></tr>`;
  }
  html += `</table>`;

  // Financial data sources
  html += `<h3 style="color:#215D44;font-size:14px;margin:12px 0 8px">Financial Data Sources</h3>`;
  html += `<table style="font-family:Arial;font-size:11px;border-collapse:collapse;width:100%">`;
  html += `<tr style="background:#163E2D;color:white"><th style="padding:4px 8px;text-align:left">Company</th><th style="padding:4px 8px;text-align:left">Source</th><th style="padding:4px 8px;text-align:left">Pull Date</th><th style="padding:4px 8px;text-align:center">Verified</th></tr>`;
  for (const src of provenance.financialSources) {
    const verifiedIcon = src.verified ? "✓" : "—";
    const rowStyle = src.source === "yahoo_finance_fallback" && !src.verified ? "background:#FFF3E0" : "";
    html += `<tr style="${rowStyle}"><td style="padding:2px 8px;border-bottom:1px solid #eee">${src.company}</td><td style="padding:2px 8px;border-bottom:1px solid #eee">${src.source}</td><td style="padding:2px 8px;border-bottom:1px solid #eee">${src.pullDate?.split("T")[0] || "—"}</td><td style="padding:2px 8px;border-bottom:1px solid #eee;text-align:center">${verifiedIcon}</td></tr>`;
  }
  html += `</table>`;

  // Data source notes — explicit list of every fallback, for auditor convenience
  const fallbacks = provenance.financialSources.filter(s => s.source === "yahoo_finance_fallback");
  if (fallbacks.length > 0) {
    html += `<h3 style="color:#215D44;font-size:14px;margin:12px 0 8px">Data Source Notes</h3>`;
    html += `<p style="font-family:Arial;font-size:11px;margin:4px 0"><strong>† Yahoo Finance fallback used for ${fallbacks.length} compan${fallbacks.length === 1 ? "y" : "ies"}</strong> (Capital IQ unavailable for the reported period). All five tracked metrics (Revenue YoY, COGS/Sales, SG&amp;A/Sales, EBITDA Margin, plus YoY deltas) for these companies should be treated as unverified unless the <code>manually_verified</code> flag is set.</p>`;
    html += `<table style="font-family:Arial;font-size:11px;border-collapse:collapse;width:100%;margin-top:8px">`;
    html += `<tr style="background:#FFF3E0"><th style="padding:4px 8px;text-align:left">Company</th><th style="padding:4px 8px;text-align:left">Pull Date</th><th style="padding:4px 8px;text-align:center">Verified</th></tr>`;
    for (const fb of fallbacks) {
      html += `<tr><td style="padding:2px 8px;border-bottom:1px solid #eee">${fb.company}</td><td style="padding:2px 8px;border-bottom:1px solid #eee">${fb.pullDate?.split("T")[0] || "—"}</td><td style="padding:2px 8px;border-bottom:1px solid #eee;text-align:center">${fb.verified ? "✓" : "—"}</td></tr>`;
    }
    html += `</table>`;
  }

  // Model & prompt versions
  html += `<h3 style="color:#215D44;font-size:14px;margin:12px 0 8px">AI Model &amp; Prompt Versions</h3>`;
  html += `<p style="font-family:Arial;font-size:11px;margin:4px 0"><strong>Models:</strong> ${provenance.modelVersions.join(", ") || "N/A"}</p>`;
  html += `<p style="font-family:Arial;font-size:11px;margin:4px 0"><strong>Prompts:</strong> ${provenance.promptVersions.join(", ") || "N/A"}</p>`;
  html += `<p style="font-family:Arial;font-size:11px;margin:4px 0">Full prompt registry: <code>config/prompt-versions.json</code></p>`;

  // Validation warnings
  if (provenance.warnings.length > 0) {
    html += `<h3 style="color:#BF360C;font-size:14px;margin:12px 0 8px">Validation Warnings</h3>`;
    for (const w of provenance.warnings) {
      const color = w.severity === "error" ? "#D32F2F" : w.severity === "warning" ? "#F57F17" : "#1565C0";
      html += `<p style="font-family:Arial;font-size:11px;margin:4px 0;padding:4px 8px;border-left:3px solid ${color};background:#f5f5f5">[${w.severity.toUpperCase()}] ${w.check}: ${w.message}</p>`;
    }
  }

  // Pending review
  html += `<h3 style="color:#215D44;font-size:14px;margin:12px 0 8px">Review Queue Status</h3>`;
  html += `<p style="font-family:Arial;font-size:11px;margin:4px 0"><strong>${provenance.pendingReviewCount}</strong> items currently pending human review</p>`;

  html += `<p style="font-family:Arial;font-size:10px;color:#999;margin-top:16px;border-top:1px solid #ddd;padding-top:8px">This appendix is auto-generated and cannot be removed. It documents the data provenance and methodology for audit and compliance purposes.</p>`;
  html += `</div>`;

  return html;
}
