/**
 * Pre-build script: generates static JSON data files for Vercel deployment.
 * Run as part of the Vercel build command so the frontend can load data
 * without a running server.
 */
import { writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const PUBLIC = join(import.meta.dir, "public");

// --- 1. Earnings Calendar ---
interface EarningsDate {
  company: string;
  ticker: string;
  date: string;
  quarter: string;
  estimated: boolean;
}

const earningsSchedule: EarningsDate[] = [
  { company: "CRH", ticker: "CRH", date: "2026-05-13", quarter: "Q1 2026", estimated: false },
  { company: "CEMEX", ticker: "CX", date: "2026-04-27", quarter: "Q1 2026", estimated: false },
  { company: "Heidelberg Materials", ticker: "HEI.DE", date: "2026-05-06", quarter: "Q1 2026 Trading Update", estimated: false },
  { company: "Holcim", ticker: "HOLN.SW", date: "2026-04-25", quarter: "Q1 2026 Sales Update", estimated: true },
  { company: "Martin Marietta", ticker: "MLM", date: "2026-04-29", quarter: "Q1 2026", estimated: false },
  { company: "Taiheiyo Cement", ticker: "5233.T", date: "2026-05-12", quarter: "FY2026 Full Year", estimated: false },
  { company: "Vulcan Materials", ticker: "VMC", date: "2026-04-29", quarter: "Q1 2026", estimated: false },
  { company: "AGC Inc", ticker: "5201.T", date: "2026-05-07", quarter: "FY2025 Full Year", estimated: false },
  { company: "Owens Corning", ticker: "OC", date: "2026-04-29", quarter: "Q1 2026", estimated: false },
  { company: "Saint-Gobain", ticker: "SGO.PA", date: "2026-04-23", quarter: "Q1 2026 Sales", estimated: false },
  { company: "Canfor", ticker: "CFP.TO", date: "2026-05-06", quarter: "Q1 2026", estimated: false },
  { company: "Interfor", ticker: "IFP.TO", date: "2026-05-07", quarter: "Q1 2026", estimated: false },
  { company: "UFP Industries", ticker: "UFPI", date: "2026-05-05", quarter: "Q1 2026", estimated: false },
  { company: "West Fraser", ticker: "WFG.TO", date: "2026-04-21", quarter: "Q1 2026", estimated: false },
  { company: "Weyerhaeuser", ticker: "WY", date: "2026-04-30", quarter: "Q1 2026", estimated: false },
  { company: "ArcelorMittal", ticker: "MT", date: "2026-04-30", quarter: "Q1 2026", estimated: false },
  { company: "Nucor", ticker: "NUE", date: "2026-04-27", quarter: "Q1 2026", estimated: false },
  { company: "Steel Dynamics", ticker: "STLD", date: "2026-04-20", quarter: "Q1 2026", estimated: false },
  { company: "Wienerberger", ticker: "WIE.VI", date: "2026-05-13", quarter: "Q1 2026", estimated: false },
  { company: "Builders FirstSource", ticker: "BLDR", date: "2026-04-30", quarter: "Q1 2026", estimated: false },
  { company: "Carlisle Companies", ticker: "CSL", date: "2026-04-23", quarter: "Q1 2026", estimated: false },
  { company: "Kingspan", ticker: "KRX.IR", date: "2026-05-08", quarter: "Q1 2026 Trading Update", estimated: true },
  { company: "QXO", ticker: "QXO", date: "2026-05-07", quarter: "Q1 2026", estimated: true },
  { company: "ASSA ABLOY", ticker: "ASSA-B.ST", date: "2026-04-28", quarter: "Q1 2026", estimated: false },
  { company: "JELD-WEN", ticker: "JWEN", date: "2026-05-04", quarter: "Q1 2026", estimated: true },
  { company: "LIXIL", ticker: "5938.T", date: "2026-04-30", quarter: "FY2026 Full Year", estimated: false },
  { company: "Sanwa Holdings", ticker: "5929.T", date: "2026-05-14", quarter: "FY2026 Full Year", estimated: true },
  { company: "Advanced Drainage Systems", ticker: "WMS", date: "2026-05-14", quarter: "Q4 FY2026", estimated: false },
  { company: "Geberit", ticker: "GEBN.SW", date: "2026-05-05", quarter: "Q1 2026", estimated: false },
  { company: "Fortune Brands", ticker: "FBIN", date: "2026-04-29", quarter: "Q1 2026", estimated: true },
  { company: "Masco", ticker: "MAS", date: "2026-04-22", quarter: "Q1 2026", estimated: false },
  { company: "Carrier Global", ticker: "CARR", date: "2026-04-30", quarter: "Q1 2026", estimated: false },
  { company: "Daikin Industries", ticker: "6367.T", date: "2026-05-12", quarter: "FY2026 Full Year", estimated: false },
  { company: "Johnson Controls", ticker: "JCI", date: "2026-05-01", quarter: "Q2 FY2026", estimated: true },
  { company: "Trane Technologies", ticker: "TT", date: "2026-04-29", quarter: "Q1 2026", estimated: false },
];

// Write all earnings (sorted by date) — frontend filters by current date
const sorted = [...earningsSchedule].sort((a, b) => a.date.localeCompare(b.date));
writeFileSync(join(PUBLIC, "earnings-calendar.json"), JSON.stringify(sorted, null, 2));
console.log(`Generated earnings-calendar.json (${sorted.length} entries)`);

// --- 2. Reports list ---
try {
  const reportsDir = join(PUBLIC, "reports");
  const files = readdirSync(reportsDir)
    .filter(f => f.toLowerCase().endsWith(".pdf"))
    .map(f => {
      const stat = statSync(join(reportsDir, f));
      const name = f.replace(/\.pdf$/i, "").replace(/_/g, " ");
      return { filename: f, name, size: stat.size, modified: stat.mtime };
    })
    .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
  writeFileSync(join(PUBLIC, "reports.json"), JSON.stringify(files, null, 2));
  console.log(`Generated reports.json (${files.length} PDFs)`);
} catch {
  writeFileSync(join(PUBLIC, "reports.json"), "[]");
  console.log("No reports directory found, wrote empty reports.json");
}

// --- 3. Financial ratios from Supabase ---
const SB_URL = process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
if (SB_KEY) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/financial_ratios?select=*&order=company`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const ratios = await res.json();
    writeFileSync(join(PUBLIC, "financial-ratios.json"), JSON.stringify(ratios, null, 2));
    console.log(`Generated financial-ratios.json (${ratios.length} companies)`);
  } catch (e) {
    console.log("Failed to fetch financial ratios from Supabase:", e);
    writeFileSync(join(PUBLIC, "financial-ratios.json"), "[]");
  }
} else {
  console.log("No SUPABASE_SERVICE_ROLE_KEY, skipping financial-ratios.json");
  writeFileSync(join(PUBLIC, "financial-ratios.json"), "[]");
}

// --- 4. Weekly summary from Supabase ---
if (SB_KEY) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/weekly_summaries?select=*&order=week_end.desc&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const summaries = await res.json();
    const latest = summaries?.[0] || null;
    writeFileSync(join(PUBLIC, "weekly-summary.json"), JSON.stringify(latest, null, 2));
    console.log(`Generated weekly-summary.json (${latest ? latest.week_start + ' to ' + latest.week_end : 'empty'})`);
  } catch (e) {
    console.log("Failed to fetch weekly summary from Supabase:", e);
    writeFileSync(join(PUBLIC, "weekly-summary.json"), "null");
  }
} else {
  writeFileSync(join(PUBLIC, "weekly-summary.json"), "null");
}

console.log("Static build complete.");
