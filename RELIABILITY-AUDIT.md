# Building Materials Newsletter — Reliability Audit

**Auditor:** Read-only review focused on what keeps the system from breaking
**Audit date:** 2026-05-12
**Reference state:** `c2fbc5e` (weekly digest fallback + Sat/Sun stale check), latest article 2026-05-12, 503 articles, 33 extractions, 16 weekly summaries
**Companion doc:** `HEALTH-AUDIT.md` (2026-05-11) covered: URL extraction, whitelist breadth, `article_extractions` empty, `raw_feed_data` null, staleness across `financial_ratios`/`market_drivers`/`weekly_summaries`, dual-trigger gap, Capital IQ never used, Anthropic silent failures. This audit does **not** re-cover those — most are addressed in commits `0775553`, `6d0384a`, `2868d94`, `2259918`, `c2fbc5e`; remaining ones are flagged STILL OPEN where relevant.

---

## Executive summary

This is a **single-person, single-region, single-tier production system** that has matured rapidly in the last 14 days (URL decoder, body fetch, Anthropic telemetry, structured-extraction always-write, weekly digest fallback, dual cron + healthcheck). It works. But it is one Supabase project away from total data loss, one Vercel plan-downgrade away from a silently dropped cron, one Anthropic billing problem away from a week of empty `article_extractions` with no alert, and one CSP/CORS misstep away from the dashboard going dark. The "alert when broken" layer is now real and observable; the "recover when broken" layer essentially does not exist. **Maturity verdict:** functional MVP with good auditability, weak resilience. To hit institutional-grade ($500K/quarter) you need: (1) automated Supabase backups + restore drill, (2) a real cron-secret rotation off the hardcoded `"cron"` string, (3) a test harness around the 4 hot paths that broke this month, and (4) freshness badges + a status page so the user never again has to read SQL to know if it's working.

---

## Top 10 reliability risks (ranked by likelihood × impact)

### 1. **[P0] Hardcoded `"cron"` auth key on five sensitive endpoints**

**Files/lines:** `api/daily-scan.ts:403`, `api/daily-scan.ts:916`, `api/daily-scan.ts:1004`, `api/index.ts:715`, `api/index.ts:796`, `api/cron-weekly-summary.ts:8`, `api/detect-corrections.ts:45`.

**What breaks:** Anyone who guesses or sees the URL pattern (`/api/daily-scan?key=cron`, `/api/review-queue/action?key=cron`, `/api/healthcheck?key=cron`) can:
- Trigger an unscheduled ingest (Anthropic + Resend cost, daily_run_lock collision)
- Approve/dismiss arbitrary review-queue items by ID (`/api/review-queue/action?id=<uuid>&action=approved&key=cron` flips `report_ready=true` on any article, see `api/index.ts:754-763`)
- Force-send the pipeline-stale alert email
- Run weekly-summary generation (overwrites `weekly_summaries` by `(week_start, week_end)`)

**Detection:** None. Resend will deliver to gavin's inbox regardless of source. No rate limit on these endpoints other than the in-memory map for AI chat.

**Fix (P0, ≤1h):** Remove the literal `"cron"` from `validKeys` arrays in all five callsites. Require `CRON_SECRET` (already an env var in Vercel) for cron paths; for review-queue email links use a short HMAC over `(id, action, expires)` signed with `CRON_SECRET`. Reissue any review-action links that were sent.

---

### 2. **[P0] Supabase is the single point of failure — no backups, no recovery plan**

**Files/lines:** All `api/*.ts` and `scripts/*.ts` depend on `pmjqymxdaiwfpfglwqux.supabase.co`. No `pg_dump`, no S3 snapshot, no point-in-time-recovery (PITR), no second-region replica.

**What breaks:** Supabase Free tier provides only 7-day rolling DB backups via their dashboard (not downloadable). Project pause after 7 days inactivity = data goes read-only. A single bad migration, a region outage, an accidental `DELETE FROM articles`, or a billing lapse erases:
- 503 articles + 33 extractions + 3,638 rejected forensic rows
- 16 weekly summaries (re-generatable from articles)
- 78 financial_ratios rows (the H1 2025 manual ones cannot be re-derived; April 9 was the last fetch)
- 82 review queue items, 44 email send log rows (audit trail for the entire system)

