/**
 * S&P Capital IQ API client for fetching institutional-quality financial data.
 *
 * Falls back to Yahoo Finance per-company on failure.
 * Handles non-USD currencies with period-average FX conversion.
 *
 * Env vars: CAPIQ_API_KEY, CAPIQ_API_SECRET, CAPIQ_BASE_URL, CAPIQ_RATE_LIMIT_PER_MINUTE
 */

import { TRACKED_COMPANIES, type TrackedCompany } from "../../lib/constants";
import { getCurrencyForCountry, getUSDConversionRate, convertToUSD } from "./fx-rates";

// ── Types ──

export interface CapIQFinancials {
  company: string;
  ticker: string;
  capiq_unique_id: string | null;
  data_source: "capital_iq" | "yahoo_finance_fallback";

  // Revenue
  revenue_ltm: number | null;
  revenue_annual: number | null;
  revenue_prior_year: number | null;
  revenue_growth_yoy: number | null;

  // Profitability
  ebitda_ltm: number | null;
  ebit: number | null;
  net_income: number | null;
  gross_profit: number | null;
  cogs: number | null;
  sga: number | null;

  // Balance sheet
  total_debt: number | null;
  net_debt: number | null;
  cash_equivalents: number | null;

  // Cash flow
  capex_ltm: number | null;
  fcf_ltm: number | null;

  // Margins
  ebitda_margin_pct: number | null;
  gross_margin_pct: number | null;
  net_margin_pct: number | null;

  // Valuation
  ev: number | null;
  ev_ebitda: number | null;
  pe_multiple: number | null;

  // Dates
  fiscal_year_end: string | null;
  last_earnings_date: string | null;
  next_earnings_date: string | null;

  // Segments
  segment_revenue_breakdown: Record<string, number> | null;

  // Provenance
  currency: string;
  fx_rate_used: number | null;
  reporting_period: string;
  pull_timestamp: string;
  source_url: string | null;

  // Computed margin deltas (filled later by update script)
  cogs_sales_pct: number | null;
  sga_sales_pct: number | null;
}

// ── Config ──

const CAPIQ_API_KEY = process.env.CAPIQ_API_KEY || "";
const CAPIQ_API_SECRET = process.env.CAPIQ_API_SECRET || "";
const CAPIQ_BASE_URL = process.env.CAPIQ_BASE_URL || "";
const RATE_LIMIT = parseInt(process.env.CAPIQ_RATE_LIMIT_PER_MINUTE || "60", 10);

let requestCount = 0;
let windowStart = Date.now();

async function rateLimitWait() {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    requestCount = 0;
    windowStart = now;
  }
  if (requestCount >= RATE_LIMIT) {
    const waitMs = 60_000 - (now - windowStart) + 100;
    console.log(`  Rate limit reached, waiting ${Math.round(waitMs / 1000)}s...`);
    await new Promise(r => setTimeout(r, waitMs));
    requestCount = 0;
    windowStart = Date.now();
  }
  requestCount++;
}

// ── Capital IQ API ──

export function isCapIQConfigured(): boolean {
  return !!(CAPIQ_API_KEY && CAPIQ_API_SECRET && CAPIQ_BASE_URL);
}

interface CapIQResponse {
  GDSSDKResponse?: Array<{
    Headers?: string[];
    Rows?: Array<{ Row: string[] }>;
  }>;
}

async function capiqRequest(endpoint: string, body: Record<string, any>): Promise<CapIQResponse | null> {
  if (!isCapIQConfigured()) return null;

  await rateLimitWait();

  try {
    const res = await fetch(`${CAPIQ_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${Buffer.from(`${CAPIQ_API_KEY}:${CAPIQ_API_SECRET}`).toString("base64")}`,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      console.warn(`  Capital IQ rate limited, will retry after pause`);
      await new Promise(r => setTimeout(r, 30_000));
      return capiqRequest(endpoint, body); // retry once
    }

    if (!res.ok) {
      console.warn(`  Capital IQ ${res.status}: ${await res.text().catch(() => "")}`);
      return null;
    }

    return await res.json();
  } catch (err: any) {
    console.warn(`  Capital IQ request error: ${err.message}`);
    return null;
  }
}

/**
 * Fetch comprehensive financial data for a single company from Capital IQ.
 */
