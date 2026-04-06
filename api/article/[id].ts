import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadKB, getArticles } from "../kb-loader";

export default function handler(req: VercelRequest, res: VercelResponse) {
  loadKB();
  res.setHeader("Access-Control-Allow-Origin", "*");

  const id = req.query.id as string;
  const article = getArticles().find(a => a.id === id);
  if (!article) return res.status(404).json({ error: "Not found" });
  res.json(article);
}
