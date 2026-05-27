/**
 * Tests for the auto-heal cron logic. Run: bun test tests/auto-heal.test.ts
 *
 * Detection routines are pure functions of Supabase query results — we mock
 * the Supabase client with a thin shim that returns canned data per
 * (table, filters) pair so each scenario stays self-contained.
 *
 * Fix routines (release stuck locks, trigger backfill) are tested with
 * allowBackfill=false / sendEmail=false so no external side effects fire.
 */
import { describe, test, expect } from "bun:test";
import {
  runDetection,
  runFixes,
  runAutoHeal,
  buildEscalationEmail,
  type Detection,
} from "../lib/auto-heal";

// ── Mock Supabase ──
//
// Each scenario assembles a query-tree object keyed by table name. The mock
// builder chains the typical from().select().eq()....limit() / .lt() / .gte()
// patterns and finally resolves with the stub data for that table.

type Stub = { data?: any[] | null; error?: any; count?: number };
type TableStubs = Record<string, Stub | (() => Stub)>;

function makeMockClient(stubs: TableStubs): any {
  function chain(stub: Stub): any {
    const handler = {
      get(_: any, prop: string) {
        // Terminal: thenable so `await` returns the stub
        if (prop === "then") {
          return (resolve: any) => resolve({ data: stub.data ?? null, error: stub.error ?? null, count: stub.count });
        }
        // Chain methods (select, eq, lt, gte, in, order, limit, etc) all return the same chain
        return (..._args: any[]) => chain(stub);
      },
    };
    return new Proxy(() => {}, handler);
  }
  return {
    from(table: string) {
      const stub = stubs[table];
      const resolved = typeof stub === "function" ? stub() : (stub || { data: [], error: null });
      return chain(resolved);
    },
  };
}

const oneHourAgo = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
const twoDaysAgo = () => new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
const twoMinAgo = () => new Date(Date.now() - 2 * 60 * 1000).toISOString();
const oneHourAgoFloor = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

// ── Detection tests ──

describe("auto-heal detection", () => {
  test("no_recent_run: fires when latest scheduled run is >28h old", async () => {
    const oldRun = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    const sb = makeMockClient({
      pipeline_runs: { data: [{ started_at: oldRun, run_date: "2026-05-25" }] },
      daily_run_lock: { data: [] },
      articles: { data: [{ date: "2026-05-27", created_at: oneHourAgo() }] },
      email_send_log: { data: [{ status: "sent" }] },
      human_review_queue: { data: [] },
    });
    const detections = await runDetection(sb);
    const d = detections.find(x => x.code === "no_recent_run");
    expect(d).toBeDefined();
    expect(d!.severity).toBe("fixable");
    expect(d!.detail).toContain("30.0h ago");
  });

  test("no_recent_run: does NOT fire when latest scheduled run is fresh", async () => {
    const sb = makeMockClient({
      pipeline_runs: { data: [{ started_at: oneHourAgo(), run_date: "2026-05-27" }] },
      daily_run_lock: { data: [] },
      articles: { data: [{ date: "2026-05-27", created_at: oneHourAgo() }] },
      email_send_log: { data: [{ status: "sent" }] },
      human_review_queue: { data: [] },
    });
    const detections = await runDetection(sb);
    expect(detections.find(x => x.code === "no_recent_run")).toBeUndefined();
  });

  test("stuck_lock: fires when daily_run_lock has in_progress row >30 min old", async () => {
    const sb = makeMockClient({
      pipeline_runs: { data: [{ started_at: oneHourAgo(), run_date: "2026-05-27" }] },
      daily_run_lock: { data: [{ run_date: "2026-05-27", started_at: oneHourAgo() }] },
      articles: { data: [{ date: "2026-05-27", created_at: oneHourAgo() }] },
      email_send_log: { data: [{ status: "sent" }] },
      human_review_queue: { data: [] },
    });
    const detections = await runDetection(sb);
    const d = detections.find(x => x.code === "stuck_lock");
    expect(d).toBeDefined();
    expect(d!.context?.stuck_dates).toEqual(["2026-05-27"]);
  });

  test("freshness_drift: fires when newest article is >48h old", async () => {
    const oldArticle = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const sb = makeMockClient({
      pipeline_runs: { data: [{ started_at: oneHourAgo(), run_date: "2026-05-27" }] },
      daily_run_lock: { data: [] },
      articles: { data: [{ date: "2026-05-24", created_at: oldArticle }] },
      email_send_log: { data: [{ status: "sent" }] },
      human_review_queue: { data: [] },
    });
    const detections = await runDetection(sb);
    const d = detections.find(x => x.code === "freshness_drift");
    expect(d).toBeDefined();
    expect(d!.context?.hours_ago).toBeGreaterThan(48);
  });

  test("anthropic_dead: fires when last 3 runs have anthropic_ok=0 with meaningful call volume", async () => {
    const sb = makeMockClient({
      pipeline_runs: {
        data: [
          { started_at: oneHourAgo(), run_date: "2026-05-27", anthropic_calls: 40, anthropic_ok: 0, anthropic_last_error: "key missing" },
          { started_at: oneHourAgo(), run_date: "2026-05-26", anthropic_calls: 30, anthropic_ok: 0 },
          { started_at: oneHourAgo(), run_date: "2026-05-25", anthropic_calls: 35, anthropic_ok: 0 },
        ],
      },
      daily_run_lock: { data: [] },
      articles: { data: [{ date: "2026-05-27", created_at: oneHourAgo() }] },
      email_send_log: { data: [{ status: "sent" }] },
      human_review_queue: { data: [] },
    });
    const detections = await runDetection(sb);
    const d = detections.find(x => x.code === "anthropic_dead");
    expect(d).toBeDefined();
    expect(d!.severity).toBe("escalation");
    expect(d!.detail).toContain("0/105");
  });

  test("all clear: no detections when everything is healthy", async () => {
    const sb = makeMockClient({
      pipeline_runs: {
        data: [
          { started_at: oneHourAgo(), run_date: "2026-05-27", candidates: 100, archived: 25, anthropic_calls: 40, anthropic_ok: 40, body_fetch_pct: 70, body_fetch_attempted: 25, url_decode_pct: 100, url_decode_attempted: 25 },
          { started_at: oneHourAgo(), run_date: "2026-05-26", candidates: 90, archived: 18, anthropic_calls: 35, anthropic_ok: 35, body_fetch_pct: 65, body_fetch_attempted: 18, url_decode_pct: 100, url_decode_attempted: 18 },
          { started_at: oneHourAgo(), run_date: "2026-05-25", candidates: 80, archived: 20, anthropic_calls: 30, anthropic_ok: 30, body_fetch_pct: 68, body_fetch_attempted: 20, url_decode_pct: 100, url_decode_attempted: 20 },
        ],
      },
      daily_run_lock: { data: [] },
      articles: { data: [{ date: "2026-05-27", created_at: oneHourAgo() }] },
      email_send_log: { data: [{ status: "sent" }] },
      human_review_queue: { data: [] },
    });
    const detections = await runDetection(sb);
    expect(detections.length).toBe(0);
  });
});

