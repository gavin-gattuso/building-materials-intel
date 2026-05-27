/**
 * Auto-healing routines for the pipeline.
 *
 * Runs daily at 06:00 UTC (2h after the 04:00 UTC nightly cron) via
 * /api/auto-heal. Detects known failure modes, attempts in-runtime fixes
 * where possible, and consolidates unfixable issues into a single daily
 * escalation email instead of the previous alert-per-failure spam.
 *
 * Design contract:
 *   - All detection routines are read-only and run in parallel.
 *   - All fix routines are idempotent (safe to re-run on next invocation).
 *   - Every fix has a per-routine 30s timeout — one slow fix can't block
 *     other detections.
 *   - At most ONE auto-triggered backfill per auto-heal invocation (caps
 *     blast radius if a detection routine misfires).
 *   - One row written to auto_heal_runs per invocation regardless of
 *     whether anything was detected, so the absence-of-evidence case is
 *     observable (a totally silent auto-heal means it never ran).
 *
 * See [[project_pipeline_cron_fix]] memory for the failure history this
 * was built to prevent.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── Types ──

export type FailureCode =
  | "no_recent_run"
  | "stuck_lock"
  | "zero_archive_with_candidates"
  | "freshness_drift"
  | "anthropic_dead"
  | "body_fetch_drop"
  | "url_decode_drop"
  | "digest_missing"
  | "review_overdue";

export type Severity = "fixable" | "escalation";

export interface Detection {
  code: FailureCode;
  severity: Severity;
  detail: string;
  /** Additional structured data the fix routine or escalation email may use. */
  context?: Record<string, any>;
}

export interface FixAttempt {
  code: FailureCode;
  action: string;
  success: boolean;
  error?: string;
  /** Echo any context the detection passed in (so the run log is self-describing). */
  context?: Record<string, any>;
}

export interface AutoHealResult {
  detected: Detection[];
  fixed: FixAttempt[];
  escalated: Detection[];
  log: string[];
  duration_ms: number;
  email_sent: boolean;
}

// ── Detection routines ──

/**
 * #1: No scheduled daily-scan run completed in the last 28 hours.
 * This is the failure mode that ran for 12 days before the 2026-05-27 fix.
 */
async function detectNoRecentRun(sb: SupabaseClient): Promise<Detection | null> {
  const { data, error } = await sb
    .from("pipeline_runs")
    .select("started_at, run_date")
    .eq("invocation", "scheduled")
    .order("started_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) {
    return {
      code: "no_recent_run",
      severity: "fixable",
      detail: "Zero scheduled pipeline_runs rows found. Cron has never recorded a successful run.",
    };
  }
  const last = new Date(data[0].started_at).getTime();
  const hoursAgo = (Date.now() - last) / 36e5;
  if (hoursAgo > 28) {
    return {
      code: "no_recent_run",
      severity: "fixable",
      detail: `Last scheduled run was ${hoursAgo.toFixed(1)}h ago (run_date=${data[0].run_date}). Expected within 28h.`,
      context: { last_started_at: data[0].started_at, hours_ago: hoursAgo },
    };
  }
  return null;
}

/**
 * #2: daily_run_lock row stuck in 'in_progress' state for >30 minutes.
 * A previous run crashed before writing its terminal state. The unique
 * constraint on run_date blocks the next cron from claiming today's lock.
 */
async function detectStuckLock(sb: SupabaseClient): Promise<Detection | null> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data } = await sb
    .from("daily_run_lock")
    .select("run_date, started_at")
    .eq("status", "in_progress")
    .lt("started_at", cutoff);
  if (!data || data.length === 0) return null;
  return {
    code: "stuck_lock",
    severity: "fixable",
    detail: `${data.length} daily_run_lock row(s) stuck in_progress > 30 min: ${data.map(d => d.run_date).join(", ")}`,
    context: { stuck_dates: data.map(d => d.run_date) },
  };
}

/**
 * #3: Today's scheduled run got >20 candidates but archived 0.
 * Indicates the ingest reached the loop but every article got skipped or
 * crashed mid-loop. Often a stale-window quirk that a wider day window fixes.
 */
async function detectZeroArchiveWithCandidates(sb: SupabaseClient): Promise<Detection | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await sb
    .from("pipeline_runs")
    .select("candidates, archived, skipped, rejected, started_at")
    .eq("run_date", today)
    .eq("invocation", "scheduled")
    .order("started_at", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return null;
  const row = data[0];
  if (row.candidates > 20 && row.archived === 0) {
    return {
      code: "zero_archive_with_candidates",
      severity: "fixable",
      detail: `Today's scheduled run had ${row.candidates} candidates but archived 0 (skipped=${row.skipped}, rejected=${row.rejected}). Likely a feed-window or dedup-storm issue.`,
      context: { candidates: row.candidates, skipped: row.skipped, rejected: row.rejected },
    };
  }
  return null;
}

