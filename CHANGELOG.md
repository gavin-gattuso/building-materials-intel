# Changelog

All notable changes to the Building Materials Intelligence Platform are recorded here. Format inspired by [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [2026.05.12] — Reliability sprint

After a 3-week silent regression in April 2026 (URL collapse + missing whitelist entries dropped ingest to ~0 articles/day), this release substantially hardens the pipeline: telemetry-based regression detection, HMAC-signed email actions, a per-company filesystem mirror, an operational status page, and a 93-test reliability harness.

### Added
- **`/status.html` operational dashboard** + `/api/status` JSON endpoint. Pipeline health pill, last run, 7d/14d rate trends, per-data-type freshness, alert breakdown, recent runs.
- **`pipeline_runs` telemetry table** writing URL decode %, body fetch %, Anthropic OK % per ingest invocation; trend alert fires at 25pt week-over-week drop.
- **Frontend data-freshness banner** on the homepage — warns when any tracked data type is stale.
- **`lib/google-news-decoder.ts`** — 3-tier Google News URL decoder (offline base64 → batchexecute RPC → redirect-follow). 100% success rate on production URLs.
- **Article body fetching** — `fetchArticleBody` + `extractMainText` in `lib/body-fetch.ts`. Increased article body coverage from 20 → 142 (7×).
- **`pipeline_runs`, `daily_run_lock.status` CHECK constraint** — schema-enforced enum.
- **HMAC-signed email action links** — `signActionToken` / `verifyActionToken` in `lib/auth.ts` replace the hardcoded `"cron"` literal.
- **`lib/whitelist.ts`** — `isApprovedSource`, `getSourceDomain`, `getSourceTier` extracted from `api/daily-scan.ts` for unit testing.
- **`api/cron-weekly.ts`** — consolidated Friday cron (detect-corrections + weekly-summary in one job) to fit any Vercel tier.
- **`api/backfill.ts`** — auth-gated maintenance endpoint with `op=google-news-urls` and `op=article-bodies`.
- **`api/cron-weekly-summary.ts`** — standalone cron endpoint (also callable for ad-hoc digest generation).
- **Non-AI weekly digest fallback** — `generateWeeklySummary` produces a deterministic digest from article metadata when `ANTHROPIC_API_KEY` is missing.
- **Anthropic daily token cap** (`ANTHROPIC_DAILY_CAP`, default 5,000) — defends against runaway cost.
- **Anthropic API telemetry** — `anthropicTelemetry` counters (noKey, http400/401/429/5xx, fetchError, parseError, empty, ok) surfaced in daily-scan log.
- **Stuck-lock detection** in `/api/healthcheck` — alerts on any `daily_run_lock` row stuck `in_progress` > 15 minutes.
- **Saturday/Sunday digest-missing alert** in `/api/healthcheck`.
- **`raw_feed_data` forensic capture** on every `rejected_articles` insert — `{googleUrl, publisherUrl, sourceName, date}`.
- **`scripts/backfill-article-bodies.ts`** and **`scripts/backfill-google-news-urls.ts`** — CLI counterparts to `/api/backfill`.
- **`scripts/export-articles-by-company.ts`** — exports the Supabase article archive to `knowledge-base/by-company/{slug}/...` markdown files with rich YAML frontmatter (extraction figures, sections, tags, source tier).
- **Test harness** — 93 unit tests across `tests/decoder.test.ts`, `tests/auth.test.ts`, `tests/whitelist.test.ts`, `tests/email-idempotency.test.ts`, `tests/body-extract.test.ts`. Runs in <500ms.
- **`.github/workflows/test.yml`** — CI runs the reliability test set on every push + PR.
- **`HEALTH-AUDIT.md`** and **`RELIABILITY-AUDIT.md`** — read-only audit documents.

### Changed
- **Whitelist expanded** to 27 additional outlets (Barron's, Globe & Mail, Chicago Tribune, AOL, Marketplace, Architect's Newspaper, ACHR News, Glass on Web, HBS Dealer, ESG Today, AlphaStreet, Mortgage News Daily, Realtor.com, ResiClub, Investing.com, StockStory, etc.). Excludes ad-hoc-news, indexbox, openpr, chartmill, tipranks, etc.
- **URL extraction split** — publisher homepage URL used for the cheap whitelist check; Google News redirect resolved post-whitelist for the stored article URL.
- **Article body now passed to extraction + summary** (was: title only, which is why `article_extractions` was empty for the system's entire lifetime).
- **`vercel.json` crons** trimmed to `daily-scan` (daily), `cron-weekly` (Fridays), `healthcheck` (daily). Consolidates 4 prior crons into 3.
- **`generateWeeklySummary` refactored** to export from `scripts/generate-weekly-summary.ts` for reuse from `api/cron-*.ts`.
- **`CLAUDE.md`** trigger story updated to reflect Vercel-cron-only reality.
- **`api/index.ts:loadHome` (frontend)** prefers `/api/weekly-summary` over the static JSON to avoid stale-build issues.

### Fixed
- **URL resolution at 0% → 100%** via batchexecute decoder.
- **`article_extractions` always-write fallback** so every ingest attempt leaves an observable row (was: silent skip on extraction failure).
- **`anthropicTelemetry.parseError` counter** now actually increments (was declared, never written).
- **Best-effort `pipeline_runs` write on crash** in `api/daily-scan.ts` catch block.
- **`build-static.ts` fail-on-stale** — exits 1 if `weekly-summary.json` is null or `financial-ratios.json` has fewer than 30 rows.
- **15 articles cleaned up** from a half-working initial backfill (publisher-homepage URLs).
- **69 of 73 articles** had their `news.google.com` URLs resolved to publisher URLs.
- **`extraction.ts:callAnthropic`** catch block logs structured error code to `console.error` AND telemetry (was: silent return null).
- **Trend alert backstop inline in `api/daily-scan.ts`** — fires even if the `healthcheck` cron is dropped on a tier-limited Vercel plan.

### Removed
- Hardcoded `"cron"` literal from 5 `validKeys` arrays — replaced with `isAuthorizedCronOrPrivileged()` from `lib/auth.ts`.
- Old inline `resolveGoogleNewsUrl` in `api/daily-scan.ts` (now in `lib/google-news-decoder.ts`).

### Known issues (intentionally not fixed in this release)
- **`ANTHROPIC_API_KEY` env var still missing on Vercel** — extraction/summary returning placeholder content. Telemetry reports `noKey=N` per run; weekly digest gracefully degrades to deterministic fallback.
- **Supabase backups** — Free tier only has 7-day rolling. Decision pending on Pro upgrade vs. self-rolled `pg_dump`.
- **Capital IQ integration** — never produced a row. Either key not configured or path silently falling back to Yahoo.
- **49% of articles still have no company links** — macro/policy pieces don't trigger the 2-signal match. Re-run script available.

### Metrics (start → end of release)
- Articles ingested: 437 → 503
- Articles with full body text: 20 → 142 (7×)
- Articles with real publisher URLs (vs Google News redirects): 430 → 499
- Article extractions in DB: 0 lifetime → 33 (telemetry-tracked, even when value=null)
- Weekly summaries: April-only → May 4–10 + May 11–17 current
- Test count: ~20 (pre-existing pipeline tests) → 120 total / 93 in CI
- Vercel function endpoints: 5 → 11
- Audit documents: 0 → 2
