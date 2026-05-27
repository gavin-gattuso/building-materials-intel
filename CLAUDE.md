# Building Materials & Building Products Newsletter

## Custom Commands
- `/jarvis-newsletter` -- Search for Building Materials & Building Products headlines, generate a comprehensive Word document (detailed research repository), and send a brief high-level email digest to gavin.gattuso@appliedvalue.com

## Trigger Phrases
When the user says "Jarvis run my newsletter" (or similar), invoke the `/jarvis-newsletter` skill. This defaults to Building Materials & Building Products industry coverage across both industry news and 7 market health drivers (Interest Rates, Labor, Material Costs, Demand, Infrastructure Spending, Credit, GDP).

## Daily Automated Task
The nightly ingest runs at **04:00 UTC** every night via a Vercel cron (`vercel.json` -> `/api/daily-scan?key=cron`). The 2026-05-11 audit established that this is the only path actually firing — the previously documented Anthropic remote trigger (`trig_015uykDko3ppsdJ7kNN5ezSW`, 11:59 PM EDT) does not appear in `daily_run_lock` and has not been verified as live. If you need true dual-path redundancy, verify the trigger at https://claude.ai/code/scheduled/ or move the canonical schedule to Vercel only. The `daily_run_lock` unique-on-run_date constraint makes both triggers safely idempotent if the Anthropic one is restored.

Nightly ingest steps:
1. Searches for today's Building Materials & Building Products news
2. Filters through a 9-tier approved source whitelist
3. Archives EVERY article into a search-optimized knowledge base (KB_Raw HTML on SharePoint)
4. Deep dives all 39 tracked companies (KB_Companies HTML on SharePoint)
5. Curates top 10-15 stories into a briefing (Building_Materials_Briefing HTML on SharePoint)
6. Emails the digest to gavin.gattuso@appliedvalue.com

