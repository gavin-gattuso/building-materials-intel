/**
 * /api/diag-env — temporary env-var diagnostic.
 *
 * Reports whether expected env vars are present in the running Vercel function,
 * plus length and a short prefix/suffix to identify key TYPE without leaking
 * the secret. Also scans the full env for any keys containing "ANTHROPIC" or
 * "CLAUDE" to catch naming typos like "ANTROPHIC_API_KEY" or "CLAUDE_KEY".
 *
 * Created 2026-05-15 because production telemetry reported
 *   "Anthropic: 0/40 (0%) ok — noKey=40 — last_err: ANTHROPIC_API_KEY env var is not set"
 * despite Gavin saying the key had been added to Vercel several times. We need
 * to see what Vercel is actually exposing to functions to diagnose.
 *
 * DELETE THIS FILE after diagnosis is complete (track in audit todo).
 *
 * Auth: same as cron endpoints. Never returns key values, only presence/shape
 * fingerprints — but auth-gated as defense in depth.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAuthorizedCronOrPrivileged } from "../lib/auth.js";

interface EnvInsight {
  name: string;
  present: boolean;
  length: number;
  prefix?: string;
  suffix?: string;
  trimmed_length?: number;
  has_trailing_whitespace?: boolean;
}

function inspect(name: string, opts: { showShape?: boolean } = {}): EnvInsight {
  const raw = process.env[name];
  if (raw === undefined) return { name, present: false, length: 0 };
  const trimmed = raw.trim();
  const hasWhitespace = raw !== trimmed;
  const insight: EnvInsight = {
    name,
    present: true,
    length: raw.length,
    trimmed_length: trimmed.length,
    has_trailing_whitespace: hasWhitespace,
  };
  if (opts.showShape && trimmed.length >= 6) {
    insight.prefix = trimmed.slice(0, 4);
    insight.suffix = trimmed.slice(-2);
  }
  return insight;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorizedCronOrPrivileged(req)) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  // Expected keys grouped by sensitivity. shape=true reveals prefix/suffix
  // (useful to identify key type, e.g. sk-a... = Anthropic). shape=false only
  // reveals presence + length (used for high-sensitivity secrets like CRON).
  const expected: Array<{ name: string; showShape: boolean }> = [
    // Anthropic — focus of this diagnostic
    { name: "ANTHROPIC_API_KEY", showShape: true },
    // Common typo variants that may have been added by mistake
    { name: "ANTHROPIC_KEY", showShape: true },
    { name: "CLAUDE_API_KEY", showShape: true },
    { name: "ANTROPHIC_API_KEY", showShape: true },
    // Model + prompt versions (text, not secret)
    { name: "MODEL_EXTRACTION", showShape: true },
    { name: "MODEL_SUMMARY_STANDARD", showShape: true },
    { name: "MODEL_SUMMARY_EARNINGS", showShape: true },
    // Auth secrets — presence + length only
    { name: "CRON_SECRET", showShape: false },
    { name: "BRIEFING_API_KEY", showShape: false },
    // Supabase
    { name: "SUPABASE_URL", showShape: true },
    { name: "SUPABASE_SERVICE_ROLE_KEY", showShape: false },
    { name: "SUPABASE_ANON_KEY", showShape: false },
    // Email + financial data
    { name: "RESEND_API_KEY", showShape: false },
    { name: "CAPIQ_API_KEY", showShape: false },
    { name: "CAPIQ_API_SECRET", showShape: false },
    { name: "CAPIQ_BASE_URL", showShape: true },
    // Caps
    { name: "ANTHROPIC_DAILY_CAP", showShape: true },
  ];

  const insights = expected.map(e => inspect(e.name, { showShape: e.showShape }));

  // Catch typos: any env var name containing ANTHROPIC, CLAUDE, or matching
  // common typo roots. Returns only the names, no values.
  const wildcardMatches = Object.keys(process.env)
    .filter(k => /anthropic|claude|antroph|claud_|anthr/i.test(k))
    .sort();

  // Vercel-injected metadata so we know which environment this is.
  const vercelContext = {
    VERCEL: process.env.VERCEL || null,
    VERCEL_ENV: process.env.VERCEL_ENV || null,
    VERCEL_REGION: process.env.VERCEL_REGION || null,
    VERCEL_GIT_COMMIT_SHA: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || null,
  };

  return res.json({
    checked_at: new Date().toISOString(),
    vercel: vercelContext,
    expected: insights,
    wildcard_anthropic_or_claude_matches: wildcardMatches,
    total_env_keys: Object.keys(process.env).length,
  });
}
