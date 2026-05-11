# Building Materials Newsletter — Pipeline Health Audit

**Auditor:** Read-only health audit, no code or data modified
**Audit date:** 2026-05-11
**Scope:** End-to-end production ingest pipeline, database state, configuration, scheduling
**Reference commit:** `ccbeaed fix(ingest): resolve real article URL post-whitelist + expand whitelist` (just deployed)

---

## Top-line health verdict

**DEGRADED — bordering on broken.** The pipeline is technically running every night (26/26 daily runs are marked `complete`), but it has been functionally dead for ~3 weeks. Of the last 24 scheduled runs (2026-04-18 through 2026-05-11), **18 inserted zero articles** and only 6 inserted any (the max was 7 on 2026-04-23). The `articles` table has gone from receiving ~6/day in mid-April to ~0–1/day in May — and even those few inserts have been polluted by the publisher-homepage-URL bug. The two fixes shipped in commit `ccbeaed` (Google News redirect resolution + 20 missing whitelist domains) are the right fixes, and as of 14:35 UTC today the pipeline has already produced 15 new inserts hitting the newly-whitelisted outlets (Barron's, Chicago Tribune, AOL, ESG Today, ACHR News, Glass on Web, HBS Dealer, Propmodo, Scotsman Guide, ArchPaper, etc.). **However, two underlying defects remain unfixed even in the post-deploy data and need attention before this can be called healthy:** (1) the URL resolution step is still storing publisher homepage URLs not article URLs (so click-through is still broken), and (2) the `article_extractions` table is at **0 rows** for the entire lifetime of the system — the second pipeline stage is silently no-op'ing because every article it receives is just a headline.

---

## Pipeline architecture (data flow)

```
Vercel Cron (04:00 UTC daily) ──┐
                                ├─► POST /api/daily-scan?key=cron
Anthropic remote trigger ───────┘   (api/daily-scan.ts:342)
   trig_015uykDko3ppsdJ7kNN5ezSW
   (11:59 PM EDT = 03:59 UTC)

/api/daily-scan handler:
  1. Idempotency: INSERT into daily_run_lock (unique on run_date) → dual triggers collapse to 1 run
  2. Fetch 8 Google News RSS feeds in parallel, when:4d window, 25 items/feed = ~200 candidates
       L8 queries: building materials, steel/lumber, Nucor/CRH/Vulcan, HVAC, housing starts,
         Home Depot/Lowe's, cement/aggregates, roofing/windows/insulation
  3. For each candidate item, parse <title>, <link> (Google redirect), <source> name,
     <source url="..."> (publisher homepage), <pubDate>
  4. Per-item pipeline:
       a. Title noise filter (rejects "stocks to watch", "top N stocks")
       b. isApprovedSource(article.url) — checks publisher homepage against
          config/source-whitelist.json (102 domains across 8 tiers)
       c. NEW (ccbeaed): resolveGoogleNewsUrl(googleUrl) AFTER whitelist passes,
          to get real article URL — 8 second timeout, regex over Google's HTML
       d. URL dedup: SELECT * FROM articles WHERE url = $1
       e. Title dedup: ILIKE first-5-words on same date
       f. Syndication hash dedup: SHA-256 of normalized headline + date
          → if hit, append publisher domain to articles.corroborating_sources
       g. extractStructuredData() — calls Anthropic Haiku with the article text...
          BUT article "text" here is just the headline, so extraction confidence is ~0
          and the JSON response is often null. → INSERT into article_extractions is
          guarded by `if (extractionResult)`, which is why that table is 0 rows.
       h. generateSummary() — calls Anthropic Haiku (Sonnet for Earnings) with the
          headline as both title AND body → produces ~150-word summary that's almost
          entirely hallucinated/generic since there's no actual article body.
       i. matchCompanies() — 2-signal rule from COMPANY_MATCH_RULES in daily-scan.ts:117
          (ticker + name = high confidence; single non-segment signal = low_confidence_match=true;
           segment-keyword alone = drop)
       j. report_ready = !isEarnings (auto-promote non-earnings, hold earnings for review)
       k. UPSERT articles, article_companies, article_av_sections (9 sections, threshold 0.15)
       l. Earnings → queueForReview('earnings_article'), low-conf company → review queue,
          high-relevance (>=0.7) → review queue
  5. Zero-article alert email if archived == 0 (idempotent by date)
  6. Digest email if archived > 0 (Resend, retry on 5xx/429, audit row in email_send_log)
  7. Stale-queue alert: items pending >48h get nag email (commit d958819)
  8. Healthcheck (Vercel cron 04:30 UTC, /api/healthcheck in api/index.ts:794):
       SELECT max(date) from articles; if >48h ago, send pipeline-stale alert email.

Weekly cron (Mondays 11:17 UTC): /api/detect-corrections → re-fetches Tier 1-2 URLs,
  diffs against full_text/source_excerpt, sets correction_flag, queues for review.

Manual scripts (not on cron):
  - scripts/update-financial-ratios.ts — Cap IQ → Yahoo fallback, last ran 2026-04-09
  - scripts/generate-weekly-summary.ts — Friday digest, last summary 2026-04-09
  - scripts/tag-articles-with-av-sections.ts — Backfill section tags
```

---

## Top 5 issues found

### 1. URL resolution silently failing — `articles.url` is still publisher homepage even after commit ccbeaed

**Evidence:** 15 articles inserted today (2026-05-11 14:35 UTC, *after* ccbeaed deployed) all have homepage URLs:

| Title | url |
|---|---|
| AI Data Centers Need to Stay Cool... — Barron's | `https://www.barrons.com` |
| Grayslake data center project... — Chicago Tribune | `https://www.chicagotribune.com` |
| How many homes are getting built in Greenville... — AOL.com | `https://www.aol.com` |
| The Next Era of Data Center Cooling — ACHR News | `https://www.achrnews.com` |

Query: `SELECT url FROM articles WHERE pull_timestamp > NOW() - INTERVAL '24 hours';` — every row is a bare hostname.

**Root cause:** `api/daily-scan.ts:484-489` calls `resolveGoogleNewsUrl(article.googleUrl)`, but the function (lines 50-77) is failing to resolve. Likely causes:
- Google News is serving a consent/cookie wall to the `BuildingMaterialsBot/1.0` user agent, returning HTML that doesn't match any of the three regex patterns (`data-n-au="..."`, `<c-wiz jsdata=...`, JSON-encoded URL with country code).
- The 8-second timeout (`AbortController`) trips before redirect resolves.
- The `redirect: "follow"` fetch may be landing on a Google interstitial whose `res.url` still contains `news.google.com`.

**Impact:** Click-through from email digests is broken. URL dedup is collapsing all same-publisher articles into one row (one Yahoo article per day max, one Barron's per day max — this is why daily counts dropped to ~1). The corroborating_sources mechanism is also broken because syndication hash never matches a real URL.

**File/line:** `api/daily-scan.ts:50-77` (resolveGoogleNewsUrl), `api/daily-scan.ts:484-489` (caller).

### 2. `article_extractions` table is at 0 rows — pipeline stage 1 has never produced data

**Evidence:** `SELECT COUNT(*) FROM article_extractions;` → **0 rows**, despite 437 articles in the system and 38 articles processed with `prompt_version='summary-standard-v1.0'` (the modern pipeline).

**Root cause:** `lib/extraction.ts:97` `extractStructuredData` is called with `article.title` as the "article text" (see `api/daily-scan.ts:554`: `extractStructuredData(article.title)`). Haiku is asked to extract revenue figures, EBITDA, guidance language, etc. from a single sentence headline. It either returns a JSON object full of nulls (which then makes the insert succeed but be useless), OR more commonly the response isn't parseable JSON and the function returns `null` at `lib/extraction.ts:170`. The caller `api/daily-scan.ts:620` then has `if (extractionResult)` — so a null result skips the insert entirely. **Net effect: 0 rows, no error logged, no alert.**

**Why this isn't surfacing as a silent failure alert:** Nothing monitors this table. The healthcheck (`api/index.ts:794`) only checks `articles.date`, not extraction completeness.

**Impact:** The entire "ground truth structured data" layer described in `lib/extraction.ts:5` doesn't exist. Every claim in `CLAUDE.md` about "article_extractions (structured financial data per article)" is currently fiction. The provenance audit story in build-report is incomplete.

**File/line:** `lib/extraction.ts:97-170` (extractStructuredData), `api/daily-scan.ts:553-554, 620-646` (caller + conditional insert).

### 3. Whitelist is still missing high-volume legit outlets — 826 rejections in last 7 days are now-trusted publishers

**Evidence:** Last-14-day rejections by domain (after commit ccbeaed):

| Domain | Rejections (14d) | Status |
|---|---|---|
| ad-hoc-news.de | 115 | Borderline (German stock aggregator) |
| indexbox.io | 102 | SEO market-report farm (REJECT) |
| openpr.com | 29 | Press release SEO (REJECT) |
| stockstory.org | 24 | Earnings transcripts (consider add) |
| theglobeandmail.com | 24 | **Now whitelisted, but rejected up through ccbeaed** |
| marketbeat.com | 15 | Stock analysis (REJECT) |
| fool.com | 13 | Motley Fool (consider add) |
| chartmill.com | 13 | Chart aggregator (REJECT) |
| investing.com | 10 | Major financial portal (consider add) |
| simplywall.st | 8 | Stock analysis (REJECT) |
| insidermonkey.com | 8 | Stock analysis (REJECT) |
| realtor.com | 8 | Housing data (consider add) |
| bcis.co.uk | rejected today | UK construction cost data (consider add) |
| resiclubanalytics.com | rejected today | Lance Lambert's housing research (add) |
| natlawreview.com | rejected today | Legal/regulatory (consider add) |
| advisorperspectives.com | 9 | Financial research (consider add) |
| jdsupra.com | 5 | Legal analysis (consider add) |
| mortgagenewsdaily.com | 6 | Mortgage industry data (add) |

**Impact:** Even after the May 2026 whitelist expansion, 2,824 of 2,873 rejections (98.3%) in the last 30 days are `domain_not_whitelisted`. The whitelist is the dominant filter and is still too narrow for the long-tail of trusted commentary.

**File/line:** `config/source-whitelist.json`.

### 4. `raw_feed_data` is NULL for 100% of rejected articles — forensic data is missing

**Evidence:** `SELECT raw_feed_data IS NOT NULL AS has_raw, COUNT(*) FROM rejected_articles WHERE rejection_timestamp > NOW() - INTERVAL '7 days' GROUP BY has_raw;` → **694 rows, all with has_raw=false**.

**Root cause:** `api/daily-scan.ts:466,474,511,539` all call `logRejection(url, title, reason, detail)` without the optional `rawData` argument. The function signature at line 234 accepts `rawData?: any`, but nothing passes it. So the rejection audit table has no Google News item XML, no <source> tag, no candidate article URL pre-resolution.

**Impact:** When investigating "why did this article get rejected", we have only the publisher homepage URL and reason code — we cannot see the original Google News redirect URL, can't reproduce the resolution attempt, can't debug the redirect failure (issue #1).

**File/line:** `api/daily-scan.ts:233-253` (logRejection), callers at 466, 474, 511, 538.

### 5. Financial ratios, market drivers, concepts, and weekly summaries are all stale by 4–5 weeks

**Evidence:**

| Table | Last Update | Staleness | Verified |
|---|---|---|---|
| financial_ratios (H1 2025) | 2026-04-09 23:12 UTC | **32 days** | 0/39 manually_verified, 0 rows from `capital_iq`, 35 from `yahoo-finance`, 4 `public-filings`, 4 `pending` |
| financial_ratios (FY 2025) | 2026-04-09 23:19 UTC | **32 days** | same |
| weekly_summaries | week of 2026-04-06 | **5 weeks** | Should be running every Friday |
| market_drivers (current_signal) | 2026-04-06 23:47 UTC | **35 days** | All 7 frozen since |
| market_driver_history latest | 2026-04-07 | **34 days** | 6 entries/driver, no signal updates |
| concepts | 2026-04-06 23:47 UTC | **35 days** | All 6 frozen since |

**Root cause:** None of these are on a cron in `vercel.json`. They depend on manual `bun run scripts/...` invocations. Last attempted runs:
- `update-financial-ratios.ts` — last touched data 2026-04-09
- `generate-weekly-summary.ts` — should run Fridays via Anthropic trigger; the most recent week missing is 2026-04-13 onward (5 missing summaries)

The schema also reveals a config drift: `financial_ratios.data_source` enum has 4 values in the DB (`manual`, `yahoo-finance`, `pending`, `public-filings`) but `CLAUDE.md` claims it should be `capital_iq` or `yahoo_finance_fallback`. **The Cap IQ path has never produced a row.** The 4-value enum is what's actually populated.

**Impact:** Any report generated today would be using April-snapshot company financials, April-7 market driver signals, and would have no May weekly digest. The site's `/api/financial-ratios` and `/api/financial-ratio-flags` are serving 32-day-old data without a "stale" badge.

**File/line:** `vercel.json:4-8` (cron list — only 3 entries), `scripts/update-financial-ratios.ts`, `scripts/generate-weekly-summary.ts`.

---

## Stuck items

- **Review queue:** 68 total items, **0 currently pending**. Everything has been resolved (55 earnings_article approved, 2 modified, 4 low_confidence approved, 2 rejected, 4 corrections worked through). This is the one bright spot — Gavin appears to have been clearing the queue diligently. The stale-queue alert that fired this morning (`[ACTION REQUIRED] 1 review queue items overdue — 2026-05-11`) was for the lone item that has since been resolved.
- **Articles with missing extractions:** **437 of 437** (100%). Every single article in the system has `article_extractions = NULL` (issue #2).
- **Articles with no full_text:** 420 of 437 (96.1%) have `full_text = NULL` despite the code at `api/daily-scan.ts:551` claiming Tier 1-3 articles should store full_text. The 17 that have it stored just the title verbatim (sample: `full_text == content == title` for the most recent 3 rows).
- **Articles with no source_excerpt:** 437 of 437 (100%) — `extractSourceExcerpts()` is never called (it's stubbed out at `api/daily-scan.ts:566` with `const sourceExcerpts: string[] = [];`).
- **Articles tagged with pre-pipeline-v0:** 380 of 437 (87%) — these are legacy migrated articles with no provenance fields. They've been sitting unchanged since `backfill-provenance.ts` last ran.
- **report_ready articles with zero company links:** **217 of 435** (49.9%) report-ready articles have no company link. These are macro/policy/permit articles that legitimately aren't about a tracked company, but it means any company-pivot report view will look extremely thin.
- **article_av_sections without scoring provenance:** 413 of 428 rows have `scoring_model_version = NULL` and `scoring_prompt_version = NULL` (only the 15 inserts since commit `1776dc9` carry version metadata). The version-tagging feature is real but the historical data is unversioned.

---

## Silent failures (no alert fired)

These are the most insidious findings — the system is "green" on the dashboards while these are broken:

1. **`article_extractions` is empty (issue #2).** No healthcheck or alert exists for this table. Discovered only because `list_tables` showed `rows: 0`.
2. **URL resolution is failing in production (issue #1).** The `resolveGoogleNewsUrl` function catches all errors silently (`catch { /* fall through */ }` at `api/daily-scan.ts:75`) and falls back to returning the Google redirect URL — but then the calling code at `api/daily-scan.ts:486` only overwrites `article.url` if the resolved URL doesn't contain `news.google.com`. **There is no log line when resolution fails — the caller treats failure as "use the homepage URL we already have."** Nothing counts resolution-failure rate.
3. **Anthropic API failures are swallowed.** `callAnthropic` at `lib/extraction.ts:66-91` returns `null` on any non-200 response or exception, with no console.error, no email, no rejected_articles row. If the ANTHROPIC_API_KEY is wrong, expired, or rate-limited, every article still archives but its extraction is silently nullified.
4. **`raw_feed_data` is always NULL on rejections (issue #4).** Means we can't post-hoc debug whitelist or dedup misses.
5. **Vercel cron is the only path firing daily.** The CLAUDE.md describes an "Anthropic remote trigger" at 11:59 PM EDT. The `daily_run_lock` table only shows ONE run per day, all at 04:11 UTC. This is the Vercel cron (scheduled `0 4 * * *`) — but the wall-clock shows runs at 04:11, not 04:00 — suggesting Vercel cron drift. **The Anthropic trigger does not appear to be hitting the endpoint** (or if it is, the dual-trigger idempotency in `daily_run_lock` is masking it). The "dual-path nightly automation" advertised in memory is functionally single-path.
6. **`detect-corrections` last ran 2026-04-27.** `last_verified` on the 5 correction_flag=true articles is 2026-04-27 11:58 UTC. Mondays since then (May 4, May 11) should have produced re-fetches. No email_send_log entries of type `alert-numeric-correction` exist after April. Either the cron is firing silently with 0 corrections found, or the cron isn't firing at all. The `email_send_log` query shows no `alert-numeric-correction` emails — but that type would only fire if corrections were found, so it's ambiguous.
7. **The 1 article from 2025-06-02 with pull_timestamp 2026-04-20** (Fortune BLDR profile) and 2026-02-24 article ingested 2026-04-20 (Roofing Contractor TopBuild) suggest the historical `when:4d` filter wasn't always enforced, and some recently-pulled rows have ancient dates. Date discipline isn't audited.

---

## Drift / staleness

| What | Last fresh data | Days stale (today = 2026-05-11) |
|---|---|---|
| Articles ingested | 2026-05-11 14:35 UTC (post-ccbeaed manual run) | 0 (but only because of fix; was ~3 days before) |
| Last automated nightly insert | 2026-05-09 (1 article) | 2 days |
| article_extractions | never | infinite |
| financial_ratios (any period) | 2026-04-09 | 32 |
| weekly_summaries | week ending 2026-04-12 | ~29 |
| market_drivers signals | 2026-04-06 | 35 |
| market_driver_history | 2026-04-07 | 34 |
| concepts content | 2026-04-06 | 35 |
| detect-corrections last_verified | 2026-04-27 | 14 |
| Email send log activity | 2026-05-11 (today, alerts only) | 0 (alerts), 20 (digests — last real digest 2026-04-21) |
| Site/build-static rebuild | unknown — check Vercel deployment log |  |

Of the 38 email_send_log rows in last 30 days: **22 alerts (19 zero-article + 3 stale-queue) sent successfully, only 4 digests sent (3 sent, 1 failed)**. The system has been almost exclusively emailing alerts, not content, for weeks.

---

## Recommended fixes ranked by impact

1. **(P0) Fix `resolveGoogleNewsUrl` actually resolving.** The post-ccbeaed evidence shows the homepage-URL bug is still live in production. Options to investigate:
   - Add a user agent string that mimics a regular browser (`Mozilla/5.0 ... Chrome/120`) instead of `BuildingMaterialsBot/1.0`, which Google may be 429-ing or sending a consent wall to.
   - Log the failure: replace `catch {}` at line 75 with `catch (e) { console.warn(...); resolutionFailures++ }` and surface that counter in the daily summary.
   - Capture and store the Google News redirect URL in `articles.url` as a temporary fallback (it's at least unique per article), even if it's ugly — better than collapsing every Yahoo article into one row.
   - Add a dedicated alert: if >50% of today's archived articles have `url = source_homepage`, fire a "URL resolution degraded" email.

2. **(P0) Fix `article_extractions` being empty.** Two paths:
   - Short-term: skip the call when `articleText.length < 200` and don't pretend extraction is happening. Insert a row anyway with `extraction_confidence = 0` and `fields_present = []` so we at least track that extraction was attempted.
   - Long-term: actually fetch the article body. The pipeline currently only uses the RSS headline. Add a fetch step for whitelisted Tier 1-3 articles (with reasonable size + timeout limits) so extraction has real text to work with. This is the difference between an "institutional data quality" product and headline-collection.

3. **(P1) Add a `pipeline-stale` alert that monitors article_extractions, not just articles.date.** Healthcheck currently only triggers when `articles.date` is >48h old. Add a second check: "are extractions keeping up with articles?" If `articles count > article_extractions count + 50`, alert.

4. **(P1) Schedule the orphaned scripts.** Add to `vercel.json` crons:
   - `scripts/update-financial-ratios.ts` weekly (Mondays)
   - `scripts/generate-weekly-summary.ts` Fridays (currently relies on the Anthropic trigger which appears stuck)
   - A market-driver signal refresher (script doesn't exist yet — propose `scripts/update-market-drivers.ts`)

5. **(P1) Capture `raw_feed_data` in rejection logs.** One-line fix: pass the entire matched RSS `<item>` block as `rawData` to `logRejection`. This unlocks forensic debugging for every future whitelist decision.

6. **(P2) Whitelist additions.** Real outlets from last week's rejections to consider: `theglobeandmail.com` (already added but rejections predate deploy), `resiclubanalytics.com`, `bcis.co.uk`, `mortgagenewsdaily.com`, `realtor.com`, `fool.com`, `stockstory.org`, `investing.com`, `advisorperspectives.com`. Likely to reject: `indexbox.io`, `openpr.com`, `chartmill.com`, `marketbeat.com`, `simplywall.st`, `insidermonkey.com`, `kalkinemedia.com`, `tipranks.com`, `the-sun.com`, `tikr.com`, `meyka.com`, `chainstoreage.com`.

7. **(P2) Investigate dual-trigger gap.** The `daily_run_lock` only shows one daily run. Either delete the Anthropic trigger from CLAUDE.md and accept Vercel-cron-only, or fix the trigger so both fire (the idempotency lock will gracefully collapse them). Document the truth — the current state of "one cron pretending to be two" is exactly the kind of thing that erodes Gavin's trust.

8. **(P2) Surface stale data on the website.** Add freshness badges to `/api/financial-ratios` and `/api/market-drivers` so reports never silently use month-old numbers. The `manually_verified=0` count of 78/78 should at minimum throw a warning in the report generator.

9. **(P3) Backfill missing scoring provenance** on the 413 pre-pipeline `article_av_sections` rows. Low value but closes the audit-trail gap.

10. **(P3) Remove the 1 row from 2025-06-02 (Fortune BLDR)** and the 2026-02-24 Roofing Contractor row — they're date outliers from a backfill experiment and skew any "articles per week" analytics.

---

## Open questions for Gavin

1. **Is the Anthropic remote trigger `trig_015uykDko3ppsdJ7kNN5ezSW` still active?** The `daily_run_lock` table only records one run per day at 04:11 UTC, which is the Vercel cron. Check the trigger management page at https://claude.ai/code/scheduled/ — if it's failing, that's the difference between "redundant nightly automation" and "single point of failure."
2. **Should we fetch article bodies?** The current pipeline only stores headlines. Fetching the body unlocks real extraction, real summaries, source excerpts, correction detection, and corroborating-source matching — but costs more API tokens and risks getting blocked by paywalls. Worth it for an Applied Value client product, but a decision you should make.
3. **Capital IQ data source — is the API key still valid?** No `financial_ratios` row has ever been tagged `capital_iq`. Either the integration never went live, or the key broke and the code silently fell back to Yahoo. Worth checking before the next earnings season.
4. **Should we drop the `ad-hoc-news.de` rejection noise (115/week)?** The titles look like generic stock-tracker pages. Adding to a denylist would cut the rejection volume in half and clean up the rejection-rate dashboard.
5. **Do you want the weekly summary cron moved to Vercel?** The Friday Anthropic trigger appears stuck (last weekly_summary is from 2026-04-12). I can add it to `vercel.json`, but only with your sign-off on the model + token budget.
6. **The "1 article from 2025-06-02" and "2026-02-24" outliers** — are these intentional backfill rows, or leftover test data to delete?
7. **`config/market-drivers.json` has slug `government-infrastructure-spending`, but the DB has `infrastructure-spending`.** Same drift on a few others. Which is the source of truth? The config file says "DO NOT DROP" the DB table — fine, but the keys need to match for the section-tagging keyword lookups to work end-to-end.