**Detection:** Zero. Supabase will not email about a paused project until 14 days in. The Vercel functions will throw 500s, but you'd see that as `healthcheck` going stale — by which time data may be gone.

**Fix (P0, half-day):** Either upgrade to Supabase Pro ($25/mo, gets daily backups + PITR) or wire a nightly `pg_dump`-via-Supabase-management-API into a new Vercel cron writing to a private GitHub repo or S3 bucket. Two-line script. Even better: add it as a 5th cron right next to healthcheck.

---

### 3. **[P0] Vercel Hobby tier caps at 2 crons — `vercel.json` declares 4**

**File/line:** `vercel.json:5-8` lists 4 crons.

**What breaks:** Vercel Hobby plan silently registers only the first 2 crons. The remaining 2 are accepted at deploy but never fired. Today's `daily_run_lock` shows the daily-scan ran at 04:11 UTC every day for 14 consecutive days, so #1 (`0 4 * * *`) is alive. The healthcheck @ 04:30 should also be alive. But `detect-corrections` (Mon 11:17 UTC) and `cron-weekly-summary` (Fri 22:00 UTC) — those are crons #3 and #4 in the list, and may not be firing.

**Evidence supporting concern:** `weekly_summaries` had a 5-week gap from 2026-04-12 to 2026-05-10 — the only summaries that exist after April 12 are the ones from this week, dated 2026-05-11 and 2026-05-12 (both manually backfilled, see `created_at` mismatching `week_end`). `last_verified` on Tier 1-2 articles has not refreshed since 2026-04-27 per HEALTH-AUDIT.

**Detection:** The digest-missing alert added in `c2fbc5e` catches case #4 (will fire Sat morning if Friday cron didn't run). Nothing catches case #3 (corrections) — the function silently returning "0 corrections checked" looks the same as the cron not firing.

**Fix (P0, ≤30m):** Either upgrade to Vercel Pro ($20/mo, unlimited crons) **or** consolidate. The corrections + weekly-summary jobs are once-a-week; merge them into a single `/api/cron-weekly?key=cron` Friday job that calls both internally. Document in CLAUDE.md which 2 are guaranteed-on-Hobby. Add a "cron last-run timestamp" table that each cron writes to, so you can see at a glance which actually fired in the past 14 days.

---

### 4. **[P1] `article_extractions` writes happen but every row is `confidence=0, fields_present=[]`**

**Evidence:**
```
SELECT total=33, positive_conf=0, has_fields=0, avg_conf=0.000
FROM article_extractions
```

**Files/lines:** `lib/extraction.ts:174` (`callAnthropic` for extraction prompt), `api/daily-scan.ts:644` (call) → `api/daily-scan.ts:744-757` (fallback insert).

**What's happening:** Since `6d0384a` the code always inserts a row, but it appears `extractStructuredData()` is returning `null` for every recent article — the fallback path at line 744 is the one always taken. The 33 rows all have `additional_metrics.failure_reason` set. This is the "track failure forward" improvement working, but it also means **the actual Anthropic extraction is failing 100% of the time today and we don't know why** (could be Haiku model name change, could be JSON parse failure on a body too long, could be auth — the new `anthropicTelemetry` would tell us if we logged it persistently).

**Detection:** The telemetry is logged per-run to `log` array and returned in the `/api/daily-scan` response, but **never persisted**. It's gone the moment the Vercel function exits.

**Fix (P1, ≤2h):** (a) Write `anthropicTelemetry` into a new `pipeline_runs` table at the end of each daily-scan with the full snapshot. (b) Sample 3 `article_extractions.additional_metrics.failure_reason` values today to figure out which class of failure dominates. (c) Add alert: if 5 consecutive days have `positive_conf=0` across all extractions, send a "structured extraction silently broken" alert.

---

### 5. **[P1] Body fetch success rate is 30% and there's no alert when it craters**

**Evidence:**
```
Recent 7d: total=67 articles, real_body=20 (30%), null_body=11, google_news_url=33 (49%)
```

49% of recent articles still have `news.google.com` URLs because the URL decoder didn't resolve them, and only 30% got a fetched body. `fetchArticleBody` skips Google News URLs entirely at `api/daily-scan.ts:78`.

**What breaks:** Without a body, extraction is on the title alone (back to the headline-only regression of pre-2026-05). Summary becomes generic. Company matching is shallow. Section tagging gets keyword-noise.

