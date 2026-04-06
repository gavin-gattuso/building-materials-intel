import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadKB, getStats } from "./kb-loader";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  loadKB();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json(getStats());
}