/**
 * #4: Newest article in articles table is >48h old.
 * Catches the case where the cron is firing successfully but archiving
 * nothing (e.g. RSS feed itself returned no eligible articles).
 */
async function detectFreshnessDrift(sb: SupabaseClient): Promise<Detection | null> {
  const { data } = await sb
    .from("articles")
    .select("date, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) {
    return {
      code: "freshness_drift",
      severity: "fixable",
      detail: "Articles table is empty.",
    };
  }
  const last = new Date(data[0].created_at).getTime();
  const hoursAgo = (Date.now() - last) / 36e5;
  if (hoursAgo > 48) {
    return {
      code: "freshness_drift",
      severity: "fixable",
      detail: `Newest article ${hoursAgo.toFixed(1)}h old (created_at=${data[0].created_at}, article date=${data[0].date}).`,
      context: { hours_ago: hoursAgo, suggested_days_window: Math.min(14, Math.ceil(hoursAgo / 24) + 1) },
    };
  }
  return null;
}

/**
 * #5: Anthropic dead — anthropic_calls > 0 but anthropic_ok == 0 across
 * last 3 scheduled runs. Indicates the key is missing or invalid.
 * Not in-runtime fixable; escalates.
 */
async function detectAnthropicDead(sb: SupabaseClient): Promise<Detection | null> {
  const { data } = await sb
    .from("pipeline_runs")
    .select("anthropic_calls, anthropic_ok, anthropic_last_error, started_at")
    .eq("invocation", "scheduled")
    .order("started_at", { ascending: false })
    .limit(3);
  if (!data || data.length < 3) return null;
  const totalCalls = data.reduce((a, b) => a + (b.anthropic_calls || 0), 0);
  const totalOk = data.reduce((a, b) => a + (b.anthropic_ok || 0), 0);
  if (totalCalls < 10) return null; // not enough signal
  if (totalOk === 0) {
    return {
      code: "anthropic_dead",
      severity: "escalation",
      detail: `Anthropic 0/${totalCalls} OK across last 3 scheduled runs. Last error: ${data[0].anthropic_last_error || "(none recorded)"}`,
      context: { total_calls: totalCalls, last_error: data[0].anthropic_last_error },
    };
  }
  return null;
}

/**
 * #6: body_fetch_pct < 25% averaged across last 3 scheduled runs.
 * Sources are blocking us. Code change needed (UA rotation, etc.).
 */
async function detectBodyFetchDrop(sb: SupabaseClient): Promise<Detection | null> {
  const { data } = await sb
    .from("pipeline_runs")
    .select("body_fetch_pct, body_fetch_attempted")
    .eq("invocation", "scheduled")
    .order("started_at", { ascending: false })
    .limit(3);
  if (!data || data.length < 3) return null;
  const samples = data.filter(d => d.body_fetch_pct != null && d.body_fetch_attempted > 5);
  if (samples.length < 2) return null;
  const avg = samples.reduce((a, b) => a + Number(b.body_fetch_pct), 0) / samples.length;
  if (avg < 25) {
    return {
      code: "body_fetch_drop",
      severity: "escalation",
      detail: `body_fetch_pct averaged ${avg.toFixed(1)}% over last ${samples.length} runs (threshold: 25%). Sources may be blocking the fetcher.`,
      context: { avg_pct: avg, samples: samples.length },
    };
  }
  return null;
}

/**
 * #7: url_decode_pct < 50% averaged across last 3 scheduled runs.
 * Google rotated their decoder. Code change needed.
 */
async function detectUrlDecodeDrop(sb: SupabaseClient): Promise<Detection | null> {
  const { data } = await sb
    .from("pipeline_runs")
    .select("url_decode_pct, url_decode_attempted")
    .eq("invocation", "scheduled")
    .order("started_at", { ascending: false })
    .limit(3);
  if (!data || data.length < 3) return null;
  const samples = data.filter(d => d.url_decode_pct != null && d.url_decode_attempted > 5);
  if (samples.length < 2) return null;
  const avg = samples.reduce((a, b) => a + Number(b.url_decode_pct), 0) / samples.length;
  if (avg < 50) {
    return {
      code: "url_decode_drop",
      severity: "escalation",
      detail: `url_decode_pct averaged ${avg.toFixed(1)}% over last ${samples.length} runs (threshold: 50%). Google News decoder may need updating.`,
      context: { avg_pct: avg, samples: samples.length },
    };
  }
  return null;
}

