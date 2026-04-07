import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompanies, getMarketDrivers, getConcepts } from "./kb-loader";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const type = req.query.type as string | undefined;

  const pages: any[] = [];

  if (!type || type === "company") {
    const companies = await getCompanies();
    pages.push(...companies.map(c => ({
      id: c.slug,
      title: c.name,
      type: "company",
      frontmatter: { ticker: c.ticker, sector: c.sector, subsector: c.subsector },
    })));
  }

  if (!type || type === "market-driver") {
    const drivers = await getMarketDrivers();
    pages.push(...drivers.map(d => ({
      id: d.slug,
      title: d.title,
      type: "market-driver",
      frontmatter: { current_signal: d.current_signal },
    })));
  }

  if (!type || type === "concept") {
    const concepts = await getConcepts();
    pages.push(...concepts.map(c => ({
      id: c.slug,
      title: c.title,
      type: "concept",
      frontmatter: {},
    })));
  }

  res.json(pages);
}
