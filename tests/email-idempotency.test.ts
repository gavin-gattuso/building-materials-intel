/**
 * Tests for lib/email.ts:idempotencyKey().
 *
 * Why these tests exist: email-send-log idempotency is what stops the
 * digest, zero-article alert, and stale-queue alert from double-sending if a
 * function retries. The key is SHA-256 of (type, ...parts) truncated to 32
 * hex chars. A regression where the key is no longer deterministic, or
 * where two semantically different events collide, would either spam Gavin
 * or silently drop alerts.
 */
import { describe, test, expect } from "bun:test";
import { idempotencyKey } from "../lib/email";

describe("idempotencyKey", () => {
  test("same inputs produce the same key (determinism)", () => {
    const a = idempotencyKey("digest", "2026-05-12");
    const b = idempotencyKey("digest", "2026-05-12");
    expect(a).toBe(b);
  });

  test("key is exactly 32 hex chars (SHA-256 truncated)", () => {
    const k = idempotencyKey("digest", "2026-05-12");
    expect(k.length).toBe(32);
    expect(k).toMatch(/^[0-9a-f]{32}$/);
  });

  test("different event types produce different keys for the same date", () => {
    const a = idempotencyKey("digest", "2026-05-12");
    const b = idempotencyKey("alert-zero-articles", "2026-05-12");
    expect(a).not.toBe(b);
  });

  test("different dates produce different keys for the same event type", () => {
    const a = idempotencyKey("digest", "2026-05-12");
    const b = idempotencyKey("digest", "2026-05-13");
    expect(a).not.toBe(b);
  });

  test("variadic parts: order matters", () => {
    const a = idempotencyKey("alert-pipeline-degraded", "2026-05-12", "url_decode_pct");
    const b = idempotencyKey("alert-pipeline-degraded", "url_decode_pct", "2026-05-12");
    expect(a).not.toBe(b);
  });

  test("variadic parts: adding a new part changes the key", () => {
    const a = idempotencyKey("alert-stale-queue", "2026-05-12");
    const b = idempotencyKey("alert-stale-queue", "2026-05-12", "extra");
    expect(a).not.toBe(b);
  });

  test("no parts (type only) still produces a valid key", () => {
    const k = idempotencyKey("smoke-test");
    expect(k.length).toBe(32);
    expect(k).toMatch(/^[0-9a-f]{32}$/);
  });

  test("empty-string part is distinguishable from missing part", () => {
    const a = idempotencyKey("smoke-test");
    const b = idempotencyKey("smoke-test", "");
    expect(a).not.toBe(b);
  });
});