**Detection:** Telemetry is in the daily-scan log but not stored. The %fetched-body number is invisible without manually reading the Vercel function logs.

**Fix (P1, ≤2h):** Persist a `pipeline_runs` row per ingest with `body_fetch_pct`, `url_decode_pct`, `anthropic_ok_pct`, `articles_inserted`. Add an alert when any of those drops >25% week-over-week. This is the alarm system that would have caught the silent 3-week regression — the existing alerts only catch "0 articles inserted", not "70% degraded but still 1-2 articles".

---

### 6. **[P1] Anthropic key rotation/expiry = silent degradation**

**File/line:** `lib/extraction.ts:101-106`. If `ANTHROPIC_API_KEY` is unset or invalid, every call returns `null` and the daily-scan still completes "successfully" with `archived > 0`, `report_ready = true`, but summaries are just `articleText.slice(0,500)` (extraction.ts:270 fallback) and structured extraction never runs.

**What breaks:** Reports continue to generate but with crappy content. Email digests still send. Nothing alerts. The `anthropicTelemetry.noKey` and `http401` counters are tracked but not surfaced in any persistent alert.

**Detection:** Same as risk #4 — telemetry is per-run and ephemeral.

**Fix (P1, ≤30m):** In `/api/healthcheck`, after the daily-scan completes, check `SELECT AVG(extraction_confidence) FROM article_extractions WHERE created_at > NOW() - INTERVAL '3 days'`. If 0, email the user. Also add an env-var presence check that fires once a week. ANTHROPIC_API_KEY billing can shut off without notice if the prepay balance hits zero.

---

### 7. **[P1] `build-static.ts` is the canonical source of `weekly-summary.json` but has no error path other than `null`**

**File/line:** `site/build-static.ts:104-121`. The 5-week digest gap on the public site (mentioned in HEALTH-AUDIT) was directly caused by this file: when Supabase returned a stale row, the static JSON shipped with stale data; when Supabase returned 0 rows, the JSON shipped as literal `null` and the homepage rendered an empty box.

**Latent risk:** Same pattern exists for:
- `financial-ratios.json` (line 84-101): if Supabase call fails → empty `[]`, the Financial Ratios tab shows "Financial data is temporarily unavailable" without any indication of staleness
- `earnings-calendar.json` (line 20-60): **hardcoded in the build script**, not pulled from DB. The 2026-02-25 Home Depot earnings date and other Q1 2026 dates will become wrong as soon as you cross into Q2 — but no alert will fire because nothing checks the calendar against actual dates.

**Fix (P1, ≤1h):** Add to `build-static.ts` a final check: every JSON written must have at least one row AND the latest date must be ≤7 days old, else log an error to stderr and `process.exit(1)` to fail the Vercel build. Currently a stale build is indistinguishable from a fresh one. Also pull earnings calendar from a DB table (`earnings_calendar` exists per CLAUDE.md but is not actually used by build-static).

---

### 8. **[P1] `daily_run_lock` cannot represent a stuck `in_progress` run**

**Files/lines:** `api/daily-scan.ts:429` (INSERT with status='in_progress'), `api/daily-scan.ts:1034-1038` (UPDATE to 'complete' or 'failed' in `finally`).

**What breaks:** If the function crashes mid-execution (Vercel hard timeout, OOM, uncaught throw in the for-loop, network blip while writing the final lock update), the row stays `in_progress` forever. The next day's run will succeed because of the new `run_date` unique key. But there's no audit signal that a run was killed.

**Schema check:** `daily_run_lock` has `started_at TIMESTAMPTZ DEFAULT now()` and `status TEXT DEFAULT 'in_progress'`. Status enum is not enforced — it's just text.

**Today's state:** 0 rows stuck in `in_progress` right now (good), but it's a latent corruption surface.

