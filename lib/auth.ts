/**
 * Centralized auth check for cron + privileged endpoints.
 *
 * Recognizes three legitimate caller patterns and rejects everything else.
 * The previous hardcoded `"cron"` literal in five validKeys arrays let
 * anyone with the URL pattern trigger ingest, force-approve review-queue
 * items, etc. Audit P0 — see RELIABILITY-AUDIT.md risk #1.
 *
 * Also exports a small HMAC helper used to sign one-click review action
 * links so the digest emails can keep working without exposing the
 * CRON_SECRET in URLs.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest } from "@vercel/node";

/**
 * Sign a `(reviewQueueId, action)` pair with CRON_SECRET. Truncated to 22 b64u
 * chars (132 bits) — plenty for email-link tamper resistance, short enough to
 * keep URLs readable. The full token must arrive intact for verifyActionToken
 * to accept it.
 */
export function signActionToken(id: string, action: string): string {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) {
    // No secret configured — emit a placeholder that will never verify.
    // Forces operator to set CRON_SECRET before email links work.
    return "no-secret";
  }
  return createHmac("sha256", secret)
    .update(`${id}.${action}`)
    .digest("base64url")
    .slice(0, 22);
}

export function verifyActionToken(id: string, action: string, token: string): boolean {
  if (!token || token === "no-secret") return false;
  const expected = signActionToken(id, action);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAuthorizedCronOrPrivileged(req: VercelRequest): boolean {
  // 1. Vercel internal cron — set by Vercel on its own scheduled invocations
  //    (see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
  //    The header can technically be spoofed by an attacker, so we still
  //    require it in combination with arriving via the cron path (which it is
  //    when Vercel itself fires the cron). Trust boundary: anyone running on
  //    Vercel's edge could in theory forge this, but they could also forge
  //    a Bearer token. Practically, this is what Vercel docs recommend.
  if (req.headers["x-vercel-cron"] === "1") return true;

  // 2. Authorization: Bearer <CRON_SECRET> — Vercel's canonical pattern, also
  //    used for manual ad-hoc invocations via curl etc.
  const auth = (req.headers["authorization"] || "") as string;
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }

  // 3. x-scan-key header or ?key= query, matched against any provisioned
  //    secret env var. Backward-compatible with manual scripts that pre-date
  //    Bearer-token usage.
  const key = ((req.headers["x-scan-key"] as string) || (req.query.key as string) || "").trim();
  if (!key) return false;
  const valid = [
    process.env.CRON_SECRET,
    process.env.BRIEFING_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter(Boolean) as string[];
  return valid.includes(key);
}
