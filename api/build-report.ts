import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildReportHTML } from "../lib/html-report.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  try {
    const { startDate, endDate, executiveSummary, sections, drivers } = req.body;
    const html = buildReportHTML({
      startDate,
      endDate,
      executiveSummary,
      sections: sections || [],
      drivers: drivers || [],
    });

    const filename = `Building_Materials_Report_${startDate}_to_${endDate}.html`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(html);
  } catch (err: any) {
    console.error("build-report error:", err);
    return res.status(500).json({ error: err.message || "Failed to build report" });
  }
}