**Fix (P2, ≤30m):** (a) Add a healthcheck assertion: `SELECT COUNT(*) FROM daily_run_lock WHERE status='in_progress' AND started_at < NOW() - INTERVAL '15 min'` → alert if >0. (b) Add a `CHECK` constraint on the status column to enforce the enum. (c) Move the `UPDATE to 'complete'` into a `finally` block (currently it's at line 1037, which runs only on the happy path; the `catch` at line 1042 updates to 'failed' but skips if `isBackfill`).

---

### 9. **[P2] Zero test coverage on the things that actually broke**

**Files:** `tests/pipeline.test.ts` (existing). Covers: syndication hash, extraction shape, anomaly thresholds, FX rate identity, report-validation provenance. Does **not** cover:

- URL decoder (`lib/google-news-decoder.ts`, 316 lines, 3 fallback paths, all silent on failure) — `scripts/test-google-news-decoder.ts` exists but is not in `bun test` path, runs only manually
- Whitelist matching (`isApprovedSource` at `api/daily-scan.ts:31` — the function that effectively decides every ingest)
- Body fetching + main-text extraction (`fetchArticleBody` + `extractMainText` at `api/daily-scan.ts:74-135`)
- The dedup chain (URL → title → syndication-hash — the actual `if titleMatch` logic at `api/daily-scan.ts:582`)
- Upsert-vs-update semantics on `article_companies`, `article_av_sections`, `articles` (the `onConflict` parameter — get the column list wrong and you create dupes)
- Email idempotency (the SHA-256-truncated-32-char key — no test that it actually prevents double-send)

**What breaks:** Every fix shipped in the last 14 days is one regression away. Today's Anthropic-haiku model name change, tomorrow's whitelist edit, next week's tightening of the syndication hash — each is a candidate to silently break ingest. `tests/pipeline.test.ts` won't catch any of it because the hot paths aren't tested.

**Detection:** Manual SQL queries (this audit) is the test suite right now.

**Fix (P1, 1-2 days):** Write smoke tests for the 6 paths above. Use `bun test`. Add a GitHub Actions workflow that runs `bun test` on every PR — there's currently nothing in `.github/workflows/` (verified — directory doesn't exist).

---

### 10. **[P2] No rate limit on `/api/daily-scan` or `/api/build-report` — cost runaway is one bad input away**

**Files:** `api/daily-scan.ts:402` (auth check), `api/build-report.ts:284` (CORS check, no rate limit). `api/index.ts:31-46` has a 10-req/min in-memory limiter for `/api/chat`, `/api/synthesize-section`, `/api/executive-summary`, but it resets on every cold start.