/**
 * #8: No 'digest' email sent today despite articles being archived today.
 * Common cause: Resend 409 idempotency collision (digest already sent for
 * this date, but content changed mid-day). Escalates with a manual recipe.
 */
async function detectDigestMissing(sb: SupabaseClient): Promise<Detection | null> {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: articlesToday }, { data: emailsToday }] = await Promise.all([
    sb.from("articles").select("id", { count: "exact", head: false }).gte("date", today),
    sb.from("email_send_log").select("status, error")
      .eq("type", "digest")
      .gte("created_at", today + "T00:00:00Z")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const articleCount = (articlesToday || []).length;
  if (articleCount === 0) return null; // no articles, no digest expected
  const sentToday = (emailsToday || []).some(e => e.status === "sent");
  if (!sentToday) {
    const lastErr = (emailsToday || [])[0]?.error || "(no email_send_log row at all)";
    return {
      code: "digest_missing",
      severity: "escalation",
      detail: `${articleCount} article(s) archived today but no digest email sent. Last attempt: ${lastErr.slice(0, 200)}`,
      context: { articles_today: articleCount, last_error: lastErr },
    };
  }
  return null;
}

/**
 * #9: Review queue items pending > 48h. Already alerted nightly but
 * folding into the consolidated email reduces inbox noise.
 */
async function detectReviewOverdue(sb: SupabaseClient): Promise<Detection | null> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data } = await sb
    .from("human_review_queue")
    .select("id")
    .eq("review_status", "pending")
    .lt("created_at", cutoff);
  if (!data || data.length === 0) return null;
  return {
    code: "review_overdue",
    severity: "escalation",
    detail: `${data.length} review queue item(s) pending > 48 hours. Approve or dismiss in the daily digest email.`,
    context: { count: data.length },
  };
}

// ── Detection orchestration ──

const DETECTORS: Array<(sb: SupabaseClient) => Promise<Detection | null>> = [
  detectNoRecentRun,
  detectStuckLock,
  detectZeroArchiveWithCandidates,
  detectFreshnessDrift,
  detectAnthropicDead,
  detectBodyFetchDrop,
  detectUrlDecodeDrop,
  detectDigestMissing,
  detectReviewOverdue,
];

export async function runDetection(sb: SupabaseClient): Promise<Detection[]> {
  const results = await Promise.allSettled(DETECTORS.map(d => d(sb)));
  const detections: Detection[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) detections.push(r.value);
  }
  return detections;
}

// ── Fix routines ──

const FIX_TIMEOUT_MS = 30000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

/**
 * Triggers /api/daily-scan?backfill=1&days=N internally. Cap-limited to
 * one trigger per auto-heal invocation regardless of how many detections
 * want to fire it.
 */
async function triggerBackfill(daysWindow: number, cronSecret: string, baseUrl: string): Promise<{ ok: boolean; archived?: number; error?: string }> {
  const safeDays = Math.max(1, Math.min(14, daysWindow));
  const url = `${baseUrl}/api/daily-scan?backfill=1&days=${safeDays}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}` };
    return { ok: true, archived: body.archived };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function fixStuckLock(sb: SupabaseClient, stuckDates: string[]): Promise<FixAttempt> {
  try {
    const { error } = await sb
      .from("daily_run_lock")
      .update({ status: "failed", completed_at: new Date().toISOString() })
      .in("run_date", stuckDates)
      .eq("status", "in_progress");
    if (error) return { code: "stuck_lock", action: `release_locks(${stuckDates.join(",")})`, success: false, error: error.message };
    return { code: "stuck_lock", action: `release_locks(${stuckDates.join(",")})`, success: true, context: { dates: stuckDates } };
  } catch (err: any) {
    return { code: "stuck_lock", action: "release_locks", success: false, error: err?.message || String(err) };
  }
}

export interface FixOptions {
  cronSecret: string;
  baseUrl: string;
  /** Allow backfill side-effect. Disable in tests. */
  allowBackfill: boolean;
}

