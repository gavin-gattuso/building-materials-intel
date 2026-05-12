/**
 * Tests for lib/auth.ts.
 *
 * Why these tests exist: the original validKeys arrays had a literal "cron"
 * string that let anyone with the URL pattern force-approve review-queue
 * items. RELIABILITY-AUDIT risk #1. The replacement is HMAC-signed action
 * tokens + Vercel-cron-header recognition + Bearer fallback. These tests
 * pin the contract so a future refactor can't quietly re-open the hole.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  signActionToken,
  verifyActionToken,
  isAuthorizedCronOrPrivileged,
} from "../lib/auth";

const ORIGINAL_ENV = { ...process.env };

function reqWith(headers: Record<string, string> = {}, query: Record<string, string> = {}): any {
  return { headers, query };
}

beforeEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.BRIEFING_API_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("signActionToken / verifyActionToken", () => {
  test("sign+verify roundtrip succeeds", () => {
    process.env.CRON_SECRET = "test-secret";
    const id = "abcdef01-2345-6789-abcd-ef0123456789";
    const token = signActionToken(id, "approved");
    expect(verifyActionToken(id, "approved", token)).toBe(true);
  });

  test("tampered id is rejected (HMAC pins (id, action))", () => {
    process.env.CRON_SECRET = "test-secret";
    const a = signActionToken("id-a", "approved");
    expect(verifyActionToken("id-b", "approved", a)).toBe(false);
  });

  test("tampered action is rejected", () => {
    process.env.CRON_SECRET = "test-secret";
    const a = signActionToken("id-a", "approved");
    expect(verifyActionToken("id-a", "dismissed", a)).toBe(false);
  });

  test("token from a different CRON_SECRET is rejected", () => {
    process.env.CRON_SECRET = "secret-a";
    const a = signActionToken("id-a", "approved");
    process.env.CRON_SECRET = "secret-b";
    expect(verifyActionToken("id-a", "approved", a)).toBe(false);
  });

  test("missing CRON_SECRET fails closed (placeholder is unverifiable)", () => {
    delete process.env.CRON_SECRET;
    const t = signActionToken("id", "approved");
    expect(t).toBe("no-secret");
    expect(verifyActionToken("id", "approved", "no-secret")).toBe(false);
  });

  test("empty token is rejected", () => {
    process.env.CRON_SECRET = "test-secret";
    expect(verifyActionToken("id", "approved", "")).toBe(false);
  });

  test("truncated token (only first half) is rejected", () => {
    process.env.CRON_SECRET = "test-secret";
    const full = signActionToken("id-a", "approved");
    expect(verifyActionToken("id-a", "approved", full.slice(0, 10))).toBe(false);
  });
});

describe("isAuthorizedCronOrPrivileged — accept paths", () => {
  test("x-vercel-cron header alone is accepted", () => {
    const req = reqWith({ "x-vercel-cron": "1" });
    expect(isAuthorizedCronOrPrivileged(req)).toBe(true);
  });

  test("Authorization: Bearer <CRON_SECRET> is accepted", () => {
    process.env.CRON_SECRET = "prod-secret";
    const req = reqWith({ authorization: "Bearer prod-secret" });
    expect(isAuthorizedCronOrPrivileged(req)).toBe(true);
  });

  test("?key=<CRON_SECRET> via query is accepted", () => {
    process.env.CRON_SECRET = "prod-secret";
    const req = reqWith({}, { key: "prod-secret" });
    expect(isAuthorizedCronOrPrivileged(req)).toBe(true);
  });

  test("x-scan-key header matching CRON_SECRET is accepted", () => {
    process.env.CRON_SECRET = "prod-secret";
    const req = reqWith({ "x-scan-key": "prod-secret" });
    expect(isAuthorizedCronOrPrivileged(req)).toBe(true);
  });

  test("x-scan-key matching BRIEFING_API_KEY is accepted (legacy)", () => {
    process.env.BRIEFING_API_KEY = "briefing-key";
    const req = reqWith({ "x-scan-key": "briefing-key" });
    expect(isAuthorizedCronOrPrivileged(req)).toBe(true);
  });
});

describe("isAuthorizedCronOrPrivileged — reject paths", () => {
  test("no headers / no env vars set: reject", () => {
    const req = reqWith();
    expect(isAuthorizedCronOrPrivileged(req)).toBe(false);
  });

  test("legacy literal 'cron' as key is rejected (audit P0)", () => {
    process.env.CRON_SECRET = "prod-secret";
    const req = reqWith({}, { key: "cron" });
    expect(isAuthorizedCronOrPrivileged(req)).toBe(false);
  });

  test("Bearer header with wrong token is rejected", () => {
    process.env.CRON_SECRET = "prod-secret";
    const req = reqWith({ authorization: "Bearer wrong" });
    expect(isAuthorizedCronOrPrivileged(req)).toBe(false);
  });

  test("x-vercel-cron with non-'1' value is rejected", () => {
    const req = reqWith({ "x-vercel-cron": "true" });
    expect(isAuthorizedCronOrPrivileged(req)).toBe(false);
  });

  test("empty key string is rejected", () => {
    process.env.CRON_SECRET = "prod-secret";
    const req = reqWith({}, { key: "" });
    expect(isAuthorizedCronOrPrivileged(req)).toBe(false);
  });

  test("whitespace-only key is rejected", () => {
    process.env.CRON_SECRET = "prod-secret";
    const req = reqWith({ "x-scan-key": "   " });
    expect(isAuthorizedCronOrPrivileged(req)).toBe(false);
  });
});
