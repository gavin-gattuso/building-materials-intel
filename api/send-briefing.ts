import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendEmail } from "../lib/email.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const authHeader = req.headers["x-briefing-key"] as string;
  const sbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const validKeys = [process.env.BRIEFING_API_KEY, sbKey].filter(Boolean);
  if (!authHeader || !validKeys.includes(authHeader)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { subject, html, to } = req.body || {};
  if (!subject || !html) {
    return res.status(400).json({ error: "subject and html required" });
  }

  const result = await sendEmail({
    type: "briefing-passthrough",
    subject,
    html,
    to,
  });

  if (result.status === "sent") return res.status(200).json({ ok: true, id: result.resendId });
  if (result.status === "failed") return res.status(502).json({ error: result.error });
  return res.status(200).json({ ok: true, skipped: result.status });
}