export async function runFixes(
  sb: SupabaseClient,
  detections: Detection[],
  opts: FixOptions
): Promise<{ fixed: FixAttempt[]; backfillTriggered: boolean }> {
  const fixed: FixAttempt[] = [];
  let backfillTriggered = false;

  // 1. Release stuck locks first (must precede backfill — backfill bypasses
  // the lock, but a stuck lock blocks tomorrow's cron).
  const stuckLockDetection = detections.find(d => d.code === "stuck_lock");
  if (stuckLockDetection) {
    const dates = (stuckLockDetection.context?.stuck_dates as string[]) || [];
    if (dates.length > 0) {
      const result = await withTimeout(fixStuckLock(sb, dates), FIX_TIMEOUT_MS, "fixStuckLock").catch((e: any) => ({
        code: "stuck_lock" as FailureCode, action: "release_locks", success: false, error: e?.message || String(e),
      }));
      fixed.push(result);
    }
  }

  // 2. Decide if backfill is warranted. Any of these detections want one:
  //    no_recent_run, freshness_drift, zero_archive_with_candidates.
  //    Cap: max one backfill trigger per auto-heal invocation.
  const wantsBackfill = detections.filter(d =>
    d.code === "no_recent_run" || d.code === "freshness_drift" || d.code === "zero_archive_with_candidates"
  );
  if (wantsBackfill.length > 0 && opts.allowBackfill) {
    // Pick the widest window any of them requested.
    const days = Math.max(
      ...wantsBackfill.map(d => (d.context?.suggested_days_window as number) || 2),
      2
    );
    const result = await withTimeout(
      triggerBackfill(days, opts.cronSecret, opts.baseUrl),
      FIX_TIMEOUT_MS * 3, // backfill can legitimately take 40s+
      "triggerBackfill"
    ).catch((e: any) => ({ ok: false, error: e?.message || String(e) }));
    backfillTriggered = true;
    const triggered_codes = wantsBackfill.map(d => d.code);
    for (const d of wantsBackfill) {
      fixed.push({
        code: d.code,
        action: `backfill(days=${days})`,
        success: result.ok,
        error: result.ok ? undefined : result.error,
        context: { days, archived: result.archived, also_addresses: triggered_codes },
      });
    }
  } else if (wantsBackfill.length > 0 && !opts.allowBackfill) {
    for (const d of wantsBackfill) {
      fixed.push({
        code: d.code,
        action: "backfill(SKIPPED — allowBackfill=false)",
        success: false,
        error: "Backfill disabled by caller",
      });
    }
  }

  return { fixed, backfillTriggered };
}

// ── Escalation email ──

export function buildEscalationEmail(
  detections: Detection[],
  fixes: FixAttempt[],
  baseUrl: string
): { subject: string; html: string } {
  const escalations = detections.filter(d => d.severity === "escalation");
  const fixSuccesses = fixes.filter(f => f.success);
  const fixFailures = fixes.filter(f => !f.success);
  const hasAnything = escalations.length > 0 || fixes.length > 0;

  const subjectBits: string[] = [];
  if (fixSuccesses.length > 0) subjectBits.push(`${fixSuccesses.length} healed`);
  if (escalations.length > 0) subjectBits.push(`${escalations.length} need you`);
  if (fixFailures.length > 0) subjectBits.push(`${fixFailures.length} fix failed`);
  const subject = `[auto-heal] ${subjectBits.join(" · ") || "all clear"} — ${new Date().toISOString().slice(0, 10)}`;

  let html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto">`;
  html += `<div style="background:#1B3C2D;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0">`;
  html += `<h1 style="margin:0;font-size:18px">Auto-Heal Daily Summary</h1>`;
  html += `<p style="margin:4px 0 0;opacity:0.85;font-size:12px">${new Date().toISOString()}</p>`;
  html += `</div>`;
  html += `<div style="padding:20px 24px;background:#f9f9f9">`;

  if (!hasAnything) {
    html += `<p style="margin:0;color:#2E7D52;font-size:14px"><strong>All clear.</strong> No failure modes detected.</p>`;
  }

  if (fixSuccesses.length > 0) {
    html += `<h2 style="color:#2E7D52;font-size:14px;margin:16px 0 6px">Healed automatically</h2>`;
    html += `<ul style="margin:0;padding-left:20px;font-size:13px;color:#333">`;
    for (const f of fixSuccesses) {
      html += `<li><strong>${f.code}</strong> — ${f.action}${f.context?.archived != null ? ` (archived ${f.context.archived})` : ""}</li>`;
    }
    html += `</ul>`;
  }

  if (fixFailures.length > 0) {
    html += `<h2 style="color:#B71C1C;font-size:14px;margin:16px 0 6px">Fix attempts that failed</h2>`;
    html += `<ul style="margin:0;padding-left:20px;font-size:13px;color:#333">`;
    for (const f of fixFailures) {
      html += `<li><strong>${f.code}</strong> — ${f.action}<br><span style="color:#999;font-size:11px">${(f.error || "").slice(0, 240)}</span></li>`;
    }
    html += `</ul>`;
  }

  if (escalations.length > 0) {
    html += `<h2 style="color:#E65100;font-size:14px;margin:16px 0 6px">Needs you (not auto-fixable)</h2>`;
    html += `<table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="background:#163E2D;color:white"><th style="padding:6px 8px;text-align:left">Issue</th><th style="padding:6px 8px;text-align:left">Detail</th><th style="padding:6px 8px;text-align:left">What to do</th></tr></thead><tbody>`;
    for (const d of escalations) {
      const action = recommendedAction(d, baseUrl);
      html += `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee"><strong>${d.code}</strong></td>`;
      html += `<td style="padding:6px 8px;border-bottom:1px solid #eee">${d.detail}</td>`;
      html += `<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;color:#555">${action}</td></tr>`;
    }
    html += `</tbody></table>`;
  }

  html += `<p style="margin-top:20px;font-size:11px;color:#777">Auto-heal runs daily at 06:00 UTC. Paper trail in <code>auto_heal_runs</code> table. Suppress this email by reverting <code>vercel.json</code>'s cron entry for <code>/api/auto-heal</code>.</p>`;
  html += `</div></div>`;
  return { subject, html };
}

