import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompanyBySlug, getMarketDriverBySlug, getConceptBySlug } from "../kb-loader";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const slug = req.query.id as string;

  // Try each table
  const company = await getCompanyBySlug(slug);
  if (company) {
    return res.json({
      id: company.slug,
      title: company.name,
      type: "company",
      content: company.content,
      frontmatter: { ticker: company.ticker, sector: company.sector, subsector: company.subsector },
    });
  }

  const driver = await getMarketDriverBySlug(slug);
  if (driver) {
    return res.json({
      id: driver.slug,
      title: driver.title,
      type: "market-driver",
      content: driver.content,
      frontmatter: { current_signal: driver.current_signal },
    });
  }

  const concept = await getConceptBySlug(slug);
  if (concept) {
    return res.json({
      id: concept.slug,
      title: concept.title,
      type: "concept",
      content: concept.content,
      frontmatter: {},
    });
  }

  res.status(404).json({ error: "Not found" });
}
