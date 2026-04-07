import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildReportDocument } from "../lib/docx-formatting";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  try {
    const { startDate, endDate, executiveSummary, sections, drivers } = req.body;
    const buffer = await buildReportDocument({
      startDate,
      endDate,
      executiveSummary,
      sections: sections || [],
      drivers: drivers || [],
    });

    const filename = `Building_Materials_Report_${startDate}_to_${endDate}.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err: any) {
    console.error("build-report error:", err);
    return res.status(500).json({ error: err.message || "Failed to build report" });
  }
}
