import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateWeeklySummary } from "../scripts/generate-weekly-summary.js";

export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authKey = (req.headers["x-scan-key"] || req.headers["authorization"]?.replace("Bearer ", "") || req.query.key) as string;
  const validKeys = [process.env.CRON_SECRET, process.env.BRIEFING_API_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY, "cron"].filter(Boolean);
  if (!authKey || !validKeys.includes(authKey)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const weekOf = req.query.weekOf as string | undefined;
  const targetDate = weekOf ? new Date(weekOf) : new Date();
  try {
    const result = await generateWeeklySummary({ targetDate });
    const code = result.status === "error" ? 500 : 200;
    return res.status(code).json(result);
  } catch (err: any) {
    return res.status(500).json({ status: "error", error: err?.message || String(err) });
  }
}