async function fetchFromCapIQ(
  company: TrackedCompany,
  period: string
): Promise<CapIQFinancials | null> {
  if (!isCapIQConfigured()) return null;

  const identifier = company.ticker;
  const currency = getCurrencyForCountry(company.country);

  // Capital IQ KFINANCE-style request for multiple data items
  const mnemonics = [
    "IQ_TOTAL_REV", "IQ_EBITDA", "IQ_EBIT", "IQ_NET_INCOME",
    "IQ_GP", "IQ_COGS", "IQ_SGA", "IQ_TOTAL_DEBT",
    "IQ_NET_DEBT", "IQ_CASH_ST_INVEST", "IQ_CAPEX",
    "IQ_FCF", "IQ_TEV", "IQ_TEV_EBITDA", "IQ_PE_EXCL",
    "IQ_FISCAL_YEAR_END_DATE", "IQ_EARNINGS_DATE_LAST",
    "IQ_EARNINGS_DATE_NEXT", "IQ_COMPANY_ID_CAPIQ",
  ];

  const response = await capiqRequest("/v1/gdspv4/GDSSDKQuery", {
    inputRequests: [{
      function: "GDSHE",
      identifier,
      mnemonic: mnemonics.join(","),
      properties: {
        PERIODTYPE: "IQ_LTM",
        CURRENCY: currency,
      },
    }],
  });

  if (!response?.GDSSDKResponse?.[0]?.Rows) return null;

  const rows = response.GDSSDKResponse[0].Rows;
  const headers = response.GDSSDKResponse[0].Headers || [];

  // Parse response into a map
  const dataMap = new Map<string, string>();
  for (const row of rows) {
    if (row.Row.length >= 2) {
      dataMap.set(row.Row[0], row.Row[1]);
    }
  }

  const parseNum = (key: string): number | null => {
    const val = dataMap.get(key);
    if (!val || val === "Data Unavailable" || val === "NM") return null;
    const n = parseFloat(val.replace(/,/g, ""));
    return isNaN(n) ? null : n;
  };

  // Get FX rate for USD conversion
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  const fxData = await getUSDConversionRate(currency, now.getFullYear(), quarter);
  const fxRate = fxData?.rate ?? null;

  const revenue = parseNum("IQ_TOTAL_REV");
  const ebitda = parseNum("IQ_EBITDA");
  const revenueBUSD = revenue && fxRate ? convertToUSD(revenue, fxRate) / 1e9 : null;

  return {
    company: company.company,
    ticker: company.ticker,
    capiq_unique_id: dataMap.get("IQ_COMPANY_ID_CAPIQ") || null,
    data_source: "capital_iq",

    revenue_ltm: revenueBUSD ? Math.round(revenueBUSD * 10) / 10 : null,
    revenue_annual: null,  // Filled by separate annual query if needed
    revenue_prior_year: null,
    revenue_growth_yoy: null, // Calculated in update script from prior period

    ebitda_ltm: ebitda && fxRate ? Math.round(convertToUSD(ebitda, fxRate) / 1e9 * 10) / 10 : null,
    ebit: parseNum("IQ_EBIT"),
    net_income: parseNum("IQ_NET_INCOME"),
    gross_profit: parseNum("IQ_GP"),
    cogs: parseNum("IQ_COGS"),
    sga: parseNum("IQ_SGA"),

    total_debt: parseNum("IQ_TOTAL_DEBT"),
    net_debt: parseNum("IQ_NET_DEBT"),
    cash_equivalents: parseNum("IQ_CASH_ST_INVEST"),

    capex_ltm: parseNum("IQ_CAPEX"),
    fcf_ltm: parseNum("IQ_FCF"),

    ebitda_margin_pct: revenue && ebitda ? Math.round((ebitda / revenue) * 1000) / 10 : null,
    gross_margin_pct: (() => {
      const gp = parseNum("IQ_GP");
      return revenue && gp ? Math.round((gp / revenue) * 1000) / 10 : null;
    })(),
    net_margin_pct: (() => {
      const ni = parseNum("IQ_NET_INCOME");
      return revenue && ni ? Math.round((ni / revenue) * 1000) / 10 : null;
    })(),

    ev: parseNum("IQ_TEV"),
    ev_ebitda: parseNum("IQ_TEV_EBITDA"),
    pe_multiple: parseNum("IQ_PE_EXCL"),

    fiscal_year_end: dataMap.get("IQ_FISCAL_YEAR_END_DATE") || null,
    last_earnings_date: dataMap.get("IQ_EARNINGS_DATE_LAST") || null,
    next_earnings_date: dataMap.get("IQ_EARNINGS_DATE_NEXT") || null,

    segment_revenue_breakdown: null, // Requires separate segment query

    currency,
    fx_rate_used: fxRate,
    reporting_period: period,
    pull_timestamp: new Date().toISOString(),
    source_url: CAPIQ_BASE_URL ? `${CAPIQ_BASE_URL}/v1/gdspv4/GDSSDKQuery` : null,

    cogs_sales_pct: (() => {
      const c = parseNum("IQ_COGS");
      return revenue && c ? Math.round((c / revenue) * 1000) / 10 : null;
    })(),
    sga_sales_pct: (() => {
      const s = parseNum("IQ_SGA");
      return revenue && s ? Math.round((s / revenue) * 1000) / 10 : null;
    })(),
  };
}

