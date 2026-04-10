import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { buildDashboardHTML } from "../lib/html-dashboard.js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || "";
  const allowed = ["https://building-materials-intel.vercel.app", "https://av-newsletter-hub.vercel.app", "http://localhost:3000"];
  res.setHeader("Access-Control-Allow-Origin", allowed.includes(origin) ? origin : allowed[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  try {
    const { startDate, endDate, executiveSummary, sections, drivers } = req.body;

    // Validate date params to prevent header injection
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const safeStart = dateRe.test(startDate) ? startDate : "unknown";
    const safeEnd = dateRe.test(endDate) ? endDate : "unknown";

    // Fetch financial ratios from Supabase for the company data charts
    let financials: any[] = [];
    if (SUPABASE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data } = await supabase
        .from("financial_ratios")
        .select("company, ticker, segment, category, revenue_growth_yoy, cogs_sales_pct, cogs_sales_yoy_delta, sga_sales_pct, sga_sales_yoy_delta, ebitda_margin_pct, ebitda_margin_yoy_delta")
        .order("company");
      financials = data || [];
    }

    const html = buildDashboardHTML({
      startDate,
      endDate,
      executiveSummary: executiveSummary || "",
      sections: sections || [],
      drivers: drivers || [],
      financials,
    });

    const filename = `Building_Materials_Dashboard_${safeStart}_to_${safeEnd}.html`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(html);
  } catch (err: any) {
    console.error("build-report error:", err);
    return res.status(500).json({ error: "Failed to build report" });
  }
}
