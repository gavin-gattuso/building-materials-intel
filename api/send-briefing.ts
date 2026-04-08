import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const authHeader = req.headers["x-briefing-key"];
  if (!authHeader || authHeader !== process.env.BRIEFING_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { subject, html, to } = req.body || {};
  if (!subject || !html) {
    return res.status(400).json({ error: "subject and html required" });
  }

  const recipient = to || "gavin.gattuso@appliedvalue.com";
  const from = process.env.RESEND_FROM_EMAIL || "Jarvis AI <briefing@resend.dev>";

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: [recipient],
      subject,
      html,
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true, id: data?.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