// ── Yahoo Finance Fallback ──

async function fetchFromYahooFallback(
  company: TrackedCompany,
  period: string
): Promise<CapIQFinancials | null> {
  const { getYahooTicker } = await import("../../lib/constants");
  const yTicker = getYahooTicker(company.ticker);

  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yTicker)}?modules=incomeStatementHistory,incomeStatementHistoryQuarterly,financialData,balanceSheetHistory,cashflowStatementHistory,defaultKeyStatistics`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });

    if (!res.ok) {
      console.warn(`  Yahoo Finance ${res.status} for ${yTicker}`);
      return null;
    }

    const data = await res.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) return null;

    const fd = result.financialData || {};
    const annual = result.incomeStatementHistory?.incomeStatementHistory || [];
    const quarterly = result.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
    const bs = result.balanceSheetHistory?.balanceSheetStatements?.[0] || {};
    const cf = result.cashflowStatementHistory?.cashflowStatements?.[0] || {};
    const ks = result.defaultKeyStatistics || {};

    // LTM revenue from last 4 quarters
    let revenue_ltm: number | null = null;
    let prev_revenue: number | null = null;

    if (quarterly.length >= 4) {
      revenue_ltm = quarterly.slice(0, 4).reduce((s: number, q: any) => s + (q.totalRevenue?.raw || 0), 0);
    } else if (annual.length > 0) {
      revenue_ltm = annual[0]?.totalRevenue?.raw || null;
    }

    if (quarterly.length >= 8) {
      prev_revenue = quarterly.slice(4, 8).reduce((s: number, q: any) => s + (q.totalRevenue?.raw || 0), 0);
    } else if (annual.length > 1) {
      prev_revenue = annual[1]?.totalRevenue?.raw || null;
    }

    if (revenue_ltm) revenue_ltm = revenue_ltm / 1e9;
    if (prev_revenue) prev_revenue = prev_revenue / 1e9;

    const revenue_growth_yoy = revenue_ltm && prev_revenue && prev_revenue > 0
      ? Math.round(((revenue_ltm - prev_revenue) / prev_revenue) * 1000) / 10
      : null;

    const latest = quarterly[0] || annual[0];
    const rev = latest?.totalRevenue?.raw;
    const cogs = latest?.costOfRevenue?.raw;
    const sga = latest?.sellingGeneralAdministrative?.raw;

    const currency = getCurrencyForCountry(company.country);
    const now = new Date();
    const quarter_num = Math.ceil((now.getMonth() + 1) / 3);
    const fxData = currency !== "USD" ? await getUSDConversionRate(currency, now.getFullYear(), quarter_num) : null;

    return {
      company: company.company,
      ticker: company.ticker,
      capiq_unique_id: null,
      data_source: "yahoo_finance_fallback",

      revenue_ltm: revenue_ltm ? Math.round(revenue_ltm * 10) / 10 : null,
      revenue_annual: annual[0]?.totalRevenue?.raw ? Math.round(annual[0].totalRevenue.raw / 1e9 * 10) / 10 : null,
      revenue_prior_year: prev_revenue ? Math.round(prev_revenue * 10) / 10 : null,
      revenue_growth_yoy,

      ebitda_ltm: fd.ebitda?.raw ? Math.round(fd.ebitda.raw / 1e9 * 10) / 10 : null,
      ebit: latest?.ebit?.raw || null,
      net_income: latest?.netIncome?.raw || null,
      gross_profit: latest?.grossProfit?.raw || null,
      cogs: cogs || null,
      sga: sga || null,

      total_debt: bs.longTermDebt?.raw ? bs.longTermDebt.raw + (bs.shortLongTermDebt?.raw || 0) : null,
      net_debt: null, // Yahoo doesn't provide net debt directly
      cash_equivalents: bs.cash?.raw || null,

      capex_ltm: cf.capitalExpenditures?.raw ? Math.abs(cf.capitalExpenditures.raw) : null,
      fcf_ltm: fd.freeCashflow?.raw || null,

      ebitda_margin_pct: fd.ebitdaMargins?.raw ? Math.round(fd.ebitdaMargins.raw * 1000) / 10 : null,
      gross_margin_pct: fd.grossMargins?.raw ? Math.round(fd.grossMargins.raw * 1000) / 10 : null,
      net_margin_pct: fd.profitMargins?.raw ? Math.round(fd.profitMargins.raw * 1000) / 10 : null,

      ev: ks.enterpriseValue?.raw || null,
      ev_ebitda: ks.enterpriseToEbitda?.raw || null,
      pe_multiple: ks.forwardPE?.raw || fd.currentPrice?.raw && latest?.netIncome?.raw
        ? Math.round((fd.currentPrice.raw / (latest.netIncome.raw / (ks.sharesOutstanding?.raw || 1))) * 10) / 10
        : null,

      fiscal_year_end: null,
      last_earnings_date: ks.mostRecentQuarter?.raw ? new Date(ks.mostRecentQuarter.raw * 1000).toISOString().split("T")[0] : null,
      next_earnings_date: null,

      segment_revenue_breakdown: null,

      currency: "USD", // Yahoo Finance normalizes to USD
      fx_rate_used: fxData?.rate || null,
      reporting_period: period,
      pull_timestamp: new Date().toISOString(),
      source_url: `https://finance.yahoo.com/quote/${yTicker}`,

      cogs_sales_pct: rev && cogs ? Math.round((cogs / rev) * 1000) / 10 : null,
      sga_sales_pct: rev && sga ? Math.round((sga / rev) * 1000) / 10 : null,
    };
  } catch (err: any) {
    console.warn(`  Yahoo Finance error for ${yTicker}: ${err.message}`);
    return null;
  }
}

