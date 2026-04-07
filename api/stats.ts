import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getStats } from "./kb-loader";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const stats = await getStats();
    res.json(stats);
  } catch (err: any) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({ error: err.message });
  }
}