function recommendedAction(d: Detection, baseUrl: string): string {
  switch (d.code) {
    case "anthropic_dead":
      return "Set <code>ANTHROPIC_API_KEY</code> in Vercel → Production env vars (Sensitive), then redeploy.";
    case "body_fetch_drop":
      return "Run <code>bun test tests/body-extract.test.ts</code>. Consider rotating User-Agent in <code>lib/body-fetch.ts</code>.";
    case "url_decode_drop":
      return "Google rotated their decoder. Run <code>bun test tests/decoder.test.ts</code>. Check <code>lib/google-news-decoder.ts</code>.";
    case "digest_missing":
      return `Resend collision. Try: <code>curl -X POST "${baseUrl}/api/daily-scan?backfill=1&amp;days=1" -H "Authorization: Bearer $CRON_SECRET"</code>`;
    case "review_overdue":
      return "Open the daily digest email — approve/dismiss links at the top.";
    default:
      return "See <code>auto_heal_runs</code> table for context.";
  }
}

// ── Top-level orchestrator ──

export interface AutoHealOptions {
  cronSecret: string;
  baseUrl: string;
  /** Default true. Set to false to disable side effects (used in tests). */
  allowBackfill?: boolean;
  /** Default true. Set to false to suppress escalation email (used in tests). */
  sendEmail?: boolean;
  /** Pass-through Resend send function. Allows test mocking. */
  emailFn?: (args: { subject: string; html: string; idempotencyKey: string }) => Promise<{ status: string }>;
}

export async function runAutoHeal(sb: SupabaseClient, opts: AutoHealOptions): Promise<AutoHealResult> {
  const startedAt = Date.now();
  const log: string[] = [];

  const detected = await runDetection(sb);
  log.push(`detected ${detected.length} issue(s)`);

  const { fixed, backfillTriggered } = await runFixes(sb, detected, {
    cronSecret: opts.cronSecret,
    baseUrl: opts.baseUrl,
    allowBackfill: opts.allowBackfill !== false,
  });
  if (backfillTriggered) log.push("triggered backfill");
  log.push(`fixes attempted: ${fixed.length} (${fixed.filter(f => f.success).length} succeeded)`);

  // Anything detected but NOT successfully fixed becomes an escalation candidate.
  // Plus all severity='escalation' detections (which are never auto-fixed by design).
  const fixedCodes = new Set(fixed.filter(f => f.success).map(f => f.code));
  const escalated: Detection[] = detected.filter(d =>
    d.severity === "escalation" || (d.severity === "fixable" && !fixedCodes.has(d.code))
  );

  // Send the consolidated email if anything happened. Idempotency-keyed
  // on YYYY-MM-DD so multiple auto-heal invocations on the same day
  // collapse into a single inbox item.
  let emailSent = false;
  if (opts.sendEmail !== false && (fixed.length > 0 || escalated.length > 0)) {
    const { subject, html } = buildEscalationEmail(detected, fixed, opts.baseUrl);
    const today = new Date().toISOString().slice(0, 10);
    try {
      const result = await opts.emailFn?.({
        subject,
        html,
        idempotencyKey: `auto-heal-summary|${today}`,
      });
      emailSent = result?.status === "sent";
      log.push(`escalation email: ${result?.status || "no emailFn provided"}`);
    } catch (err: any) {
      log.push(`escalation email failed: ${err?.message || err}`);
    }
  } else {
    log.push("no email sent (nothing to report)");
  }

  return {
    detected,
    fixed,
    escalated,
    log,
    duration_ms: Date.now() - startedAt,
    email_sent: emailSent,
  };
}
