# Building Materials & Building Products Intelligence Platform
# Comprehensive System Audit Brief

> **Purpose of this document**: A self-contained, comprehensive overview of the entire platform designed to be pasted into a fresh Claude chat (or given to any auditor — internal team, external reviewer, AI peer) to enable a rigorous end-to-end audit. It summarizes the system's goals, architecture, data model, pipeline logic, validation rules, known risks, and explicit audit questions.
>
> **Author / Owner**: Gavin Gattuso, Applied Value
> **Snapshot date**: 2026-04-13
> **Recent commit**: `ad8ae83 feat: add provenance tracking, structured extraction, human review queue, and report validation`
> **Repo size**: ~11,000 LOC across `api/`, `lib/`, `scripts/`, `services/`, `site/`
> **Commit volume (last 30 days)**: 121 commits

---

## 1. Business Context

### 1.1 What this is
A fully-automated intelligence platform that continuously captures, archives, structures, and synthesizes Building Materials & Building Products industry news and financial data into a queryable knowledge base. It powers a bi-annual Applied Value client deliverable.

### 1.2 Why it exists
Rather than manually researching hundreds of sources every six months at report-writing time, the system:
1. Captures industry news **every night** via RSS + web search.
2. Filters through an 8-tier source whitelist.
3. Extracts structured data (financials, earnings, quotes) with full provenance.
4. Tags articles against 9 Applied Value report sections and 39 tracked companies.
5. Produces a polished, institutional-grade HTML/DOCX report on demand.

### 1.3 Quality bar
Target deliverable: **$500K/quarter client product**. Non-negotiables:
- Institutional data quality (every claim traceable to source)
- Full automation (minimal human intervention)
- Stunning visuals (matches Applied Value 2025 YTD PDF brand)

### 1.4 Primary vs. secondary goals
- **PRIMARY**: Build and maintain the comprehensive KB.
- **SECONDARY**: The daily email digest and the live website are surfaces over that KB; they are not the product.

---

## 2. High-Level Architecture

Four coordinated components:

1. **Remote Scheduled Trigger** on Anthropic cloud (`trig_015uykDko3ppsdJ7kNN5ezSW`)
   - Fires 11:59 PM EDT nightly (laptop-independent).
   - Calls the platform's own ingestion endpoint, then emails a digest.

2. **Vercel Serverless API** (auto-deploys from `main`)
   - Six functions in `api/`: `index.ts`, `build-report.ts`, `daily-scan.ts`, `detect-corrections.ts`, `send-briefing.ts`, `db.ts`.
   - Two Vercel crons (see §5.2).

3. **Supabase PostgreSQL** — single source of truth for all structured data.

4. **Filesystem Knowledge Base** (`knowledge-base/`) — 323+ markdown articles, 39 company wikis, 7 market-driver pages, 6 concept pages. Mirrored to SharePoint.

**Website**: Vercel-hosted single-page app (`site/public/index.html`) reading from Supabase via the API. Local dev via `bun run site`.

---

## 3. Data Model (Supabase)

### 3.1 Core tables
- `articles` — one row per article.
- `companies` — 39 tracked companies with keyword patterns.
- `market_drivers` — 7 health drivers.
- `concepts` — 6 foundational industry concepts.
- `financial_ratios` — 5 metrics × 39 companies × period.
- `weekly_summaries` — AI-generated Friday digests.
- `av_report_sections` — 9 report sections (IDs referenced by junction).
- `article_av_sections` — per-article section tag with scoring fields.
- `earnings_calendar` — upcoming earnings dates.

### 3.2 Pipeline tables (added April 2026)
- `article_extractions` — structured extraction per article (pre-prose, machine-readable).
- `rejected_articles` — audit trail of filtered-out articles with reason codes.
- `human_review_queue` — earnings + financial-anomaly review workflow.

### 3.3 Junctions
- `article_companies` — with `low_confidence_match` flag (2-signal rule).
- `article_tags`
- `article_av_sections` — with `scoring_model_version`, `scoring_prompt_version`, `scoring_signals` (JSON of triggering evidence).

