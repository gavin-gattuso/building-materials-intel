/**
 * FX rate fetching from central bank APIs.
 * Uses period-average rates (not spot) for financial data conversion.
 *
 * ECB: EUR, CHF, SEK, NOK, and other European currencies
 * BOE: GBP
 * BOJ: JPY (via ECB cross-rate)
 */

const ECB_BASE = process.env.ECB_API_BASE_URL || "https://data-api.ecb.europa.eu";

interface FXRate {
  pair: string;          // e.g. "EUR/USD"
  rate: number;          // units of USD per 1 foreign currency
  source: string;        // "ecb" | "boe"
  period: string;        // e.g. "2026-Q1"
  fetchedAt: string;     // ISO timestamp
}

/**
 * Map of country codes to their currencies.
 * Only includes currencies for non-USD tracked companies.
 */
const COUNTRY_CURRENCY: Record<string, string> = {
  IE: "EUR",  // CRH (listed in USD but reports EUR segments)
  MX: "MXN",  // CEMEX
  DE: "EUR",  // Heidelberg Materials
  CH: "CHF",  // Holcim, Geberit
  JP: "JPY",  // Taiheiyo, AGC, LIXIL, Sanwa, Daikin
  FR: "EUR",  // Saint-Gobain
  CA: "CAD",  // Canfor, Interfor, West Fraser
  LU: "EUR",  // ArcelorMittal
  AT: "EUR",  // Wienerberger
  SE: "SEK",  // ASSA ABLOY
};

export function getCurrencyForCountry(country: string): string {
  return COUNTRY_CURRENCY[country] || "USD";
}

/**
 * Fetch period-average FX rate from ECB Statistical Data Warehouse.
 * Returns USD per 1 unit of the target currency.
 */
async function fetchECBRate(currency: string, year: number, quarter: number): Promise<number | null> {
  // ECB provides EUR-based rates; we need USD/X, so we fetch EUR/USD and EUR/X
  // then compute USD/X = EUR/X / EUR/USD
  try {
    // ECB SDMX API: quarterly average exchange rates
    // Series key format: EXR.Q.{currency}.EUR.SP00.A (quarterly average)
    const startPeriod = `${year}-Q${quarter}`;
    const endPeriod = startPeriod;

    if (currency === "EUR") {
      // For EUR/USD, fetch directly
      const url = `${ECB_BASE}/service/data/EXR/Q.USD.EUR.SP00.A?startPeriod=${startPeriod}&endPeriod=${endPeriod}&format=csvdata`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = await res.text();
      const lines = text.trim().split("\n");
      if (lines.length < 2) return null;
      // CSV: last column is OBS_VALUE
      const lastLine = lines[lines.length - 1];
      const parts = lastLine.split(",");
      const rate = parseFloat(parts[parts.length - 1]);
      if (isNaN(rate)) return null;
      // ECB gives USD per EUR, we want USD per EUR = rate as-is
      return rate;
    }

    // For other currencies, we need EUR/{currency} rate, then convert
    // USD per 1 {currency} = (USD per EUR) / ({currency} per EUR)
    const [eurUsdRes, eurXRes] = await Promise.all([
      fetch(`${ECB_BASE}/service/data/EXR/Q.USD.EUR.SP00.A?startPeriod=${startPeriod}&endPeriod=${endPeriod}&format=csvdata`),
      fetch(`${ECB_BASE}/service/data/EXR/Q.${currency}.EUR.SP00.A?startPeriod=${startPeriod}&endPeriod=${endPeriod}&format=csvdata`),
    ]);

    if (!eurUsdRes.ok || !eurXRes.ok) return null;

    const eurUsdText = await eurUsdRes.text();
    const eurXText = await eurXRes.text();

    const parseLastValue = (csv: string): number | null => {
      const lines = csv.trim().split("\n");
      if (lines.length < 2) return null;
      const parts = lines[lines.length - 1].split(",");
      const val = parseFloat(parts[parts.length - 1]);
      return isNaN(val) ? null : val;
    };

    const usdPerEur = parseLastValue(eurUsdText);
    const xPerEur = parseLastValue(eurXText);

    if (!usdPerEur || !xPerEur) return null;

    // USD per 1 X = USD per EUR / X per EUR
    return usdPerEur / xPerEur;
  } catch (err) {
    console.warn(`  FX fetch failed for ${currency}:`, err);
    return null;
  }
}

/**
 * Get the period-average FX rate for converting a currency to USD.
 * Returns { rate, source } or null if unavailable.
 */
export async function getUSDConversionRate(
  currency: string,
  year: number,
  quarter: number
): Promise<FXRate | null> {
  if (currency === "USD") {
    return { pair: "USD/USD", rate: 1.0, source: "identity", period: `${year}-Q${quarter}`, fetchedAt: new Date().toISOString() };
  }

  const rate = await fetchECBRate(currency, year, quarter);
  if (rate === null) return null;

  return {
    pair: `${currency}/USD`,
    rate,
    source: "ecb",
    period: `${year}-Q${quarter}`,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Convert a value from a foreign currency to USD using a period-average rate.
 */
export function convertToUSD(value: number, fxRate: number): number {
  return Math.round(value * fxRate * 100) / 100;
}
