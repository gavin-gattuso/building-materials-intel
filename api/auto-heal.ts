/**
 * /api/auto-heal — the daily self-healing endpoint.
 *
 * Schedule: 06:00 UTC daily (2h after /api/daily-scan at 04:00 UTC).
 * Auth: isAuthorizedCronOrPrivileged (same as other crons).
 *
 * Flow:
 *   1. Run all detection routines from lib/auto-heal.ts in parallel.
 *   2. Run fixes: release stuck locks, trigger ONE backfill if warranted.
 *   3. Send ONE consolidated escalation email if anything was healed or
 *      needs human action. Idempotency-keyed on date so a manual
 *      re-invocation doesn't double-email.
 *   4. Write one row to auto_heal_runs with full detected/fixed/escalated
 *      JSONB arrays for the paper trail.
 *
 * Replaces the deprecated /api/healthcheck cron entry. Healthcheck logic
 * (staleness + stuck-lock + trend alerts) is subsumed into the detection
 * routines here. The healthcheck handler in api/index.ts is kept available
 * for manual GET requests but is no longer cron-fired.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { isAuthorizedCronOrPrivileged } from "../lib/auth.js";
import { runAutoHeal } from "../lib/auto-heal.js";
import { sendEmail } from "../lib/email.js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const CRON_SECRET = (process.env.CRON_SECRET || "").trim();

// Production URL is fixed — used by the auto-heal lib to call /api/daily-scan
// when triggering a recovery backfill. Hardcoded to avoid relying on
// VERCEL_URL which can return per-deployment preview URLs.
const PRODUCTION_BASE_URL = "https://building-materials-intel.vercel.app";

export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorizedCronOrPrivileged(req)) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  if (!CRON_SECRET) {
    // We need CRON_SECRET to call /api/daily-scan internally for backfill.
    // Without it, auto-heal can detect but cannot trigger recovery. Run in
    // detect-only mode and surface this prominently.
    console.warn("[auto-heal] CRON_SECRET not set — running in detect-only mode");
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  const result = await runAutoHeal(sb, {
    cronSecret: CRON_SECRET,
    baseUrl: PRODUCTION_BASE_URL,
    // Nightly /api/daily-scan is intentionally disabled (cron removed from
    // vercel.json + Anthropic trigger disabled). Keep auto-heal detecting and
    // escalating, but do NOT let it silently re-trigger the nightly via a
    // backfill — that would defeat the stop. Re-enable (Boolean(CRON_SECRET))
    // when the nightly is turned back on.
    allowBackfill: false,
    sendEmail: true,
    emailFn: async ({ subject, html, idempotencyKey }) => {
      const send = await sendEmail({
        type: "auto-heal-summary",
        subject,
        html,
        idempotencyKey,
      });
      return { status: send.status };
    },
  });

  // Paper trail. Best-effort — never fail the response on logging failure.
  try {
    await sb.from("auto_heal_runs").insert({
      duration_ms: result.duration_ms,
      detected: result.detected,
      fixed: result.fixed,
      escalated: result.escalated,
      email_sent: result.email_sent,
      log: result.log,
    });
  } catch (err: any) {
    console.error(`[auto-heal] paper-trail insert failed: ${err?.message || err}`);
  }

  return res.status(200).json({
    ok: true,
    detected_count: result.detected.length,
    fixed_count: result.fixed.filter(f => f.success).length,
    escalated_count: result.escalated.length,
    email_sent: result.email_sent,
    duration_ms: result.duration_ms,
    detail: {
      detected: result.detected,
      fixed: result.fixed,
      log: result.log,
    },
  });
}