// ── Fix orchestration tests ──

describe("auto-heal fix orchestration", () => {
  test("no_recent_run triggers backfill request via the fetch path (mocked off)", async () => {
    const sb = makeMockClient({ daily_run_lock: { data: [] } });
    const detections: Detection[] = [{
      code: "no_recent_run",
      severity: "fixable",
      detail: "stale",
      context: { suggested_days_window: 2 },
    }];
    // allowBackfill=false → fix routine records that it WOULD have triggered
    const { fixed, backfillTriggered } = await runFixes(sb, detections, {
      cronSecret: "test-secret",
      baseUrl: "http://test.invalid",
      allowBackfill: false,
    });
    expect(backfillTriggered).toBe(false);
    expect(fixed.length).toBe(1);
    expect(fixed[0].action).toContain("SKIPPED");
    expect(fixed[0].success).toBe(false);
  });

  test("multiple backfill-wanting detections trigger only ONE backfill", async () => {
    const sb = makeMockClient({ daily_run_lock: { data: [] } });
    const detections: Detection[] = [
      { code: "no_recent_run", severity: "fixable", detail: "stale" },
      { code: "freshness_drift", severity: "fixable", detail: "old", context: { suggested_days_window: 5 } },
      { code: "zero_archive_with_candidates", severity: "fixable", detail: "zero" },
    ];
    const { fixed, backfillTriggered } = await runFixes(sb, detections, {
      cronSecret: "test-secret",
      baseUrl: "http://test.invalid",
      allowBackfill: false, // gate the side effect; we just want to verify count
    });
    expect(backfillTriggered).toBe(false);
    // All 3 detections get a "fix attempted" record but only one logical backfill action
    expect(fixed.length).toBe(3);
    const uniqueActions = new Set(fixed.map(f => f.action));
    // All three should share the same "SKIPPED" message text — proves we tried to coalesce
    expect(uniqueActions.size).toBe(1);
  });
});

// ── Escalation email rendering tests ──

describe("auto-heal escalation email", () => {
  test("subject reflects healed + needs-you counts", () => {
    const detections: Detection[] = [
      { code: "anthropic_dead", severity: "escalation", detail: "key missing" },
      { code: "stuck_lock", severity: "fixable", detail: "stuck" },
    ];
    const fixes = [
      { code: "stuck_lock" as const, action: "release_locks", success: true },
    ];
    const { subject, html } = buildEscalationEmail(detections, fixes, "http://test.invalid");
    expect(subject).toContain("1 healed");
    expect(subject).toContain("1 need you");
    expect(html).toContain("ANTHROPIC_API_KEY");
    expect(html).toContain("release_locks");
  });

  test("all clear email when nothing detected and nothing fixed", () => {
    const { subject, html } = buildEscalationEmail([], [], "http://test.invalid");
    expect(subject).toContain("all clear");
    expect(html).toContain("All clear");
  });
});

// ── End-to-end orchestrator test ──

describe("auto-heal orchestrator", () => {
  test("runAutoHeal returns full result shape and respects sendEmail=false", async () => {
    const oldRun = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    const sb = makeMockClient({
      pipeline_runs: { data: [{ started_at: oldRun, run_date: "2026-05-25" }] },
      daily_run_lock: { data: [] },
      articles: { data: [{ date: "2026-05-27", created_at: oneHourAgo() }] },
      email_send_log: { data: [{ status: "sent" }] },
      human_review_queue: { data: [] },
    });
    const result = await runAutoHeal(sb, {
      cronSecret: "test-secret",
      baseUrl: "http://test.invalid",
      allowBackfill: false,
      sendEmail: false,
    });
    expect(result.detected.find(d => d.code === "no_recent_run")).toBeDefined();
    expect(result.email_sent).toBe(false);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.log)).toBe(true);
  });
});
