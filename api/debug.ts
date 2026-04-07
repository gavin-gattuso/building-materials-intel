import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL || "(not set)";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ? "set (" + process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 10) + "...)" : "(not set)";

    const supabase = createClient(
      process.env.SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    );

    const { data, error, count } = await supabase
      .from("articles")
      .select("slug", { count: "exact", head: true });

    res.json({
      env: { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key },
      test: { count, error: error?.message || null },
      nodeVersion: process.version,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}
