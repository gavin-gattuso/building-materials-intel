import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getArticles, searchKB } from "./kb-loader";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");

    const q = req.query.q as string | undefined;
    const category = req.query.category as string | undefined;
    const company = req.query.company as string | undefined;
    const limit = Number(req.query.limit) || 50;

    let results: any[];

    if (q) {
      results = (await searchKB(q, limit)).map(r => r.entry).filter(e => e.type === "article");
    } else {
      results = await getArticles(limit);
    }

    if (category) results = results.filter((a: any) => a.category?.toLowerCase().includes(category.toLowerCase()));
    if (company) results = results.filter((a: any) => a.companies?.some((c: string) => c.toLowerCase().includes(company.toLowerCase())));

    const slim = results.slice(0, limit).map(({ content, ...rest }: any) => rest);
    res.json(slim);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