// ── Public API ──

export interface FetchResult {
  data: CapIQFinancials | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
}

/**
 * Fetch financial data for a single company.
 * Tries Capital IQ first, falls back to Yahoo Finance on failure.
 */
export async function fetchCompanyFinancials(
  company: TrackedCompany,
  period: string
): Promise<FetchResult> {
  // Try Capital IQ first
  if (isCapIQConfigured()) {
    const capiqData = await fetchFromCapIQ(company, period);
    if (capiqData) {
      return { data: capiqData, fallbackUsed: false, fallbackReason: null };
    }
    // Capital IQ failed — fall back to Yahoo
    console.log(`  ${company.company}: Capital IQ failed, falling back to Yahoo Finance`);
    const yahooData = await fetchFromYahooFallback(company, period);
    if (yahooData) {
      yahooData.data_source = "yahoo_finance_fallback";
      return {
        data: yahooData,
        fallbackUsed: true,
        fallbackReason: `Capital IQ returned no data for ${company.ticker}`,
      };
    }
    return {
      data: null,
      fallbackUsed: true,
      fallbackReason: `Both Capital IQ and Yahoo Finance failed for ${company.ticker}`,
    };
  }

  // No Capital IQ configured — use Yahoo directly
  const yahooData = await fetchFromYahooFallback(company, period);
  if (yahooData) {
    yahooData.data_source = "yahoo_finance_fallback";
    return {
      data: yahooData,
      fallbackUsed: true,
      fallbackReason: "CAPIQ_API_KEY not configured",
    };
  }
  return { data: null, fallbackUsed: true, fallbackReason: "No financial data source available" };
}

