/**
 * Fetches latest financial data for tracked companies and updates
 * the financial_ratios table in Supabase.
 *
 * Data source priority:
 *   1. S&P Capital IQ (if CAPIQ_API_KEY configured)
 *   2. Yahoo Finance (fallback only)
 *
 * Enhanced with:
 *   - Provenance tracking (data_source, pull_timestamp, currency, fx_rate)
 *   - Type-specific anomaly detection (revenue, margin, debt, FCF)
 *   - Human review queue integration for anomaly flags
 *
 * Usage: bun scripts/update-financial-ratios.ts [--period "Q1 2026"] [--force]
 *   --period: target period label (default: auto-detected from current date)
 *   --force:  update all companies, even if already reported
 */

import { createClient } from "@supabase/supabase-js";
import { TRACKED_COMPANIES, getYahooTicker } from "../lib/constants";
import {
  fetchCompanyFinancials,
  detectAnomalies,
  isCapIQConfigured,
  DEFAULT_ANOMALY_THRESHOLDS,
  type CapIQFinancials,
  type AnomalyFlag,
  type AnomalyThresholds,
  type FetchResult,
} from "../services/financial-data/capiq-client";
import anomalyThresholdsConfig from "../config/anomaly-thresholds.json" assert { type: "json" };

/** Resolve per-segment thresholds from config, falling back to default. */
function thresholdsForSegment(segment: string | null | undefined): AnomalyThresholds {
  if (!segment) return DEFAULT_ANOMALY_THRESHOLDS;
  const cfg = (anomalyThresholdsConfig as Record<string, AnomalyThresholds>)[segment];
  return cfg || DEFAULT_ANOMALY_THRESHOLDS;
}

