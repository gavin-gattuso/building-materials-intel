/**
 * Fetch FY2025 financials from Yahoo Finance using yahoo-finance2 v3.
 * Outputs JSON to stdout, logs progress to stderr.
 */
import YahooFinance from "yahoo-finance2";
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const companies = [
  {company:"CRH",ticker:"CRH",segment:"Cement, Aggregates and Ready-mix Concrete",category:"materials",country:"IE"},
  {company:"CEMEX",ticker:"CX",segment:"Cement, Aggregates and Ready-mix Concrete",category:"materials",country:"MX"},
  {company:"Heidelberg Materials",ticker:"HEI.DE",segment:"Cement, Aggregates and Ready-mix Concrete",category:"materials",country:"DE"},
  {company:"Holcim",ticker:"HOLN.SW",segment:"Cement, Aggregates and Ready-mix Concrete",category:"materials",country:"CH"},
  {company:"Martin Marietta",ticker:"MLM",segment:"Cement, Aggregates and Ready-mix Concrete",category:"materials",country:"US"},
  {company:"Taiheiyo Cement",ticker:"5233.T",segment:"Cement, Aggregates and Ready-mix Concrete",category:"materials",country:"JP"},
  {company:"Vulcan Materials",ticker:"VMC",segment:"Cement, Aggregates and Ready-mix Concrete",category:"materials",country:"US"},
  {company:"AGC",ticker:"5201.T",segment:"Glass",category:"materials",country:"JP"},
  {company:"Owens Corning",ticker:"OC",segment:"Glass",category:"materials",country:"US"},
  {company:"Saint-Gobain",ticker:"SGO.PA",segment:"Glass",category:"materials",country:"FR"},
  {company:"Canfor",ticker:"CFP.TO",segment:"Lumber and Wood",category:"materials",country:"CA"},
  {company:"Interfor",ticker:"IFP.TO",segment:"Lumber and Wood",category:"materials",country:"CA"},
  {company:"UFP Industries",ticker:"UFPI",segment:"Lumber and Wood",category:"materials",country:"US"},
  {company:"West Fraser",ticker:"WFG.TO",segment:"Lumber and Wood",category:"materials",country:"CA"},
  {company:"Weyerhaeuser",ticker:"WY",segment:"Lumber and Wood",category:"materials",country:"US"},
  {company:"ArcelorMittal",ticker:"MT",segment:"Steel",category:"materials",country:"LU"},
  {company:"Nucor",ticker:"NUE",segment:"Steel",category:"materials",country:"US"},
  {company:"Steel Dynamics",ticker:"STLD",segment:"Steel",category:"materials",country:"US"},
  {company:"Wienerberger",ticker:"WIE.VI",segment:"Bricks and Masonry",category:"materials",country:"AT"},
  {company:"Builders FirstSource",ticker:"BLDR",segment:"Building Envelope, Roofing, Siding, Flooring and Insulation",category:"products",country:"US"},
  {company:"Carlisle Companies",ticker:"CSL",segment:"Building Envelope, Roofing, Siding, Flooring and Insulation",category:"products",country:"US"},
  {company:"Kingspan",ticker:"KRX.IR",segment:"Building Envelope, Roofing, Siding, Flooring and Insulation",category:"products",country:"IE"},
  {company:"QXO",ticker:"QXO",segment:"Building Envelope, Roofing, Siding, Flooring and Insulation",category:"products",country:"US"},
  {company:"ASSA ABLOY",ticker:"ASSA-B.ST",segment:"Doors and Windows",category:"products",country:"SE"},
  {company:"JELD-WEN",ticker:"JWEN",segment:"Doors and Windows",category:"products",country:"US"},
  {company:"LIXIL",ticker:"5938.T",segment:"Doors and Windows",category:"products",country:"JP"},
  {company:"Sanwa Holdings",ticker:"5929.T",segment:"Doors and Windows",category:"products",country:"JP"},
  {company:"Advanced Drainage Systems",ticker:"WMS",segment:"Piping",category:"products",country:"US"},
  {company:"Geberit",ticker:"GEBN.SW",segment:"Kitchen and Bath",category:"products",country:"CH"},
  {company:"Fortune Brands",ticker:"FBIN",segment:"Kitchen and Bath",category:"products",country:"US"},
  {company:"Masco",ticker:"MAS",segment:"Kitchen and Bath",category:"products",country:"US"},
  {company:"Carrier Global",ticker:"CARR",segment:"HVAC-R, Fire and Security",category:"products",country:"US"},
  {company:"Daikin Industries",ticker:"6367.T",segment:"HVAC-R, Fire and Security",category:"products",country:"JP"},
  {company:"Johnson Controls",ticker:"JCI",segment:"HVAC-R, Fire and Security",category:"products",country:"US"},
  {company:"Trane Technologies",ticker:"TT",segment:"HVAC-R, Fire and Security",category:"products",country:"US"},
];