// ── Anomaly Detection ──

export interface AnomalyFlag {
  company: string;
  ticker: string;
  anomaly_type: "revenue_anomaly" | "margin_anomaly" | "debt_anomaly" | "fcf_anomaly";
  metric: string;
  current_value: number;
  previous_value: number;
  delta: number;
  threshold: number;
  direction: "above" | "below";
}

/**
 * Enhanced anomaly detection with type-specific thresholds.
 */
export function detectAnomalies(
  current: CapIQFinancials,
  previous: Partial<CapIQFinancials> | null
): AnomalyFlag[] {
  if (!previous) return [];

  const flags: AnomalyFlag[] = [];
  const base = { company: current.company, ticker: current.ticker };

  // Revenue anomaly: >15% YoY change
  if (current.revenue_growth_yoy != null && Math.abs(current.revenue_growth_yoy) > 15) {
    flags.push({
      ...base,
      anomaly_type: "revenue_anomaly",
      metric: "revenue_growth_yoy",
      current_value: current.revenue_growth_yoy,
      previous_value: previous.revenue_ltm ?? 0,
      delta: current.revenue_growth_yoy,
      threshold: 15,
      direction: current.revenue_growth_yoy > 0 ? "above" : "below",
    });
  }

  // Margin anomaly: >2 percentage point change in EBITDA margin
  if (current.ebitda_margin_pct != null && previous.ebitda_margin_pct != null) {
    const marginDelta = current.ebitda_margin_pct - previous.ebitda_margin_pct;
    if (Math.abs(marginDelta) > 2.0) {
      flags.push({
        ...base,
        anomaly_type: "margin_anomaly",
        metric: "ebitda_margin_pct",
        current_value: current.ebitda_margin_pct,
        previous_value: previous.ebitda_margin_pct,
        delta: marginDelta,
        threshold: 2.0,
        direction: marginDelta > 0 ? "above" : "below",
      });
    }
  }

  // Gross margin anomaly
  if (current.gross_margin_pct != null && previous.gross_margin_pct != null) {
    const gmDelta = current.gross_margin_pct - previous.gross_margin_pct;
    if (Math.abs(gmDelta) > 2.0) {
      flags.push({
        ...base,
        anomaly_type: "margin_anomaly",
        metric: "gross_margin_pct",
        current_value: current.gross_margin_pct,
        previous_value: previous.gross_margin_pct,
        delta: gmDelta,
        threshold: 2.0,
        direction: gmDelta > 0 ? "above" : "below",
      });
    }
  }

  // Debt anomaly: Net Debt/EBITDA changes by >0.5x
  if (current.net_debt != null && current.ebitda_ltm != null && current.ebitda_ltm > 0 &&
      previous.net_debt != null && previous.ebitda_ltm != null && previous.ebitda_ltm > 0) {
    const currentLeverage = current.net_debt / (current.ebitda_ltm * 1e9);
    const prevLeverage = previous.net_debt / (previous.ebitda_ltm! * 1e9);
    const leverageDelta = currentLeverage - prevLeverage;
    if (Math.abs(leverageDelta) > 0.5) {
      flags.push({
        ...base,
        anomaly_type: "debt_anomaly",
        metric: "net_debt_to_ebitda",
        current_value: Math.round(currentLeverage * 10) / 10,
        previous_value: Math.round(prevLeverage * 10) / 10,
        delta: Math.round(leverageDelta * 10) / 10,
        threshold: 0.5,
        direction: leverageDelta > 0 ? "above" : "below",
      });
    }
  }

  // FCF anomaly: >30% change in free cash flow
  if (current.fcf_ltm != null && previous.fcf_ltm != null && previous.fcf_ltm !== 0) {
    const fcfChange = ((current.fcf_ltm - previous.fcf_ltm) / Math.abs(previous.fcf_ltm)) * 100;
    if (Math.abs(fcfChange) > 30) {
      flags.push({
        ...base,
        anomaly_type: "fcf_anomaly",
        metric: "fcf_ltm",
        current_value: current.fcf_ltm,
        previous_value: previous.fcf_ltm,
        delta: Math.round(fcfChange * 10) / 10,
        threshold: 30,
        direction: fcfChange > 0 ? "above" : "below",
      });
    }
  }

  return flags;
}
