import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildReportHTML } from "../lib/html-report.js";

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

    const html = buildReportHTML({
      startDate,
      endDate,
      executiveSummary,
      sections: sections || [],
      drivers: drivers || [],
    });

    const filename = `Building_Materials_Report_${safeStart}_to_${safeEnd}.html`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(html);
  } catch (err: any) {
    console.error("build-report error:", err);
    return res.status(500).json({ error: "Failed to build report" });
  }
}
