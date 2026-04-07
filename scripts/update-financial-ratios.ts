/**
 * Fetches latest financial data from Yahoo Finance for tracked companies
 * and updates the financial_ratios table in Supabase.
 *
 * Usage: bun scripts/update-financial-ratios.ts [--period "Q1 2026"] [--force]
 *   --period: target period label (default: auto-detected from current date)
 *   --force:  update all companies, even if already reported
 *
 * Designed to run nightly via the scheduled trigger. After a company's
 * earnings date passes (per earnings calendar), it fetches updated data.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_KEY) { console.error("SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// All 35 tracked companies with Yahoo Finance tickers
// Some international tickers need mapping from our internal format
const TICKER_MAP: Record<string, string> = {
  "HEI.DE": "HEI.DE",
  "HOLN.SW": "HOLN.SW",
  "5233.T": "5233.T",
  "5201.T": "5201.T",
  "SGO.PA": "SGO.PA",
  "CFP.TO": "CFP.TO",
  "IFP.TO": "IFP.TO",
  "WFG.TO": "WFG.TO",
  "ASSA-B.ST": "ASSA-B.ST",
  "5938.T": "5938.T",
  "5929.T": "5929.T",
  "GEBN.SW": "GEBN.SW",
  "WIE.VI": "WIE.VI",
  "6367.T": "6367.T",
  "KRX.IR": "KRX.IR",
};

function getYahooTicker(ticker: string): string {
  return TICKER_MAP[ticker] || ticker;
}

// Determine current reporting period based on date
function getCurrentPeriod(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month <= 6) return `H1 ${year}`;
  return `H2 ${year}`;
}

// Fetch financial data from Yahoo Finance
async function fetchYahooFinancials(ticker: string): Promise<{
  revenue_ltm: number | null;
  revenue_growth_yoy: number | null;
  cogs_sales_pct: number | null;
  sga_sales_pct: number | null;
  ebitda_margin_pct: number | null;
} | null> {
  const yTicker = getYahooTicker(ticker);
  try {
    // Use Yahoo Finance v8 API (public, no key required)
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yTicker)}?modules=incomeStatementHistory,incomeStatementHistoryQuarterly,financialData`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.ok) {
      console.warn(`  Yahoo Finance ${res.status} for ${yTicker}`);
      return null;
    }

    const data = await res.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) return null;

    const financialData = result.financialData;
    const annualStatements = result.incomeStatementHistory?.incomeStatementHistory || [];
    const quarterlyStatements = result.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];

    // Get LTM revenue (sum of last 4 quarters or latest annual)
    let revenue_ltm: number | null = null;
    let prev_revenue: number | null = null;

    if (quarterlyStatements.length >= 4) {
      // Sum last 4 quarters for LTM
      revenue_ltm = quarterlyStatements.slice(0, 4).reduce((sum: number, q: any) => {
        return sum + (q.totalRevenue?.raw || 0);
      }, 0);
    } else if (annualStatements.length > 0) {
      revenue_ltm = annualStatements[0]?.totalRevenue?.raw || null;
    }

    // Previous year revenue for YoY growth
    if (quarterlyStatements.length >= 8) {
      prev_revenue = quarterlyStatements.slice(4, 8).reduce((sum: number, q: any) => {
        return sum + (q.totalRevenue?.raw || 0);
      }, 0);
    } else if (annualStatements.length > 1) {
      prev_revenue = annualStatements[1]?.totalRevenue?.raw || null;
    }

    // Convert to BUSD
    if (revenue_ltm) revenue_ltm = revenue_ltm / 1e9;
    if (prev_revenue) prev_revenue = prev_revenue / 1e9;

    // Revenue growth YoY
    let revenue_growth_yoy: number | null = null;
    if (revenue_ltm && prev_revenue && prev_revenue > 0) {
      revenue_growth_yoy = ((revenue_ltm - prev_revenue) / prev_revenue) * 100;
    }

    // Latest income statement for ratios
    const latest = quarterlyStatements[0] || annualStatements[0];
    if (!latest) return { revenue_ltm, revenue_growth_yoy, cogs_sales_pct: null, sga_sales_pct: null, ebitda_margin_pct: null };

    const rev = latest.totalRevenue?.raw;
    const cogs = latest.costOfRevenue?.raw;
    const sga = latest.sellingGeneralAdministrative?.raw;
    const ebitda = financialData?.ebitda?.raw;
    const totalRev = financialData?.totalRevenue?.raw || rev;

    const cogs_sales_pct = rev && cogs ? (cogs / rev) * 100 : null;
    const sga_sales_pct = rev && sga ? (sga / rev) * 100 : null;
    const ebitda_margin_pct = totalRev && ebitda ? (ebitda / totalRev) * 100 : null;

    return {
      revenue_ltm: revenue_ltm ? Math.round(revenue_ltm * 10) / 10 : null,
      revenue_growth_yoy: revenue_growth_yoy ? Math.round(revenue_growth_yoy * 10) / 10 : null,
      cogs_sales_pct: cogs_sales_pct ? Math.round(cogs_sales_pct * 10) / 10 : null,
      sga_sales_pct: sga_sales_pct ? Math.round(sga_sales_pct * 10) / 10 : null,
      ebitda_margin_pct: ebitda_margin_pct ? Math.round(ebitda_margin_pct * 10) / 10 : null,
    };
  } catch (err) {
    console.warn(`  Error fetching ${yTicker}:`, err);
    return null;
  }
}

// Earnings calendar — imported inline to avoid TS module issues in scripts
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
];

async function main() {
  const args = process.argv.slice(2);
  const forceAll = args.includes("--force");
  const periodIdx = args.indexOf("--period");
  const period = periodIdx >= 0 ? args[periodIdx + 1] : getCurrentPeriod();
  const today = new Date().toISOString().slice(0, 10);

  console.log(`Updating financial ratios for period: ${period}`);
  console.log(`Today: ${today}, Force: ${forceAll}`);

  // Get existing records for this period
  const { data: existing } = await supabase
    .from("financial_ratios")
    .select("ticker, has_reported, last_earnings_date")
    .eq("period", period);

  const existingMap = new Map((existing || []).map(e => [e.ticker, e]));

  let updated = 0;
  let skipped = 0;
  let created = 0;
  let notYetReported = 0;

  for (const entry of earningsSchedule) {
    const earningsDate = entry.date;
    const hasReported = earningsDate <= today;
    const existingRecord = existingMap.get(entry.ticker);

    // Update has_reported flag for all companies
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

    // Skip if already updated with Yahoo data (unless --force)
    if (!forceAll && existingRecord?.has_reported && existingRecord?.last_earnings_date === earningsDate) {
      skipped++;
      continue;
    }

    console.log(`  ${entry.company} (${entry.ticker}): fetching from Yahoo Finance...`);
    const financials = await fetchYahooFinancials(entry.ticker);

    if (!financials) {
      console.log(`    No data returned, skipping`);
      skipped++;
      continue;
    }

    // Calculate YoY deltas if we have previous period data
    const { data: prevData } = await supabase
      .from("financial_ratios")
      .select("cogs_sales_pct, sga_sales_pct, ebitda_margin_pct")
      .eq("ticker", entry.ticker)
      .neq("period", period)
      .order("updated_at", { ascending: false })
      .limit(1);

    const prev = prevData?.[0];
    const cogs_delta = financials.cogs_sales_pct != null && prev?.cogs_sales_pct != null
      ? Math.round((financials.cogs_sales_pct - prev.cogs_sales_pct) * 10) / 10 : null;
    const sga_delta = financials.sga_sales_pct != null && prev?.sga_sales_pct != null
      ? Math.round((financials.sga_sales_pct - prev.sga_sales_pct) * 10) / 10 : null;
    const ebitda_delta = financials.ebitda_margin_pct != null && prev?.ebitda_margin_pct != null
      ? Math.round((financials.ebitda_margin_pct - prev.ebitda_margin_pct) * 10) / 10 : null;

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
      data_source: "yahoo-finance",
      updated_at: new Date().toISOString(),
    };

    if (existingRecord) {
      await supabase
        .from("financial_ratios")
        .update(updateData)
        .eq("ticker", entry.ticker)
        .eq("period", period);
      updated++;
      console.log(`    Updated: Rev $${financials.revenue_ltm}B, EBITDA ${financials.ebitda_margin_pct}%`);
    } else {
      // Need segment/category info — fetch from any existing record for this ticker
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
        console.log(`    Created new record for ${period}`);
      }
    }

    // Rate limit: Yahoo Finance doesn't like rapid requests
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nDone: ${updated} updated, ${created} created, ${skipped} skipped, ${notYetReported} not yet reported`);
}

main().catch(err => { console.error(err); process.exit(1); });