(Trigger management page if the Anthropic backup gets revived: https://claude.ai/code/scheduled/trig_015uykDko3ppsdJ7kNN5ezSW)

## Website / Intelligence Platform
- Run with: `bun run site` (http://localhost:3000)
- Deployed: Vercel (auto-deploys from `main` branch)
- Files: `site/server.ts`, `site/kb.ts`, `site/public/index.html`
- Features: Dashboard, Articles search, Company profiles, Market Drivers, Concepts, Financial Ratios, Reports, AI Chat
- Chat mode: Smart Search (no API key needed). Set ANTHROPIC_API_KEY env var to enable AI synthesis mode.
- Auto-refreshes KB data every 60 seconds
- **`/status.html`** -- operational health dashboard (pipeline_runs trends, freshness, alerts, recent runs). Public read.
- **Homepage freshness banner** auto-shows when any tracked data type is stale (articles >48h, weekly digest >10d, ratios/drivers >21d)

## Report Generation
- Custom intelligence reports generated as .docx via `/api/build-report` (POST)
- Formatting matches Applied Value YTD 2025 PDF style (green brand colors, Arial font, color-coded trend indicators)
- `api/build-report.ts` -- Dedicated Vercel serverless function (isolated from main API to avoid `docx` library bloating other endpoints)
- `lib/docx-formatting.ts` -- Shared formatting utilities (brand colors, heading styles, trend table, title block)
- Important: ESM imports in `api/` must use `.js` extensions for Vercel Node.js runtime compatibility

## Vercel API Endpoints
The main API (`api/index.ts`) handles many endpoints; several heavier or cron-triggered paths live in their own files. Auth on cron + privileged endpoints uses `lib/auth.ts:isAuthorizedCronOrPrivileged()` — accepts the Vercel `x-vercel-cron: 1` header, `Authorization: Bearer <CRON_SECRET>`, or `x-scan-key`/`?key=` matching a provisioned secret. The legacy literal `"cron"` key is no longer accepted (RELIABILITY-AUDIT risk #1).

Standalone endpoints (each in their own `api/*.ts`):
- `POST /api/daily-scan` -- main nightly ingest. Supports `?backfill=1&days=N&extra=Q1|Q2` for ad-hoc runs.
- `POST /api/auto-heal` -- daily self-healing cron (06:00 UTC, 2h after nightly). Detects 9 failure modes (no recent run, stuck lock, zero archive with candidates, freshness drift, anthropic dead, body fetch drop, url decode drop, digest missing, review overdue). Auto-fixes stuck locks + missing nightly runs + freshness drift via internal `/api/daily-scan?backfill=1` calls (capped at 1 backfill per invocation). Escalates Anthropic/decoder/UA-block issues via one consolidated daily email (`type=auto-heal-summary`, idempotency-keyed on date). Paper trail in `auto_heal_runs` table. Replaces the deprecated `/api/healthcheck` cron entry.
- `GET /api/healthcheck` -- still handled by `api/index.ts` for manual GET, no longer cron-fired (superseded by `/api/auto-heal`)
- `POST /api/cron-weekly` -- consolidated Friday job (corrections + weekly summary)
- `POST /api/cron-weekly-summary?key=cron` -- standalone digest generator (manual fallback)
- `POST /api/detect-corrections?key=cron` -- re-fetches Tier 1-2 article URLs, flags content changes
- `POST /api/backfill?op=google-news-urls|article-bodies[&limit=N][&dry=1]` -- maintenance backfills
- `POST /api/rematch-companies?limit=N[&dry=1]` -- re-runs matchCompanies on existing unlinked articles
- `GET  /api/status` -- operational telemetry JSON for `/status.html` (public, 60s CDN cache)

Endpoints handled by `api/index.ts`:
- `GET /api/stats` -- Article counts, category breakdown, company mentions
- `GET /api/mode` -- Whether AI synthesis is enabled
- `GET /api/articles?q=&category=&company=&limit=` -- Search/filter articles (includes report_ready field)
- `GET /api/article/{slug}` -- Full article detail
- `GET /api/wiki?type=company|market-driver|concept` -- Wiki page listings
- `GET /api/wiki/{slug}` -- Full wiki page content
- `GET /api/weekly-summary` -- Latest AI-generated weekly digest
- `GET /api/financial-ratios?period=` -- Financial metrics for all 39 companies
- `GET /api/financial-ratio-flags?period=` -- Anomaly flags with type-specific thresholds (>15% revenue, >2pp margin)
- `GET /api/av-sections` -- 9 Applied Value report sections
- `GET /api/av-sections/{slug}` -- Section detail with tagged articles and relevance scores
- `GET /api/av-coverage` -- Article coverage counts per report section
- `GET /api/review-queue?status=&type=&limit=` -- Human review queue items
- `GET /api/review-queue/stats` -- Review queue summary counts by type and status
- `POST /api/review-queue` -- Update review status (body: {id, status, notes, reviewedBy}); auto-promotes articles on approval
- `POST /api/chat` -- Smart search or AI synthesis (body: {message, history})
- `POST /api/synthesize-section` -- AI synthesis for report sections
- `POST /api/executive-summary` -- AI-generated executive summary
- `POST /api/build-report` -- Generates HTML report with validation checks and provenance appendix (separate serverless function in `api/build-report.ts`)
- `POST /api/detect-corrections` -- Weekly correction detection for Tier 1-2 articles (separate serverless function, Vercel cron: Mondays 11:17 UTC)

## Database (Supabase)
- All data served from Supabase (PostgreSQL)
- Core tables: articles, companies, market_drivers, concepts, financial_ratios, weekly_summaries, av_report_sections, article_av_sections, earnings_calendar (table created 2026-05-12, seeded from `site/build-static.ts`)
- Pipeline tables: article_extractions (structured financial data per article), rejected_articles (audit trail of filtered articles with `raw_feed_data` forensic snapshot), human_review_queue (earnings/anomaly review workflow), `pipeline_runs` (one row per /api/daily-scan invocation — URL decode %, body fetch %, Anthropic OK %, used by auto-heal trend detection), `auto_heal_runs` (one row per /api/auto-heal invocation — detected/fixed/escalated JSONB arrays, paper trail for the self-healing cron)
- Junction tables: article_companies (with low_confidence_match flag), article_tags, article_av_sections (with scoring_model_version, scoring_prompt_version, scoring_signals)
- Articles have provenance fields: source_excerpt, full_text, model_version, prompt_version, pull_timestamp, syndication_hash, corroborating_sources, correction_flag, report_ready
- Financial ratios have provenance: data_source (capital_iq or yahoo_finance_fallback), currency, fx_rate_used, capiq_unique_id, manually_verified
- `daily_run_lock.status` has a CHECK constraint enforcing `'in_progress' | 'complete' | 'failed'`
- Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY (extraction/summary — **not currently set on Vercel**, telemetry tracks noKey count), CRON_SECRET (cron + privileged endpoints + HMAC email action tokens), RESEND_API_KEY (emails), ANTHROPIC_DAILY_CAP (default 5000, refuses ingest above this)
- Migration scripts in `scripts/` and via Supabase MCP `apply_migration`

## Scripts
- `scripts/push-to-supabase.ts` -- Upload parsed KB to Supabase
- `scripts/update-financial-ratios.ts` -- Fetch financial data (Capital IQ primary, Yahoo Finance fallback), detect anomalies, insert review queue items
- `scripts/generate-weekly-summary.ts` -- AI weekly digest (runs Friday via trigger, filters by report_ready)
- `scripts/tag-articles-with-av-sections.ts` -- Tag articles to 9 AV report sections (reads rules from config/report-sections.json)
- `scripts/detect-corrections.ts` -- Weekly re-fetch of Tier 1-2 article URLs to detect corrections (also available as API endpoint)
- `scripts/migrate-provenance-pipeline.ts` -- Database migration for all provenance/pipeline schema changes
- `scripts/review-earnings-backfill.ts` -- Review process for earnings articles (rule-based without API key, AI extraction with --extract flag)
- `scripts/backfill-provenance.ts` -- Backfill syndication hashes and model_version for pre-pipeline articles
- `scripts/fetch-fy2025.ts` / `fetch-cogs-sga.ts` -- Financial data fetchers
- `scripts/lint-kb.ts` -- Validate KB markdown frontmatter

## Configuration
- `config/report-sections.json` -- 9 AV report sections with keywords, categories, weights (source of truth for scoring rules)
- `config/market-drivers.json` -- 7 market health drivers with search keywords and indicator signals
- `config/industry-concepts.json` -- 6 foundational industry concepts
- `config/prompt-versions.json` -- Append-only registry of every AI prompt used in the system (audit trail)

## Services
- `services/financial-data/capiq-client.ts` -- S&P Capital IQ API client with Yahoo Finance fallback and anomaly detection
- `services/financial-data/fx-rates.ts` -- FX rate fetching from ECB for non-USD company conversions
- `lib/extraction.ts` -- Two-step article processing (structured extraction + prose summary) with `anthropicTelemetry` counters (totalCalls/noKey/http4xx/5xx/fetchError/parseError/empty/ok) surfaced in daily-scan log
- `lib/syndication.ts` -- Syndication hash computation for cross-outlet duplicate detection
- `lib/report-validation.ts` -- 5 post-generation validation checks and provenance appendix generation
- `lib/google-news-decoder.ts` -- 3-tier decoder (offline base64 → batchexecute RPC → redirect-follow). 100% success on production URLs.
- `lib/auth.ts` -- `isAuthorizedCronOrPrivileged()` + `signActionToken()`/`verifyActionToken()` (HMAC over CRON_SECRET for email links). Replaces the hardcoded "cron" literal from RELIABILITY-AUDIT risk #1.
- `lib/whitelist.ts` -- `isApprovedSource()`, `getSourceDomain()`, `getSourceTier()` (extracted from daily-scan for unit testing).
- `lib/body-fetch.ts` -- `fetchArticleBody()` + `extractMainText()` for whitelisted Tier 1-3 article bodies.
- `lib/company-match.ts` -- `matchCompanies()` and the 39-company `COMPANY_MATCH_RULES` table (sole source of truth; daily-scan and rematch both import from here).

## Pipeline & Data Quality
- Articles go through: RSS fetch → whitelist check → URL/title/syndication dedup → structured extraction → prose summary → company matching (2-signal minimum) → section tagging → report_ready promotion
- Earnings articles require human review before report_ready = TRUE
- Financial anomalies (>15% revenue, >2pp margin, >0.5x leverage, >30% FCF) auto-insert into human_review_queue
- Report generation requires minimum 20 report-ready articles; runs 5 validation checks; always appends provenance appendix
- Rejected articles logged to rejected_articles table with reason codes

## Static Build
- `site/build-static.ts` -- Generates static JSON files at build time (earnings-calendar.json, reports.json, financial-ratios.json, weekly-summary.json)
- Vercel build command: `npm install && npx bun site/build-static.ts`

## Knowledge Base Structure
- `knowledge-base/raw/articles/` -- 353+ legacy markdown articles with YAML frontmatter (pre-Supabase, kept for archival)
- `knowledge-base/wiki/companies/` -- 39 company profiles
- `knowledge-base/wiki/market-drivers/` -- 7 market health driver pages
- `knowledge-base/wiki/concepts/` -- 6 concept/analysis pages
- `knowledge-base/wiki/indexes/` -- MASTER-INDEX.md, COMPANY-INDEX.md, etc.
- `knowledge-base/outputs/` -- Generated briefings and reports
- **`knowledge-base/by-company/{slug}/{date}-{title}.md`** -- Per-company filesystem mirror of the live Supabase articles. Rich YAML frontmatter (source tier, all linked companies, sections, extraction figures, body length). Articles linked to multiple companies are written once per company so each folder is a complete company-pivot view. Regenerate with `SUPABASE_SERVICE_ROLE_KEY=... bun scripts/export-articles-by-company.ts`. See `knowledge-base/by-company/_index.md` for common queries.

## 39 Tracked Companies (by segment)
**Aggregates & Cement:** CRH, CEMEX, Heidelberg Materials, Holcim, Martin Marietta, Taiheiyo Cement, Vulcan Materials
**Glass & Insulation:** AGC, Owens Corning, Saint-Gobain
**Wood & Lumber:** Canfor, Interfor, UFP Industries, West Fraser, Weyerhaeuser
**Steel & Metals:** ArcelorMittal, Nucor, Steel Dynamics, Wienerberger
**Building Products & Distribution:** Builders FirstSource, Carlisle Companies, Installed Building Products, Kingspan, QXO, RPM International
**Doors, Windows & Security:** ASSA ABLOY, JELD-WEN, LIXIL, Sanwa Holdings
**Plumbing, Drainage & Fixtures:** Advanced Drainage Systems, Geberit, Fortune Brands, Masco
**HVAC & Climate:** Carrier Global, Daikin Industries, Johnson Controls, Trane Technologies
**Retail & Distribution:** Home Depot, Lowe's

## 8-Tier Source Whitelist
1. Major News (Reuters, Bloomberg, WSJ, FT, NYT, WaPo, BBC, CNBC, Forbes, Fortune, AP)
2. Industry-Specific (Construction Dive, BD+C, ENR, Remodeling Magazine, JLC, ProBuilder)
3. Company IR Pages (all 39 companies' official investor relations sites)
4. Associations & Research (NAHB, ABC, PCA, AISI, AGC, Construction Analytics, AIA, Conference Board, S&P Global Ratings)
5. Government & Data (Census, BLS/PPI, BEA, FRED, Federal Reserve, USGS, Procore, BusinessWire/PR Newswire/GlobeNewsWire)
6. Financial Analysis (Yahoo Finance, Seeking Alpha, MarketScreener -- limited to these three)
7. Consulting Firms (Bain, Deloitte, PwC, KPMG, FMI Corp, Capstone Partners)
8. Construction Niche (LBM Journal, Builder Online, Steel Market Update, Fastmarkets, For Construction Pros, ConstructConnect, Concrete Products, Pit & Quarry, Rock Products, CemNet, HousingWire, Data Center Dynamics, Roofing Contractor)

