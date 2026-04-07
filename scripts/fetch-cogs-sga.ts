/**
 * Fetch COGS and SG&A from Yahoo Finance fundamentalsTimeSeries for all 35 companies.
 * Calculates COGS/Sales and SG&A/Sales ratios. Outputs JSON to stdout.
 */
import YahooFinance from "yahoo-finance2";
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const companies = [
  {company:"CRH",ticker:"CRH",category:"materials"},
  {company:"CEMEX",ticker:"CX",category:"materials"},
  {company:"Heidelberg Materials",ticker:"HEI.DE",category:"materials"},
  {company:"Holcim",ticker:"HOLN.SW",category:"materials"},
  {company:"Martin Marietta",ticker:"MLM",category:"materials"},
  {company:"Taiheiyo Cement",ticker:"5233.T",category:"materials"},
  {company:"Vulcan Materials",ticker:"VMC",category:"materials"},
  {company:"AGC",ticker:"5201.T",category:"materials"},
  {company:"Owens Corning",ticker:"OC",category:"materials"},
  {company:"Saint-Gobain",ticker:"SGO.PA",category:"materials"},
  {company:"Canfor",ticker:"CFP.TO",category:"materials"},
  {company:"Interfor",ticker:"IFP.TO",category:"materials"},
  {company:"UFP Industries",ticker:"UFPI",category:"materials"},
  {company:"West Fraser",ticker:"WFG.TO",category:"materials"},
  {company:"Weyerhaeuser",ticker:"WY",category:"materials"},
  {company:"ArcelorMittal",ticker:"MT",category:"materials"},
  {company:"Nucor",ticker:"NUE",category:"materials"},
  {company:"Steel Dynamics",ticker:"STLD",category:"materials"},
  {company:"Wienerberger",ticker:"WIE.VI",category:"materials"},
  {company:"Builders FirstSource",ticker:"BLDR",category:"products"},
  {company:"Carlisle Companies",ticker:"CSL",category:"products"},
  {company:"Kingspan",ticker:"KRX.IR",category:"products"},
  {company:"QXO",ticker:"QXO",category:"products"},
  {company:"ASSA ABLOY",ticker:"ASSA-B.ST",category:"products"},
  {company:"JELD-WEN",ticker:"JELD",category:"products"},
  {company:"LIXIL",ticker:"5938.T",category:"products"},
  {company:"Sanwa Holdings",ticker:"5929.T",category:"products"},
  {company:"Advanced Drainage Systems",ticker:"WMS",category:"products"},
  {company:"Geberit",ticker:"GEBN.SW",category:"products"},
  {company:"Fortune Brands",ticker:"FBIN",category:"products"},
  {company:"Masco",ticker:"MAS",category:"products"},
  {company:"Carrier Global",ticker:"CARR",category:"products"},
  {company:"Daikin Industries",ticker:"6367.T",category:"products"},
  {company:"Johnson Controls",ticker:"JCI",category:"products"},
  {company:"Trane Technologies",ticker:"TT",category:"products"},
];

const results: any[] = [];

for (const c of companies) {
  process.stderr.write(`${c.ticker}...`);
  try {
    const data = await yf.fundamentalsTimeSeries(c.ticker, {
      period1: "2023-01-01",
      period2: "2026-04-07",
      type: "annual",
      module: "financials",
    });

    // Sort by date descending, take the latest (most recent fiscal year)
    const sorted = data
      .filter((r: any) => r.totalRevenue != null)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (sorted.length === 0) {
      process.stderr.write("NO DATA\n");
      results.push({ ...c, error: "no financials data" });
      continue;
    }

    const latest: any = sorted[0];
    const prev: any = sorted[1] || null;

    const rev = latest.totalRevenue;
    const cogs = latest.costOfRevenue;
    const sga = latest.sellingGeneralAndAdministration;

    const cogs_pct = rev && cogs ? Math.round((cogs / rev) * 1000) / 10 : null;
    const sga_pct = rev && sga ? Math.round((sga / rev) * 1000) / 10 : null;

    // Calculate YoY deltas
    let cogs_delta: number | null = null;
    let sga_delta: number | null = null;
    if (prev) {
      const prev_rev = prev.totalRevenue;
      const prev_cogs = prev.costOfRevenue;
      const prev_sga = prev.sellingGeneralAndAdministration;
      if (prev_rev && prev_cogs && cogs_pct != null) {
        const prev_cogs_pct = Math.round((prev_cogs / prev_rev) * 1000) / 10;
        cogs_delta = Math.round((cogs_pct - prev_cogs_pct) * 10) / 10;
      }
      if (prev_rev && prev_sga && sga_pct != null) {
        const prev_sga_pct = Math.round((prev_sga / prev_rev) * 1000) / 10;
        sga_delta = Math.round((sga_pct - prev_sga_pct) * 10) / 10;
      }
    }

    const r = {
      ...c,
      fiscal_date: latest.date,
      period_type: latest.periodType,
      revenue: rev,
      cogs: cogs,
      sga: sga,
      cogs_sales_pct: cogs_pct,
      cogs_sales_yoy_delta: cogs_delta,
      sga_sales_pct: sga_pct,
      sga_sales_yoy_delta: sga_delta,
    };

    results.push(r);
    process.stderr.write(`OK date=${latest.date?.toString().slice(0,10)} COGS=${cogs_pct}% SGA=${sga_pct}%\n`);
  } catch (e: any) {
    process.stderr.write(`ERR: ${e.message?.slice(0, 80)}\n`);
    results.push({ ...c, error: e.message });
  }
  await new Promise(r => setTimeout(r, 350));
}

console.log(JSON.stringify(results, null, 2));
