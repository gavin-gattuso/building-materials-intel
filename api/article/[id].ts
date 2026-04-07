import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getArticleBySlug } from "../kb-loader";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const slug = req.query.id as string;
  const article = await getArticleBySlug(slug);
  if (!article) return res.status(404).json({ error: "Not found" });
  res.json(article);
}