### 3.4 Provenance fields on `articles`
`source_excerpt`, `full_text`, `model_version`, `prompt_version`, `pull_timestamp`, `syndication_hash`, `corroborating_sources`, `correction_flag`, `report_ready`.

### 3.5 Provenance fields on `financial_ratios`
`data_source` (`capital_iq` | `yahoo_finance_fallback`), `currency`, `fx_rate_used`, `capiq_unique_id`, `manually_verified`.

### 3.6 Environment variables
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY` (optional; unlocks AI chat synthesis), `RESEND_API_KEY` (email), Capital IQ credentials (financial data).

---

## 4. Ingestion Pipeline (End-to-End)

```
RSS feeds (3 Google News queries) + supplemental web search
  │
  ▼
Whitelist check (8 tiers, ~35+ domains)
  │
  ▼
Deduplication
   • exact URL match
   • title-phrase similarity (first 5 words + same date)
   • syndication_hash (cross-outlet body-fingerprint)
  │
  ▼
Structured extraction  →  article_extractions (numbers, names, dates, quotes)
  │
  ▼
Prose summary (Claude Haiku, ~200 words, preserves key figures)
  │
  ▼
Category assignment (10 buckets: Earnings, Tariffs, M&A, Infrastructure,
  Monetary Policy, Housing, Pricing, Labor, Credit, Economic)
  │
  ▼
Company matching (39 companies, keyword patterns + ticker)
   • 2-signal minimum else low_confidence_match = TRUE
  │
  ▼
AV section tagging (9 sections, keyword/weight rules in config/report-sections.json)
  │
  ▼
report_ready promotion gate
   • Earnings articles → BLOCKED until human review
   • Anomaly-flagged financials → BLOCKED until human review
   • Else → report_ready = TRUE
  │
  ▼