const results: any[] = [];

for (const c of companies) {
  process.stderr.write(`${c.ticker}...`);
  try {
    const data = await yf.quoteSummary(c.ticker, {
      modules: ["financialData", "incomeStatementHistory", "incomeStatementHistoryQuarterly"],
    });

    const fin = data.financialData;
    const annual = data.incomeStatementHistory?.incomeStatementHistory || [];
    const quarterly = data.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];

    // LTM revenue from last 4 quarters or financialData
    let rev_ltm: number | null = null;
    let prev_rev: number | null = null;

    if (quarterly.length >= 4) {
      rev_ltm = quarterly.slice(0, 4).reduce((s, q: any) => s + (q.totalRevenue || 0), 0);
      if (rev_ltm === 0) rev_ltm = null;
    }
    if (quarterly.length >= 8) {
      prev_rev = quarterly.slice(4, 8).reduce((s, q: any) => s + (q.totalRevenue || 0), 0);
      if (prev_rev === 0) prev_rev = null;
    }

    // Fallback to annual
    if (!rev_ltm && annual.length > 0) rev_ltm = (annual[0] as any).totalRevenue || null;
    if (!prev_rev && annual.length > 1) prev_rev = (annual[1] as any).totalRevenue || null;

    // Fallback to financialData
    if (!rev_ltm && fin?.totalRevenue) rev_ltm = fin.totalRevenue;

    const rev_b = rev_ltm ? Math.round(rev_ltm / 1e8) / 10 : null;
    const prev_b = prev_rev ? prev_rev / 1e9 : null;
    const growth = rev_b && prev_b && prev_b > 0
      ? Math.round(((rev_b - prev_b) / prev_b) * 1000) / 10
      : null;

    // Ratios from latest annual income statement
    const latest: any = annual[0] || {};
    const latestRev = latest.totalRevenue;
    const latestCogs = latest.costOfRevenue;
    const latestSga = latest.sellingGeneralAdministrative;

    // EBITDA from financialData
    const ebitda = fin?.ebitda;
    const finRev = fin?.totalRevenue || latestRev;

    // Also use profitMargins from financialData for EBITDA margin fallback
    const ebitdaMargin = fin?.ebitdaMargins != null
      ? Math.round(fin.ebitdaMargins * 1000) / 10
      : (finRev && ebitda ? Math.round((ebitda / finRev) * 1000) / 10 : null);

    const r: any = {
      ...c,
      revenue_ltm: rev_b,
      revenue_growth_yoy: fin?.revenueGrowth != null
        ? Math.round(fin.revenueGrowth * 1000) / 10
        : growth,
      cogs_sales_pct: latestRev && latestCogs ? Math.round((latestCogs / latestRev) * 1000) / 10 : null,
      sga_sales_pct: latestRev && latestSga ? Math.round((latestSga / latestRev) * 1000) / 10 : null,
      ebitda_margin_pct: ebitdaMargin,
    };

    results.push(r);
    process.stderr.write(`OK rev=$${rev_b}B growth=${r.revenue_growth_yoy}% ebitda=${r.ebitda_margin_pct}%\n`);
  } catch (e: any) {
    process.stderr.write(`ERR: ${e.message?.slice(0, 80)}\n`);
    results.push({ ...c, error: e.message });
  }
  await new Promise(r => setTimeout(r, 350));
}

console.log(JSON.stringify(results, null, 2));