const SUPABASE_URL = process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_KEY) { console.error("SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

function getCurrentPeriod(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month <= 6) return `H1 ${year}`;
  return `H2 ${year}`;
}

// Earnings calendar
const earningsSchedule = [
  { company: "CRH", ticker: "CRH", date: "2026-05-13", quarter: "Q1 2026" },
  { company: "CEMEX", ticker: "CX", date: "2026-04-27", quarter: "Q1 2026" },
  { company: "Heidelberg Materials", ticker: "HEI.DE", date: "2026-05-06", quarter: "Q1 2026" },
  { company: "Holcim", ticker: "HOLN.SW", date: "2026-04-25", quarter: "Q1 2026" },
  { company: "Martin Marietta", ticker: "MLM", date: "2026-04-29", quarter: "Q1 2026" },
  { company: "Taiheiyo Cement", ticker: "5233.T", date: "2026-05-12", quarter: "FY2026" },
  { company: "Vulcan Materials", ticker: "VMC", date: "2026-04-29", quarter: "Q1 2026" },
  { company: "AGC Inc", ticker: "5201.T", date: "2026-05-07", quarter: "FY2025" },
  { company: "Owens Corning", ticker: "OC", date: "2026-04-29", quarter: "Q1 2026" },
  { company: "Saint-Gobain", ticker: "SGO.PA", date: "2026-04-23", quarter: "Q1 2026" },
  { company: "Canfor", ticker: "CFP.TO", date: "2026-05-06", quarter: "Q1 2026" },
  { company: "Interfor", ticker: "IFP.TO", date: "2026-05-07", quarter: "Q1 2026" },
  { company: "UFP Industries", ticker: "UFPI", date: "2026-05-05", quarter: "Q1 2026" },
  { company: "West Fraser", ticker: "WFG.TO", date: "2026-04-21", quarter: "Q1 2026" },
  { company: "Weyerhaeuser", ticker: "WY", date: "2026-04-30", quarter: "Q1 2026" },
  { company: "ArcelorMittal", ticker: "MT", date: "2026-04-30", quarter: "Q1 2026" },
  { company: "Nucor", ticker: "NUE", date: "2026-04-27", quarter: "Q1 2026" },
  { company: "Steel Dynamics", ticker: "STLD", date: "2026-04-20", quarter: "Q1 2026" },
  { company: "Wienerberger", ticker: "WIE.VI", date: "2026-05-13", quarter: "Q1 2026" },
  { company: "Builders FirstSource", ticker: "BLDR", date: "2026-04-30", quarter: "Q1 2026" },
  { company: "Carlisle Companies", ticker: "CSL", date: "2026-04-23", quarter: "Q1 2026" },
  { company: "Kingspan", ticker: "KRX.IR", date: "2026-05-08", quarter: "Q1 2026" },
  { company: "QXO", ticker: "QXO", date: "2026-05-07", quarter: "Q1 2026" },
  { company: "ASSA ABLOY", ticker: "ASSA-B.ST", date: "2026-04-28", quarter: "Q1 2026" },
  { company: "JELD-WEN", ticker: "JWEN", date: "2026-05-04", quarter: "Q1 2026" },
  { company: "LIXIL", ticker: "5938.T", date: "2026-04-30", quarter: "FY2026" },
  { company: "Sanwa Holdings", ticker: "5929.T", date: "2026-05-14", quarter: "FY2026" },
  { company: "Advanced Drainage Systems", ticker: "WMS", date: "2026-05-14", quarter: "Q4 FY2026" },
  { company: "Geberit", ticker: "GEBN.SW", date: "2026-05-05", quarter: "Q1 2026" },
  { company: "Fortune Brands", ticker: "FBIN", date: "2026-04-29", quarter: "Q1 2026" },
  { company: "Masco", ticker: "MAS", date: "2026-04-22", quarter: "Q1 2026" },
  { company: "Carrier Global", ticker: "CARR", date: "2026-04-30", quarter: "Q1 2026" },
  { company: "Daikin Industries", ticker: "6367.T", date: "2026-05-12", quarter: "FY2026" },
  { company: "Johnson Controls", ticker: "JCI", date: "2026-05-01", quarter: "Q2 FY2026" },
  { company: "Trane Technologies", ticker: "TT", date: "2026-04-29", quarter: "Q1 2026" },
  { company: "Home Depot", ticker: "HD", date: "2026-02-25", quarter: "Q4 FY2025" },
  { company: "Lowe's", ticker: "LOW", date: "2026-02-26", quarter: "Q4 FY2025" },
  { company: "RPM International", ticker: "RPM", date: "2026-04-08", quarter: "Q3 FY2026" },
  { company: "Installed Building Products", ticker: "IBP", date: "2026-02-20", quarter: "Q4 FY2025" },
];

/**
 * Generate AI context for a review queue item.
 */
async function generateAutoContext(flag: AnomalyFlag, earningsArticles: any[]): Promise<string> {
  const articleContext = earningsArticles.length > 0
    ? `Related earnings articles: ${earningsArticles.map(a => `"${a.title}" (${a.source}, ${a.date})`).join("; ")}`
    : "No related earnings articles found in the knowledge base.";

  const detail = `${flag.company} (${flag.ticker}) flagged for ${flag.anomaly_type}: ${flag.metric} changed from ${flag.previous_value} to ${flag.current_value} (delta: ${flag.delta}, threshold: ${flag.threshold}). ${articleContext}`;

  if (!ANTHROPIC_KEY) return detail;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2024-06-01",
      },
      body: JSON.stringify({
        model: process.env.MODEL_EXTRACTION || "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: `In 2-3 sentences, explain why this financial anomaly was flagged for human review and what the reviewer should check. Be specific and actionable.\n\nDetails: ${detail}` }],
      }),
    });
    if (!res.ok) return detail;
    const data = await res.json();
    return data.content?.[0]?.text || detail;
  } catch {
    return detail;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const forceAll = args.includes("--force");
  const periodIdx = args.indexOf("--period");
  const period = periodIdx >= 0 ? args[periodIdx + 1] : getCurrentPeriod();
  const today = new Date().toISOString().slice(0, 10);

  console.log(`Updating financial ratios for period: ${period}`);
  console.log(`Today: ${today}, Force: ${forceAll}`);
  console.log(`Data source: ${isCapIQConfigured() ? "Capital IQ (primary) + Yahoo Finance (fallback)" : "Yahoo Finance only (CAPIQ not configured)"}\n`);

  // Get existing records for this period
  const { data: existing } = await supabase
    .from("financial_ratios")
    .select("ticker, has_reported, last_earnings_date, ebitda_margin_pct, gross_margin_pct, revenue_ltm, net_debt, ebitda_margin_pct, cogs_sales_pct, sga_sales_pct")
    .eq("period", period);

  const existingMap = new Map((existing || []).map(e => [e.ticker, e]));

  let updated = 0;
  let created = 0;
  let skipped = 0;
  let notYetReported = 0;
  const fallbackCompanies: { company: string; reason: string }[] = [];
  const allAnomalies: AnomalyFlag[] = [];

  for (const entry of earningsSchedule) {
    const earningsDate = entry.date;
    const hasReported = earningsDate <= today;
    const existingRecord = existingMap.get(entry.ticker);

    // Update has_reported flag
    if (existingRecord) {
      await supabase
        .from("financial_ratios")
        .update({ has_reported: hasReported, last_earnings_date: hasReported ? earningsDate : null })
        .eq("ticker", entry.ticker)
        .eq("period", period);
    }

    if (!hasReported) {
      console.log(`  ${entry.company} (${entry.ticker}): earnings ${earningsDate} — not yet reported`);
      notYetReported++;
      continue;
    }

    // Skip if already updated (unless --force)
    if (!forceAll && existingRecord?.has_reported && existingRecord?.last_earnings_date === earningsDate) {
      skipped++;
      continue;
    }

    // Find the TrackedCompany entry for this ticker
    const trackedCompany = TRACKED_COMPANIES.find(c => c.ticker === entry.ticker);
    if (!trackedCompany) {
      console.warn(`  ${entry.company}: not found in TRACKED_COMPANIES, skipping`);
      skipped++;
      continue;
    }

    console.log(`  ${entry.company} (${entry.ticker}): fetching financial data...`);
    const result: FetchResult = await fetchCompanyFinancials(trackedCompany, period);

    if (result.fallbackUsed) {
      fallbackCompanies.push({ company: entry.company, reason: result.fallbackReason || "unknown" });
    }

    if (!result.data) {
      console.log(`    No data returned, skipping`);
      skipped++;
      continue;
    }

    const financials = result.data;

    // Calculate YoY deltas from previous period
    const { data: prevData } = await supabase
      .from("financial_ratios")
      .select("cogs_sales_pct, sga_sales_pct, ebitda_margin_pct, revenue_ltm, net_debt, gross_margin_pct")
      .eq("ticker", entry.ticker)
      .neq("period", period)
      .order("updated_at", { ascending: false })
      .limit(1);

    // Resolve segment — prefer the existing period row's segment; fall back to
    // any prior-period row for the same ticker.
    let segment: string | null = null;
    if (existingRecord) {
      const { data: segRow } = await supabase
        .from("financial_ratios")
        .select("segment")
        .eq("ticker", entry.ticker)
        .eq("period", period)
        .maybeSingle();
      segment = segRow?.segment || null;
    }
    if (!segment) {
      const { data: segRow } = await supabase
        .from("financial_ratios")
        .select("segment")
        .eq("ticker", entry.ticker)
        .limit(1);
      segment = segRow?.[0]?.segment || null;
    }
    const thresholds = thresholdsForSegment(segment);

    const prev = prevData?.[0] || null;
    const cogs_delta = financials.cogs_sales_pct != null && prev?.cogs_sales_pct != null
      ? Math.round((financials.cogs_sales_pct - prev.cogs_sales_pct) * 10) / 10 : null;
    const sga_delta = financials.sga_sales_pct != null && prev?.sga_sales_pct != null
      ? Math.round((financials.sga_sales_pct - prev.sga_sales_pct) * 10) / 10 : null;
    const ebitda_delta = financials.ebitda_margin_pct != null && prev?.ebitda_margin_pct != null
      ? Math.round((financials.ebitda_margin_pct - prev.ebitda_margin_pct) * 10) / 10 : null;

    // Detect anomalies
    const previousFinancials: Partial<CapIQFinancials> = {
      revenue_ltm: prev?.revenue_ltm,
      ebitda_margin_pct: prev?.ebitda_margin_pct,
      gross_margin_pct: prev?.gross_margin_pct,
      net_debt: prev?.net_debt,
      ebitda_ltm: prev?.ebitda_margin_pct && prev?.revenue_ltm
        ? (prev.ebitda_margin_pct / 100) * prev.revenue_ltm : undefined,
      fcf_ltm: undefined,
    };
    const anomalies = detectAnomalies(financials, previousFinancials, thresholds);
    allAnomalies.push(...anomalies);

    const updateData = {
      revenue_ltm: financials.revenue_ltm,
      revenue_growth_yoy: financials.revenue_growth_yoy,
      cogs_sales_pct: financials.cogs_sales_pct,
      cogs_sales_yoy_delta: cogs_delta,
      sga_sales_pct: financials.sga_sales_pct,
      sga_sales_yoy_delta: sga_delta,
      ebitda_margin_pct: financials.ebitda_margin_pct,
      ebitda_margin_yoy_delta: ebitda_delta,
      has_reported: true,
      last_earnings_date: earningsDate,
      data_source: financials.data_source,
      source_url: financials.source_url,
      pull_timestamp: financials.pull_timestamp,
      reporting_period: financials.reporting_period,
      fiscal_year_end: financials.fiscal_year_end,
      currency: financials.currency,
      fx_rate_used: financials.fx_rate_used,
      manually_verified: false,
      capiq_unique_id: financials.capiq_unique_id,
      updated_at: new Date().toISOString(),
    };

    if (existingRecord) {
      await supabase
        .from("financial_ratios")
        .update(updateData)
        .eq("ticker", entry.ticker)
        .eq("period", period);
      updated++;
      console.log(`    Updated: Rev $${financials.revenue_ltm}B, EBITDA ${financials.ebitda_margin_pct}% [${financials.data_source}]`);
    } else {
      const { data: ref } = await supabase
        .from("financial_ratios")
        .select("segment, category, country, company")
        .eq("ticker", entry.ticker)
        .limit(1);
      const refRow = ref?.[0];
      if (refRow) {
        await supabase.from("financial_ratios").insert({
          ...updateData,
          company: refRow.company,
          ticker: entry.ticker,
          segment: refRow.segment,
          category: refRow.category,
          country: refRow.country,
          period,
        });
        created++;
        console.log(`    Created new record for ${period} [${financials.data_source}]`);
      }
    }

    // Insert anomalies into human_review_queue
    for (const flag of anomalies) {
      // Find related earnings articles for context
      const { data: earningsArticles } = await supabase
        .from("articles")
        .select("title, source, date, url")
        .ilike("title", `%${entry.company}%`)
        .eq("category", "Earnings")
        .order("date", { ascending: false })
        .limit(3);

      const autoContext = await generateAutoContext(flag, earningsArticles || []);

      // Get the financial_ratios row id for reference
      const { data: ratioRow } = await supabase
        .from("financial_ratios")
        .select("id")
        .eq("ticker", entry.ticker)
        .eq("period", period)
        .maybeSingle();

      if (ratioRow) {
        await supabase.from("human_review_queue").insert({
          queue_type: "financial_ratio_anomaly",
          reference_id: ratioRow.id,
          reference_table: "financial_ratios",
          priority: 1,
          review_status: "pending",
          auto_context: autoContext,
          anomaly_metric: flag.metric,
          anomaly_value: flag.current_value,
          anomaly_threshold: flag.threshold,
          anomaly_direction: flag.direction,
        });
        console.log(`    ⚠ Anomaly flagged: ${flag.anomaly_type} (${flag.metric})`);
      }
    }

    // Rate limit between requests
    await new Promise(r => setTimeout(r, 500));
  }

  // Summary
  console.log(`\nDone: ${updated} updated, ${created} created, ${skipped} skipped, ${notYetReported} not yet reported`);
  console.log(`Anomalies flagged: ${allAnomalies.length}`);

  if (fallbackCompanies.length > 0) {
    console.log(`\n⚠ Yahoo Finance fallback used for ${fallbackCompanies.length} companies:`);
    for (const fb of fallbackCompanies) {
      console.log(`  - ${fb.company}: ${fb.reason}`);
    }
  }

  // Return fallback info for email briefing integration
  return { fallbackCompanies, anomalies: allAnomalies };
}

main().catch(err => { console.error(err); process.exit(1); });
