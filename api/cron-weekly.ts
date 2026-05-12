/**
 * Consolidated weekly cron — runs Fridays 22:00 UTC.
 *
 * Why this exists: Vercel Hobby tier caps cron jobs at 2. We have 4 declared
 * in vercel.json (daily-scan, healthcheck, detect-corrections, cron-weekly-
 * summary). On Hobby, the latter two register but never fire. This endpoint
 * collapses both weekly jobs into one so we fit under the limit while keeping
 * the same operational coverage. detect-corrections + cron-weekly-summary are
 * left in place for manual invocation but are removed from vercel.json crons.
 *
 * Runs them in series (corrections first, then summary) so a failure in one
 * doesn't block the other. Returns both statuses in the response.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateWeeklySummary } from "../scripts/generate-weekly-summary.js";
import { isAuthorizedCronOrPrivileged } from "../lib/auth.js";

export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorizedCronOrPrivileged(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results: { corrections?: any; weeklySummary?: any; errors: string[] } = { errors: [] };

  // 1. Detect corrections (Tier 1-2 article re-fetch). Best-effort: forwards to
  // the existing /api/detect-corrections endpoint internally so we don't
  // duplicate that 200-line function. If it fails, we still proceed to the
  // weekly summary.
  try {
    const host = req.headers.host || "building-materials-intel.vercel.app";
    const proto = (req.headers["x-forwarded-proto"] as string) || "https";
    // Forward our CRON_SECRET so detect-corrections accepts the call. Bearer
    // is preferred; the explicit key fallback is for environments where the
    // header is stripped by a proxy.
    const cronSecret = process.env.CRON_SECRET || "";
    const corrRes = await fetch(`${proto}://${host}/api/detect-corrections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cronSecret ? { "Authorization": `Bearer ${cronSecret}`, "x-scan-key": cronSecret } : {}),
        "x-vercel-cron": "1",
      },
      signal: AbortSignal.timeout(120000),
    });
    results.corrections = corrRes.ok
      ? await corrRes.json().catch(() => ({ ok: false, error: "parse failed" }))
      : { ok: false, status: corrRes.status, error: await corrRes.text().catch(() => "") };
  } catch (err: any) {
    results.errors.push(`corrections: ${(err?.message || "?").slice(0, 200)}`);
  }

  // 2. Generate the weekly summary directly via the shared helper. We don't
  // round-trip through /api/cron-weekly-summary because doing so would burn
  // a second 300s function budget for no benefit.
  try {
    results.weeklySummary = await generateWeeklySummary({ targetDate: new Date() });
  } catch (err: any) {
    results.errors.push(`weekly_summary: ${(err?.message || "?").slice(0, 200)}`);
  }

  const ok = results.errors.length === 0
    && (results.corrections?.ok !== false)
    && (results.weeklySummary?.status !== "error");
  return res.status(ok ? 200 : 207).json({ ok, ranAt: new Date().toISOString(), ...results });
}
