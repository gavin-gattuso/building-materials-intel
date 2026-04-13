/**
 * Centralized transactional email client (Resend).
 *
 * Every outbound email in this codebase goes through sendEmail(). Features:
 *   - Retry with exponential backoff on 5xx / 429 (3 attempts: 500ms, 2s, 8s)
 *   - Tag per email type for Resend dashboard filtering
 *   - Environment gating: Preview / Development don't actually send unless
 *     RESEND_FORCE_SEND=true (log-only, still recorded in email_send_log)
 *   - Text alternative auto-derived from HTML when not supplied
 *   - Idempotency key passed through to Resend
 *   - Persistent audit row in email_send_log for every attempt
 *   - Retry-exhausted failures escalate to console.error for log drains
 *
 * Internal-only mailer: no bounce handling, no suppression list, no rate cap.
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Jarvis AI <onboarding@resend.dev>";
const DEFAULT_RECIPIENT = "gavin.gattuso@appliedvalue.com";

const RETRY_DELAYS_MS = [500, 2000, 8000];

export type EmailType =
  | "digest"
  | "alert-zero-articles"
  | "alert-stale-queue"
  | "alert-numeric-correction"
  | "briefing-passthrough"
  | "smoke-test";

export type SendStatus = "sent" | "failed" | "skipped_env" | "skipped_no_key";

export interface SendEmailArgs {
  type: EmailType;
  subject: string;
  html: string;
  text?: string;
  to?: string;
  /** Stable key for deduping dual-fire events (e.g. daily digest for a given date). */
  idempotencyKey?: string;
}

export interface SendEmailResult {
  status: SendStatus;
  resendId?: string;
  attempts: number;
  error?: string;
}

/** Derive a plain-text alternative from HTML when the caller didn't provide one. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li>/gi, "  • ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Build a deterministic idempotency key for a logical event. */
export function idempotencyKey(type: EmailType, ...parts: string[]): string {
  const raw = [type, ...parts].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/** Detect current deploy environment. Vercel sets VERCEL_ENV to production/preview/development. */
function currentEnv(): string {
  return (process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown").toLowerCase();
}

function shouldActuallySend(): boolean {
  const env = currentEnv();
  if (env === "production") return true;
  return (process.env.RESEND_FORCE_SEND || "").toLowerCase() === "true";
}

async function logAttempt(
  type: EmailType,
  recipient: string,
  subject: string,
  status: SendStatus,
  resendId: string | undefined,
  error: string | undefined,
  idempotencyKeyVal: string | undefined,
  attempts: number
): Promise<void> {
  if (!SUPABASE_KEY) return; // local dev without Supabase creds — silently skip the log row
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    await sb.from("email_send_log").insert({
      type,
      recipient,
      subject,
      status,
      resend_id: resendId || null,
      error: error || null,
      idempotency_key: idempotencyKeyVal || null,
      attempts,
      env: currentEnv(),
    });
  } catch (err: any) {
    // Never let audit-log failure break the caller.
    console.warn(`[email] audit log insert failed: ${err?.message || err}`);
  }
}

async function postOnce(
  payload: Record<string, unknown>,
  idempotencyKeyVal: string | undefined
): Promise<{ ok: boolean; status: number; body: any }> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKeyVal) headers["Idempotency-Key"] = idempotencyKeyVal;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

/**
 * Send an email. Never throws — always returns a SendEmailResult.
 * Use the result's .status field in caller logic; the audit row is written
 * regardless of outcome.
 */
export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const to = args.to || DEFAULT_RECIPIENT;
  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;

  // Skip 1: no API key configured
  if (!process.env.RESEND_API_KEY) {
    const err = "RESEND_API_KEY not set";
    console.warn(`[email:${args.type}] ${err} — not sending`);
    await logAttempt(args.type, to, args.subject, "skipped_no_key", undefined, err, args.idempotencyKey, 0);
    return { status: "skipped_no_key", attempts: 0, error: err };
  }

  // Skip 2: Preview / Development without force flag
  if (!shouldActuallySend()) {
    const env = currentEnv();
    console.log(`[email:${args.type}] env=${env} — logging only, not sending (set RESEND_FORCE_SEND=true to override)`);
    await logAttempt(args.type, to, args.subject, "skipped_env", undefined, `env=${env}`, args.idempotencyKey, 0);
    return { status: "skipped_env", attempts: 0 };
  }

  const text = args.text || htmlToText(args.html);
  const payload: Record<string, unknown> = {
    from,
    to: [to],
    subject: args.subject,
    html: args.html,
    text,
    tags: [{ name: "type", value: args.type }, { name: "env", value: currentEnv() }],
  };

  let lastErr = "";
  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      const { ok, status, body } = await postOnce(payload, args.idempotencyKey);
      if (ok) {
        const resendId = body?.id;
        await logAttempt(args.type, to, args.subject, "sent", resendId, undefined, args.idempotencyKey, attempt);
        return { status: "sent", resendId, attempts: attempt };
      }
      // Retry on 5xx and 429; give up immediately on 4xx (auth, validation, etc.)
      const shouldRetry = status >= 500 || status === 429;
      lastErr = `HTTP ${status}: ${JSON.stringify(body).slice(0, 300)}`;
      if (!shouldRetry || attempt > RETRY_DELAYS_MS.length) break;
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    } catch (err: any) {
      lastErr = `network error: ${err?.message || err}`;
      if (attempt > RETRY_DELAYS_MS.length) break;
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    }
  }

  // Retry exhausted — escalate for log drains
  console.error(`[email:${args.type}] FAILED after retries: ${lastErr}`);
  await logAttempt(args.type, to, args.subject, "failed", undefined, lastErr, args.idempotencyKey, RETRY_DELAYS_MS.length + 1);
  return { status: "failed", attempts: RETRY_DELAYS_MS.length + 1, error: lastErr };
}
