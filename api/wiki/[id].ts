import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadKB, getWikiPages } from "../kb-loader";

export default function handler(req: VercelRequest, res: VercelResponse) {
  loadKB();
  res.setHeader("Access-Control-Allow-Origin", "*");

  const id = req.query.id as string;
  const page = getWikiPages().find(p => p.id === id);
  if (!page) return res.status(404).json({ error: "Not found" });
  res.json(page);
}
