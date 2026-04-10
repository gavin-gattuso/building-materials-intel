import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co";
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-db-key, Prefer");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Auth: accept either BRIEFING_API_KEY or the Supabase service role key
  const authHeader = req.headers["x-db-key"] as string;
  const validKeys = [process.env.BRIEFING_API_KEY, SUPABASE_KEY].filter(Boolean);
  if (!authHeader || !validKeys.includes(authHeader)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Path: /api/db?path=/rest/v1/articles&select=slug,title&date=eq.2026-04-07
  const dbPath = req.query.path as string;
  if (!dbPath) {
    return res.status(400).json({ error: "path query param required (e.g. /rest/v1/articles)" });
  }
  // Validate path to prevent arbitrary endpoint access
  const ALLOWED_PATHS = ["/rest/v1/articles", "/rest/v1/companies", "/rest/v1/market_drivers", "/rest/v1/concepts", "/rest/v1/weekly_summaries", "/rest/v1/financial_ratios", "/rest/v1/article_companies", "/rest/v1/av_report_sections", "/rest/v1/article_av_sections", "/rest/v1/earnings_calendar"];
  if (!ALLOWED_PATHS.some(p => dbPath.startsWith(p))) {
    return res.status(403).json({ error: "Path not allowed" });
  }

  // Build the Supabase URL with remaining query params
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(req.query)) {
    if (key === "path") continue;
    if (Array.isArray(val)) params.append(key, val.join(","));
    else if (val) params.append(key, val);
  }
  const url = `${SUPABASE_URL}${dbPath}${params.toString() ? "?" + params.toString() : ""}`;

  const headers: Record<string, string> = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
  const prefer = req.headers["prefer"];
  if (prefer) headers["Prefer"] = Array.isArray(prefer) ? prefer.join(", ") : prefer;

  try {
    const response = await fetch(url, {
      method: req.method || "GET",
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.text();
    res.status(response.status);
    for (const [k, v] of response.headers.entries()) {
      if (k.toLowerCase() === "content-type") res.setHeader(k, v);
    }
    return res.send(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