**What breaks:**
- Anyone with `key=cron` (see risk #1) can trigger `/api/daily-scan?days=14&extra=q1|q2|q3|q4|q5` → 13+ feeds × 25 items × multiple Anthropic calls per article = potentially thousands of API calls in one request. `maxDuration: 300` lets it run for 5 minutes.
- `/api/build-report` calls 5 separate Sonnet completions (drivers, categories, exec-summary, conclusion, narrative). Each uncached. If a script loops on this endpoint, that's $5-10/call. No daily cap.
- Anthropic prepay can drain in hours if abused. No per-day token budget enforcement.

**Detection:** Resend has its own monthly cap (3,000/mo on the free tier — you're at ~44 in 30 days, so fine for now). Anthropic does not.

**Fix (P2, ≤2h):** Add a daily token budget check: persistent counter (Supabase row or simple in-memory) of `anthropicTelemetry.totalCalls` per day. Refuse new requests if >5000/day. Alert when >1000/day.

---

## Silent failure inventory (file:line)

These are places where exceptions or null returns are swallowed in hot paths. Already-tracked failures (Anthropic via telemetry) are not re-listed.

| File:line | Pattern | Risk |
|---|---|---|
| `api/daily-scan.ts:35` | `catch { return false; }` in `isApprovedSource` | Malformed URL = always rejected. OK behavior, but no metric on how often. |
| `api/daily-scan.ts:40` | `catch { return "unknown"; }` in `getSourceDomain` | "unknown" appears in rejection logs without explanation. |
| `api/daily-scan.ts:98-100` | `catch { return null }` in `fetchArticleBody` | Every body-fetch failure (paywall, 4xx, timeout) is indistinguishable. Telemetry counts but does not classify. |
| `api/daily-scan.ts:307-310` | `catch { console.warn(...) }` in `logRejection` | If `rejected_articles` is broken (RLS, FK), every rejection is lost silently. |
| `api/daily-scan.ts:331-333` | `catch { console.warn(...) }` in `queueForReview` | Same — review queue inserts can fail without retry or alert. |
| `api/daily-scan.ts:484-486` | `catch { ... }` per feed fetch | One feed failure is swallowed; 8 feeds going to 0 articles each looks the same as success. |
| `api/daily-scan.ts:1029-1031` | `catch { log.push(...) }` for stale-queue alert | Stale-queue email send failure does not abort the run, doesn't escalate. |
| `api/index.ts:374` | `catch { return res.json([]) }` for financial-ratio-flags | If the query fails, the dashboard shows empty flags — not an error. |
| `api/index.ts:588-590` | `catch { return text-as-content }` in synthesize-section | If JSON parse fails, the API returns the raw Claude output as content; report builder gets bad data. |
| `api/index.ts:853` | `catch { /* non-fatal */ }` for pipeline-stale email | If Resend is down, we never know. |
| `api/index.ts:903` | `catch { /* non-fatal */ }` for digest-missing email | Same. The digest-missing alert is itself silently failable. |
| `api/build-report.ts:97, 166, 272` | `catch { return fallbackX(...) }` | AI synthesis failure during report build = fallback (deterministic, low-quality) content with no warning to the user. The report still downloads as a "successful" .docx. |
| `lib/extraction.ts:228-230, 301-303` | `catch { return null }` after JSON.parse | Malformed Claude JSON response = silent extraction failure. The telemetry counters at line 145 catch fetch errors but not parse errors. (`anthropicTelemetry.parseError` field exists at line 81 but is never incremented — defined but dead.) |
| `lib/email.ts:119-122` | `catch { console.warn(...) }` for audit log insert | If `email_send_log` insert fails, the email send is still claimed as successful with no audit row. |
| `lib/google-news-decoder.ts:52, 62, 80, 153, 182, 233, 237, 257, 311` | Eight `catch {}` blocks, all silent | Every method fails closed. We track final method (`base64`/`batchexecute`/`redirect-follow`/`failed`) per call, but not intermediate diagnostics. Hard to debug when decode rate drops. |
| `api/detect-corrections.ts:129-131` | `catch { /* skip */ }` per article | A run can check 0 articles successfully and report `corrections=0` indistinguishably from "every article 404'd". |
| `scripts/generate-weekly-summary.ts:140-143, 146-149` | `catch { ... }` around JSON parse, Anthropic call | Failures fall through to deterministic fallback — which is intended (good!) but the user sees no signal that AI synthesis failed today. |
| `site/build-static.ts:76-79, 94-97, 115-118` | `catch` → empty JSON | If Supabase is unreachable during build, the deployed site has empty data with no build-time error. |

**Dead code:** `anthropicTelemetry.parseError` is declared but never written. `parseError` should be incremented at `lib/extraction.ts:228` and `:301`.

---

## Quick wins (≤30 minutes each)

1. **Remove `"cron"` from `validKeys` arrays.** 5 callsites, 5 minutes. Replaces it with `process.env.CRON_SECRET` only. Trade-off: existing review-action email links break; reissue them after.

2. **Add a `CHECK` constraint on `daily_run_lock.status`.** One DDL: `ALTER TABLE daily_run_lock ADD CONSTRAINT status_enum CHECK (status IN ('in_progress','complete','failed'))`.

3. **Increment `anthropicTelemetry.parseError`.** `lib/extraction.ts:228, 301` — add `anthropicTelemetry.parseError++` before `return null`. The field already exists and is reported in the daily-scan summary.

4. **Wire a `pipeline_runs` table.** New table with columns `(run_date, articles_attempted, articles_inserted, body_fetch_pct, url_decode_pct, anthropic_ok_pct, anthropic_calls, last_error)`. Insert at the end of `/api/daily-scan`. Read it in `/api/healthcheck` to compute trend. 15 minutes to write, 5 to deploy.

5. **Fail the build if `weekly-summary.json` is null or `financial-ratios.json` is empty.** Add an `if (!latest || ratios.length < 30) process.exit(1)` to `site/build-static.ts`. Today's deploy passes silently on stale data; this catches it at build time.

6. **Move `earnings_calendar` from hardcoded list to DB query** in `site/build-static.ts:20`. The DB table already exists (`earnings_calendar` is in `mcp__supabase__list_tables` output of HEALTH-AUDIT). Quick win because the hardcoded dates will be wrong starting Q2 2026.

7. **Fix the 1 stuck `in_progress` lock detection.** Add to healthcheck:
```sql
SELECT * FROM daily_run_lock WHERE status='in_progress' AND started_at < NOW() - INTERVAL '15 min'
```
   Fires an alert if found. 20 minutes including the email template.

8. **Add a unique index on `email_send_log.idempotency_key`.** Today it's just a regular index (`email_send_log_idempotency_idx`). If a function retries a send, the idempotency key prevents duplicate Resend submission but doesn't prevent duplicate log rows. One DDL. Use `WHERE idempotency_key IS NOT NULL` partial unique to allow nulls.

9. **Add `npm audit` to the build.** Currently the build runs `lint-prompts` and `check-api-imports` (good), but nothing checks for dep CVEs. `npm audit --audit-level=high` as an extra step. The 6 production deps are reasonably current (`@anthropic-ai/sdk ^0.82.0`, `resend ^6.10.0`, `@supabase/supabase-js ^2`, `docx ^9.6.1`, `yahoo-finance2 ^3.14.0`, `@vercel/node ^3`), but `gray-matter ^4.0.3` is unchanged since 2022.

10. **Document the dual-trigger gap in CLAUDE.md.** Already partly done (CLAUDE.md mentions the Anthropic trigger isn't verified). Add a check command: `claude scheduled list` output, or just delete the trigger if it's not active. Right now the system advertises redundancy it doesn't have.

---

## Strategic investments (multi-day projects worth doing)

### A. Backup + restore drill (1 day)
Stand up either Supabase Pro (PITR included) or write a nightly `pg_dump --schema=public` cron that ships to a private GitHub release or S3 bucket. Do a tabletop restore once. Without this, you are one bad migration from losing 8 months of work. Until this exists, every "let me try a schema change" carries existential risk.

### B. Test harness around the 6 hot paths (1-2 days)
URL decoder, whitelist, body fetch, dedup chain, upserts, email idempotency. Use real RSS fixtures captured to `tests/fixtures/`. Add GitHub Actions to run `bun test` on every push to main. This is what would have caught the URL-extraction regression that wasted 3 weeks.

### C. Structured pipeline runs table + observability page (2 days)
A `pipeline_runs` table per risk #4 plus a `/api/status` endpoint that returns the last 14 days of run metrics, the email_send_log summary, freshness on every static JSON. A simple `/status.html` page that shows it visually. This is the difference between "gavin reads SQL to check the system" and "gavin glances at a page". The fact that the 3-week regression went unnoticed says the dashboard does not surface pipeline health — only article content.

### D. Cron consolidation (½ day)
The Vercel Hobby 2-cron limit (risk #3) needs to be resolved. Either upgrade to Pro ($20/mo) or merge `detect-corrections` + `cron-weekly-summary` into one Friday job. Don't leave the system with 4 declared crons and uncertainty about which 2 are firing.

### E. Two-source ingest redundancy (3-5 days)
Right now Google News RSS is the only source. If Google deprecates the RSS API or rate-limits aggressively, ingest goes to zero. Add a second backbone: direct RSS subscriptions to the top 20 publishers in `config/source-whitelist.json` (Construction Dive, ENR, NAHB, Reuters business, etc. all expose `/feed.xml`). Even at 30% the volume of Google News, it would have prevented the April 2026 drought.

### F. Freshness badges everywhere (1 day)
Every static JSON gets a `_generated_at` timestamp written by `build-static.ts`. Every Supabase-backed table on the site shows `(updated 32 days ago)` next to stale data. The `financial_ratios` data is 32 days old and the user has no way to tell.

### G. Cost dashboard (½ day)
Plot daily Anthropic call counts, Resend send counts, Vercel function invocation count from `email_send_log` + new `pipeline_runs`. Alert when any deviates >50% from rolling 7-day average. Today, a runaway script could empty the Anthropic prepay overnight before anyone notices.

---

## Don't-fix list (deliberately not worth doing)

1. **Don't add an in-app status page with real-time monitoring.** Overkill for a daily-cadence pipeline. The healthcheck + email alert pattern is sufficient. A static `/status.html` rebuilt nightly is enough.

2. **Don't switch databases.** PostgreSQL/Supabase is the right choice; the issue is operational (backups, plan tier), not technological.

3. **Don't add a queue/worker layer (Bull, Inngest, Trigger.dev).** The pipeline is serial and idempotent. The `daily_run_lock` table + Vercel cron is sufficient. Adding a queue is 3 days of work for problems you don't have.

4. **Don't try to fetch article bodies behind paywalls.** WSJ, Bloomberg, FT bodies will not come back from a plain HTTP fetch. Accept the title-only degraded mode for Tier 1 paywalled sources and move on. The 30% body-fetch rate is acceptable — what's not acceptable is invisible degradation (risk #5).

5. **Don't write a custom Anthropic retry layer.** The SDK already retries on 5xx/429. The `callAnthropic` function in `lib/extraction.ts` correctly returns null and lets the caller decide. Don't add exponential backoff at the call-site.

6. **Don't refactor `api/daily-scan.ts` for size.** 1,051 lines is annoying but readable, and most of the new logic is small additive blocks. Extracting `runIngest()` into `lib/ingest.ts` adds zero reliability and risks breaking imports (the build script `check-api-imports.js` exists exactly because of past import breakage).

7. **Don't backfill historical extractions.** The 380 pre-pipeline articles will never have meaningful structured data. Tag them once with `prompt_version='pre-pipeline-v0'` (already done) and ignore. Spend the time on forward-looking quality.

8. **Don't add CSV/JSON export endpoints.** The user is the only consumer. Direct DB access via `api/db.ts` is already the escape hatch — that's enough.

9. **Don't migrate `earnings_calendar` to the existing DB table.** Wait. The hardcoded one in `build-static.ts:20-56` is fine for Q1/Q2 2026; the DB table is partially populated and would need its own update process. Quick-win #6 above is real but explicitly: write to the table from a one-time script, then start reading from it. Don't go halfway.

10. **Don't add a complex auth system for the dashboard.** The site is read-only and serves only non-confidential data (article URLs + summaries + public financial ratios). The CORS allowlist + service-role-key-gated mutations are appropriate. Adding SSO would be 2 weeks for zero security gain.

---

## Appendix: notable findings not surfaced in the top 10

- **RLS is enabled on every table with `Allow public read` policies on read-mostly tables** (`articles`, `companies`, `financial_ratios`, `weekly_summaries`, junction tables). Good — protects writes. The site uses service-role key for both read and write, so RLS is bypassed; if anyone ever needs to use the anon key from the browser, RLS becomes the real boundary. Verified there are no policies on `daily_run_lock`, `email_send_log`, `rejected_articles`, `human_review_queue`, or `article_extractions` — these tables are service-role-only (correct).

- **`anthropic-version: "2024-06-01"`** is hardcoded in `lib/extraction.ts:120`, `scripts/backfill-weekly-summaries.ts:51`, `scripts/update-financial-ratios.ts:116`. The Messages API version has been stable, but pinning to 2024-06-01 means we don't get newer features (extended thinking, prompt caching headers). Not urgent; just be aware.

- **`raw_feed_data` capture is partial:** 457/972 (47%) of recent rejections have it. Looking at the code (`api/daily-scan.ts:528-533` defines `rawForensic`, and it's passed to all 4 `logRejection` calls at 538, 547, 590, 617), this should be 100%. The 515 missing rows are pre-`6d0384a` and won't backfill. Going forward, monitor this — if it drops below 100% for new rows, the forensic chain is broken.

- **`title_noise_filter`** rejected 1 article in 7 days (regex at `api/daily-scan.ts:537`). Either the filter is too narrow (most "stocks to watch" articles are getting whitelisted by domain first) or the volume is correctly low. Worth periodically reviewing the noise patterns.

- **`reports.json`** is generated from filesystem `readdir` at build time (`site/build-static.ts:64-74`). Adding a new report = `git add` + redeploy. If the user wants to reference reports without redeploying, they'd need a DB-backed reports table. Currently fine; flag if it becomes friction.

- **`/api/db.ts` is a Supabase REST passthrough** with an allowlist of paths and `BRIEFING_API_KEY` or service-role-key auth (line 14). This is a powerful escape hatch — anyone with the service role key has full DB access. Make sure that key is in 1Password or equivalent, not in a chat log.

- **`CORS Allow-Origin` is broad** for `/api/db.ts` (`*` at line 8). For `/api/index.ts` and `/api/build-report.ts` it's an allowlist of 3 domains. The `*` on `/api/db.ts` is OK because it requires the API key, but it's a foot-gun — if someone ever drops the auth check, that endpoint is suddenly world-readable.

---

**End of audit.** All findings are based on read-only inspection of git HEAD `c2fbc5e` and live Supabase state queried via MCP. No code or data was modified.
