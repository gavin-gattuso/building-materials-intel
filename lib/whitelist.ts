/**
 * Source whitelist helpers — extracted from api/daily-scan.ts so they're
 * unit-testable in isolation. Pure functions only; no I/O. The whitelist
 * itself is loaded eagerly from config/source-whitelist.json.
 *
 * Used by daily-scan to decide which RSS candidates survive past the cheap
 * "is this domain on the approved list" filter before the more expensive
 * URL resolution / body fetch / extraction work happens.
 */
import { createRequire } from "node:module";

const requireCfg = createRequire(import.meta.url);
const whitelistConfig = requireCfg("../config/source-whitelist.json") as {
  domains: Array<{ domain: string; tier: number; company?: string; note?: string }>;
};

export const APPROVED_DOMAINS = new Set<string>(whitelistConfig.domains.map(d => d.domain));
export const TIER_BY_DOMAIN = new Map<string, number>(whitelistConfig.domains.map(d => [d.domain, d.tier]));

/**
 * Does this URL come from an approved publisher? Matches exact hostname or
 * any subdomain. Strips a leading `www.` to keep config simple. Returns
 * false (not throws) for malformed URLs — the caller logs a rejection and
 * moves on.
 */
export function isApprovedSource(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    for (const d of APPROVED_DOMAINS) {
      if (hostname === d || hostname.endsWith("." + d)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * The publisher hostname used for rejection logging and per-source dedup.
 * Returns the literal string "unknown" (not throws / not empty) for malformed
 * URLs so downstream code never has to nil-check.
 */
export function getSourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

/**
 * The tier (1–8) of the matched whitelist entry, or 3 as a neutral default
 * for unmatched hosts (which should never happen post-isApprovedSource).
 * Tiers map to source-quality classes in CLAUDE.md — Tier 1 = major news,
 * Tier 8 = construction-niche trade pubs.
 */
export function getSourceTier(url: string): number {
  const domain = getSourceDomain(url);
  for (const [d, tier] of TIER_BY_DOMAIN) {
    if (domain === d || domain.endsWith("." + d)) return tier;
  }
  return 3;
}
