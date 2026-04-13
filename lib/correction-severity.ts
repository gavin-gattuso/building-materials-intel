/**
 * Shared helpers for classifying the severity of a detected correction.
 * Consumed by api/detect-corrections.ts and scripts/detect-corrections.ts.
 */

export type ChangeSeverity = "cosmetic" | "structural" | "numeric";

const NUM_RE = /\b\d[\d,]*\.?\d*\s*(%|bn|million|billion|pts|pp|x)?\b/gi;

/** Strip HTML and collapse whitespace. */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract comparable numeric tokens. Returns { raw: string, value: number } pairs. */
export function extractNumbers(text: string): { raw: string; value: number }[] {
  const out: { raw: string; value: number }[] = [];
  if (!text) return out;
  const matches = text.match(NUM_RE) || [];
  for (const m of matches) {
    const clean = m.trim();
    const num = parseFloat(clean.replace(/[,%]/g, "").replace(/\s*(bn|million|billion|pts|pp|x)/i, ""));
    if (Number.isFinite(num)) out.push({ raw: clean, value: num });
  }
  return out;
}

/**
 * Classify a correction.
 *   - titleChanged + body identical → cosmetic
 *   - body length delta > 10% → structural
 *   - any original number missing in re-fetch OR >5% relative change → numeric
 *     (numeric wins over structural if both)
 */
export function classifySeverity(
  originalTitle: string,
  newTitle: string,
  originalBody: string | null | undefined,
  newBody: string | null | undefined
): ChangeSeverity {
  const titleChanged = originalTitle.trim() !== newTitle.trim();
  const origBody = originalBody || "";
  const curBody = newBody || "";

  // Numeric check (strongest)
  if (origBody && curBody) {
    const origNums = extractNumbers(origBody + " " + originalTitle);
    const curNums = extractNumbers(curBody + " " + newTitle);
    for (const o of origNums) {
      const match = curNums.find(c =>
        c.value === o.value ||
        (o.value !== 0 && Math.abs((c.value - o.value) / o.value) <= 0.05)
      );
      if (!match) return "numeric";
    }
  }

  // Structural check
  if (origBody && curBody) {
    const lenDelta = Math.abs(curBody.length - origBody.length) / Math.max(origBody.length, 1);
    if (lenDelta > 0.1) return "structural";
  }

  // Fallback: title-only change
  if (titleChanged) return "cosmetic";
  return "cosmetic";
}

import { sendEmail, idempotencyKey } from "./email.js";

/** Send an alert for a numeric-severity correction. Non-fatal on failure. */
export async function sendNumericCorrectionAlert(
  articleTitle: string,
  articleUrl: string,
  slug: string,
  log: (msg: string) => void = () => {}
): Promise<void> {
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px">
    <h2 style="color:#B71C1C">Numeric figure changed in a published source</h2>
    <p>A Tier 1-2 article that is already in the knowledge base has been re-published with a <strong>different numeric figure</strong>. Because numeric corrections can propagate into the bi-annual report, this requires immediate human review.</p>
    <p><strong>Article:</strong> ${articleTitle}</p>
    <p><strong>URL:</strong> <a href="${articleUrl}">${articleUrl}</a></p>
    <p><strong>Slug:</strong> ${slug}</p>
    <p>The article's <code>report_ready</code> flag has been cleared and it is queued for human review.</p>
  </div>`;

  const result = await sendEmail({
    type: "alert-numeric-correction",
    subject: `[ALERT] Numeric correction detected — ${slug}`,
    html,
    idempotencyKey: idempotencyKey("alert-numeric-correction", slug),
  });
  log(`Numeric correction alert for ${slug}: ${result.status}`);
}