Supabase insert + SharePoint mirror + email digest
```

Rejections at any stage are logged to `rejected_articles` with a reason code.

---

## 5. Deployment Topology

### 5.1 Vercel functions (`api/`)
| File | LOC | Purpose | Why isolated |
|---|---|---|---|
| `index.ts` | 700 | Main API — all read endpoints + chat | Default router |
| `daily-scan.ts` | 733 | Ingestion endpoint called by remote trigger + Vercel cron | Heavy RSS + LLM work |
| `build-report.ts` | 424 | HTML/DOCX report generation | Isolated — `docx` lib would bloat other functions |
| `detect-corrections.ts` | 128 | Weekly re-fetch of Tier 1–2 URLs to detect corrections | Isolated cron target |
| `send-briefing.ts` | 43 | Email digest via Resend | Small/stable |
| `db.ts` | 63 | DB proxy for direct-from-frontend Supabase ops (allowlisted tables/RPCs) | Reduces server round-trips |

### 5.2 Vercel crons (`vercel.json`)
- `0 4 * * *` → `/api/daily-scan?key=cron` (daily ingestion, 04:00 UTC)
- `17 11 * * 1` → `/api/detect-corrections?key=cron` (Monday 11:17 UTC)

### 5.3 Remote scheduled trigger
- ID: `trig_015uykDko3ppsdJ7kNN5ezSW`
- Schedule: 23:59 EDT nightly
- Action: searches news, deep-dives 39 companies, archives to SharePoint, emails digest

### 5.4 Security headers (`vercel.json`)
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, CSP restricting scripts to `self + jsdelivr`, styles to `self + fonts.googleapis`, connect to `self + *.supabase.co + api.anthropic.com + api.resend.com`.

### 5.5 Build
`npm install && npx bun site/build-static.ts` — precomputes `earnings-calendar.json`, `reports.json`, `financial-ratios.json`, `weekly-summary.json` into `site/public/`.

---

## 6. API Surface

### 6.1 Read endpoints (in `api/index.ts`)
- `GET /api/stats` — article counts, category breakdown, company mentions
- `GET /api/mode` — whether AI synthesis is enabled
- `GET /api/articles?q=&category=&company=&limit=` — search/filter articles (includes `report_ready`)
- `GET /api/article/{slug}` — full article detail
- `GET /api/wiki?type=company|market-driver|concept`
- `GET /api/wiki/{slug}`
- `GET /api/weekly-summary`
- `GET /api/financial-ratios?period=`
- `GET /api/financial-ratio-flags?period=` — anomaly flags with type-specific thresholds
- `GET /api/av-sections`
- `GET /api/av-sections/{slug}` — section detail with tagged articles + relevance scores
- `GET /api/av-coverage` — article coverage counts per section
- `GET /api/review-queue?status=&type=&limit=`
- `GET /api/review-queue/stats`

### 6.2 Mutating / synthesis endpoints
- `POST /api/review-queue` — update review status (auto-promotes `report_ready` on approval)
- `POST /api/chat` — smart search OR AI synthesis (if `ANTHROPIC_API_KEY` set)
- `POST /api/synthesize-section` — AI synthesis for a report section
- `POST /api/executive-summary` — AI-generated exec summary
- `POST /api/build-report` — dedicated function; runs 5 validation checks + provenance appendix
- `POST /api/detect-corrections` — dedicated function; weekly correction sweep

### 6.3 Constraints
- **ESM imports in `api/` MUST use `.js` extensions** (Vercel Node.js runtime).
- `docx` library MUST stay in `build-report.ts` (would bloat other functions).

---

## 7. Scoring & Classification

### 7.1 AV section tagging (`config/report-sections.json`)
9 sections with per-section `keywords`, `categories`, and `weight` (0.3–0.8). Higher `weight` means the section is more "valuable" in ranking — e.g., `public-company-performance` = 0.8, `drivers-market-health` = 0.7, `intro-exec-summary` = 0.3. Scoring signals persisted in `article_av_sections.scoring_signals` (JSON).

Deprecation note: the `av_report_sections` DB table is still actively read by 3 endpoints in `api/index.ts` + section tagging in `daily-scan.ts`. The JSON config is the source of truth for scoring rules and keywords only. **Do not drop the DB table.**

### 7.2 Market drivers (`config/market-drivers.json`)
7 drivers: Interest Rates, Labor, Material Costs, Demand, Infrastructure Spending, Credit, GDP. Each has search keywords + indicator signals.

### 7.3 Concepts (`config/industry-concepts.json`)
6 foundational industry concepts.

### 7.4 Prompt governance (`config/prompt-versions.json`)
Append-only registry of every AI prompt used in the system. Full audit trail for regeneration and version pinning.

---

## 8. Financial Data Pipeline

### 8.1 Source
- **Primary**: S&P Capital IQ via `services/financial-data/capiq-client.ts` (555 LOC).
- **Fallback**: Yahoo Finance via `yahoo-finance2` npm pkg.
- **FX**: ECB rates via `services/financial-data/fx-rates.ts` for non-USD → USD conversion.

### 8.2 Metrics tracked
Revenue, Revenue Growth, COGS/Sales, SG&A/Sales, EBITDA Margin.

### 8.3 Anomaly thresholds (auto-insert into `human_review_queue`)
- Revenue change > 15%
- Margin change > 2 percentage points
- Leverage change > 0.5×
- Free Cash Flow change > 30%

### 8.4 Provenance
`data_source`, `currency`, `fx_rate_used`, `capiq_unique_id`, `manually_verified` flag on every row.

### 8.5 Runner
`scripts/update-financial-ratios.ts` — fetches, detects anomalies, inserts review-queue items.

---

## 9. Report Generation

### 9.1 Minimums
- ≥ 20 `report_ready` articles required (otherwise blocked).
- 5 validation checks from `lib/report-validation.ts` run unconditionally.
- Provenance appendix appended unconditionally.

### 9.2 Output
- HTML report matching Applied Value 2025 YTD PDF brand (green palette, Arial, color-coded trend indicators).
- DOCX alternative via `docx` library.
- Interactive HTML dashboard (`lib/html-dashboard.ts`, 1,046 LOC).
- Runtime target: < 2 minutes.

### 9.3 Method choice
HTML → PDF (Method 1) is the recommended delivery path; alternatives scored in backlog memory.

### 9.4 Interactive backlog
10 forward features (hover cards, company deep-links, dark mode, etc.) tracked in project memory.

---

## 10. Human-in-the-Loop

### 10.1 Review queue triggers
- Every earnings-category article
- Every financial-ratio anomaly crossing thresholds in §8.3

### 10.2 Workflow
- Item stored with `type`, `status`, `notes`, `reviewedBy` fields.
- `POST /api/review-queue` mutation updates status.
- Approval auto-sets `report_ready = TRUE` on the underlying article.

### 10.3 UI
Dashboard surfaces pending counts and filter controls over `/api/review-queue`.

---

## 11. Correction & Drift Detection

- `scripts/detect-corrections.ts` (and `api/detect-corrections.ts`) re-fetches all Tier 1–2 URLs weekly (Vercel cron: Mondays 11:17 UTC).
- Compares `syndication_hash` + content length + headline.
- Sets `correction_flag` when material drift detected.

---

## 12. Source Whitelist (8 Tiers)

1. **Major News**: Reuters, Bloomberg, WSJ, FT, NYT, WaPo, BBC, CNBC, Forbes, Fortune, AP
2. **Industry-Specific**: Construction Dive, BD+C, ENR, Remodeling Magazine, JLC, ProBuilder
3. **Company IR**: Official IR pages for all 39 companies
4. **Associations & Research**: NAHB, ABC, PCA, AISI, AGC, Construction Analytics, AIA, Conference Board, S&P Global Ratings
5. **Government & Data**: Census, BLS/PPI, BEA, FRED, Federal Reserve, USGS, Procore, BusinessWire/PR Newswire/GlobeNewsWire
6. **Financial Analysis** (strictly limited): Yahoo Finance, Seeking Alpha, MarketScreener
7. **Consulting Firms**: Bain, Deloitte, PwC, KPMG, FMI Corp, Capstone Partners
8. **Construction Niche**: LBM Journal, Builder Online, Steel Market Update, Fastmarkets, For Construction Pros, ConstructConnect, Concrete Products, Pit & Quarry, Rock Products, CemNet, HousingWire, Data Center Dynamics, Roofing Contractor

Note: A former "Tier 2 Top Publications" tier was removed in commit `280f5ca` (current whitelist is 8 tiers, down from 9).

---

## 13. Tracked Universe (39 companies, 9 segments)

- **Aggregates & Cement (7)**: CRH, CEMEX, Heidelberg Materials, Holcim, Martin Marietta, Taiheiyo Cement, Vulcan Materials
- **Glass & Insulation (3)**: AGC, Owens Corning, Saint-Gobain
- **Wood & Lumber (5)**: Canfor, Interfor, UFP Industries, West Fraser, Weyerhaeuser
- **Steel & Metals (4)**: ArcelorMittal, Nucor, Steel Dynamics, Wienerberger
- **Building Products & Distribution (6)**: Builders FirstSource, Carlisle Companies, Installed Building Products, Kingspan, QXO, RPM International
- **Doors, Windows & Security (4)**: ASSA ABLOY, JELD-WEN, LIXIL, Sanwa Holdings
- **Plumbing, Drainage & Fixtures (4)**: Advanced Drainage Systems, Geberit, Fortune Brands, Masco
- **HVAC & Climate (4)**: Carrier Global, Daikin Industries, Johnson Controls, Trane Technologies
- **Retail & Distribution (2)**: Home Depot, Lowe's

---

## 14. Key Files (Canonical Reference)

### 14.1 API (`api/`)
- `index.ts` (700) — main API
- `daily-scan.ts` (733) — ingestion
- `build-report.ts` (424) — report generation (isolated)
- `detect-corrections.ts` (128) — correction cron
- `send-briefing.ts` (43) — email
- `db.ts` (63) — frontend DB proxy

### 14.2 Libraries (`lib/`)
- `html-report.ts` (757), `html-dashboard.ts` (1,046) — presentation
- `report-validation.ts` (501) — 5 validation checks + provenance appendix
- `docx-formatting.ts` (423) — brand DOCX formatting
- `extraction.ts` (238) — 2-step structured → prose extraction
- `syndication.ts` (46) — cross-outlet fingerprinting
- `chat.ts` (95), `search.ts` (98) — chat/search
- `constants.ts` (89), `logger.ts` (38)

### 14.3 Services (`services/financial-data/`)
- `capiq-client.ts` (555), `fx-rates.ts` (134)

### 14.4 Scripts (`scripts/`)
Migration, backfill, and batch operations. Notable:
- `migrate-provenance-pipeline.ts` — schema for all provenance/pipeline tables
- `review-earnings-backfill.ts` — historical earnings review (rule-based; `--extract` flag for AI)
- `backfill-provenance.ts` — syndication hash + model_version for pre-pipeline articles
- `tag-articles-with-av-sections.ts` — re-tags per current `config/report-sections.json`
- `lint-kb.ts` — frontmatter + whitelist validation

### 14.5 Config (`config/`)
`report-sections.json`, `market-drivers.json`, `industry-concepts.json`, `prompt-versions.json`

### 14.6 Site (`site/`)
`server.ts` (491, local dev), `build-static.ts` (123, build-time JSON), `kb.ts` (161), `earnings-calendar.ts` (71), `public/` (frontend)

---

## 15. Known Constraints & Gotchas

1. **ESM .js extensions required** in `api/` imports (Vercel Node runtime quirk).
2. **`docx` must remain isolated** in `build-report.ts` — prior bundling broke other endpoints.
3. **`av_report_sections` DB table cannot be dropped** despite config migration — junction integrity depends on it.
4. **Chat defaults to Smart Search** (no API key required); AI synthesis only when `ANTHROPIC_API_KEY` set.
5. **Tier 6 (financial analysis) is strictly capped** at 3 sources — don't expand it casually.
6. **Static build uses Bun, not Node**, and must succeed before Vercel deploy succeeds.
7. **CSP whitelist** pins script sources to `jsdelivr`; switching CDN requires updating `vercel.json`.

---

## 16. Audit Scope — Explicit Questions for the Auditor

Please produce a **severity-ranked written audit (Critical / High / Medium / Low)** covering every area below. For each finding, include: evidence, risk, remediation recommendation, and estimated effort.

### 16.1 Data integrity & provenance
- Is the provenance schema sufficient for institutional-grade citations? Any required fields missing for a $500K/qtr deliverable (e.g., author, publisher verification, retrieval HTTP status, content-length at fetch)?
- Is `syndication_hash` robust to paywalls, cookie walls, ad injection? What's the false-positive / false-negative risk?
- Does `detect-corrections` catch silent edits (typo fixes) vs material edits (number changes) differently? Should it?
- Are `source_excerpt` + `full_text` captured for every article, or only some?

### 16.2 Pipeline correctness
- 2-signal company matching: what are the signals, and is the rule empirically calibrated against a labeled sample?
- Are rejection reason codes in `rejected_articles` exhaustive and mutually exclusive?
- Earnings-review gating: any bypass paths that could let unreviewed earnings articles reach `report_ready`?
- Dedup: is the "first 5 words + same date" title-similarity rule too aggressive or too lax?

### 16.3 Scoring model (AV sections)
- Weights (0.3–0.8) — empirically derived or intuition-based? Risk of label bias at scale.
- Keyword lists — any stemming / lemmatization / synonym expansion? Risk of miscategorizing near-synonyms ("rate hike" vs "hiked rates").
- `scoring_signals` JSON — is it machine-parseable for back-testing the scorer? Is there a back-test harness?

### 16.4 Financial data quality
- Capital IQ → Yahoo fallback — is there any indication in the final report to the reader when a fallback was used?
- FX: how stale can `fx_rate_used` be before it's refreshed? Is there a reconciliation pass?
- Anomaly thresholds (>15% rev, >2pp margin, >0.5× leverage, >30% FCF) — are these uniform across segments, and is that appropriate? (Aggregates vs Steel have very different volatility profiles.)
- `manually_verified` flag — process for setting it? Who, when, how audited?

### 16.5 Human-in-the-loop
- Review queue throughput — realistic for the current daily article volume (estimate 20–60/day)?
- SLA for review? Stale-item monitoring? Ghost approvals (items auto-approved after N days)?
- Auditor trail — does `reviewedBy` survive role changes / account deprovisioning?

### 16.6 Report validation
- What are the 5 validation checks, and do they cover:
  - Cross-source corroboration minimums per claim?
  - Numeric reconciliation (e.g., sum of segment revenue ≈ reported total)?
  - Period consistency (all FY2025 figures aligned on fiscal calendar)?
  - Source tier diversity (not over-reliant on a single outlet)?
  - Recency (no stale articles as primary citations)?
- Are validation failures hard-blocks or soft-warnings?

### 16.7 Architectural risks
- Single-function bloat on `api/index.ts` (700 LOC, handles ~15 endpoints). Cold-start impact?
- Supabase Row-Level Security — is RLS enabled, or is `SERVICE_ROLE_KEY` doing all the gating server-side?
- Cron idempotency — what happens if `daily-scan` and the remote trigger both fire and process the same day?
- Trigger observability — how do we know when a nightly run silently fails or under-delivers (e.g., RSS feed down, whitelist too narrow that day)?
- Secret rotation — process for Supabase service role, Anthropic, Resend, Capital IQ keys?

### 16.8 Automation & failure modes
- Nightly trigger partial failures — are articles committed per-batch or all-or-nothing? How is progress recoverable?
- Alerting — is there any alert channel when `daily-scan` runs but inserts 0 new articles?
- Backfill strategy — if 3 days of ingestion fail, what's the replay procedure?

### 16.9 Prompt governance
- Is `config/prompt-versions.json` actually referenced by every AI call site? Or are there in-line prompts that drift?
- When a prompt changes, do we re-tag / re-extract historical articles, or is the corpus frozen per prompt version?

### 16.10 Coverage completeness
- 39 companies: any obvious peers missing (e.g., Eagle Materials, USG, Summit Materials, James Hardie, Otis, Lennox, Stanley Black & Decker)?
- 7 drivers — does the set capture regulatory risk (building codes, environmental rules)? Supply chain / logistics?
- 8 source tiers — representation of international sources (Europe, Asia-Pacific) given the global company list?

### 16.11 UX / deliverable polish
- Report DOCX vs HTML — which is the client-facing artifact? Are both maintained in parallel (risk of drift)?
- Interactive report — POC only or production? (POC at `site/internal/reports/poc-drivers-section.html`.)
- Dark mode / accessibility — any WCAG compliance requirements for the deliverable?

### 16.12 Operational
- 121 commits in 30 days indicates high velocity. Any regression test coverage? (`tests/` exists but scope unclear.)
- CI/CD — are there pre-deploy checks beyond `build-static.ts`?
- Rollback plan for a bad nightly ingest that poisons the KB?

---

## 17. Requested Deliverable from the Auditor

1. **Executive summary** — top 3 risks and top 3 strengths.
2. **Findings table** — Severity | Area | Finding | Evidence | Recommendation | Effort.
3. **Prioritized roadmap** — what to fix in the next sprint, next month, next quarter.
4. **Open questions back to the owner** — anything the auditor needs clarified before completing the audit.

---

## 18. Auxiliary Context

- Memory files (point-in-time, may be stale): `project_newsletter_system.md`, `project_report_delivery_feasibility.md`, `project_report_interactive_backlog.md`, `user_gavin_goals.md`.
- Prior audit output commit: `89bcc70 fix: comprehensive system audit — 28 fixes across API, scripts, frontend`.
- Prior KB audit: commits `c4008a4` (11 duplicate articles, 7 date mismatches) and `0010632` (19 URL-duplicates found in second pass). Auditor may want to verify remediation held.

---

*End of audit brief. Paste above into a fresh Claude chat with the prompt:*

> *"Please perform a comprehensive audit of this system per §16 and deliver §17. Be rigorous, skeptical, and specific."*
