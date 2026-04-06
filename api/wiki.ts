import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadKB, getWikiPages } from "./kb-loader";

export default function handler(req: VercelRequest, res: VercelResponse) {
  loadKB();
  res.setHeader("Access-Control-Allow-Origin", "*");

  const type = req.query.type as string | undefined;
  let pages = getWikiPages();
  if (type) pages = pages.filter(p => p.type === type);
  const slim = pages.map(({ content, ...rest }) => rest);
  res.json(slim);
}
