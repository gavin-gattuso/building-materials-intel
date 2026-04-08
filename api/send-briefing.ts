import type { VercelRequest, VercelResponse } from "@vercel/node";

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
  const from = process.env.RESEND_FROM_EMAIL || "Jarvis AI <onboarding@resend.dev>";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [recipient], subject, html }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    return res.status(200).json({ ok: true, id: data.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
