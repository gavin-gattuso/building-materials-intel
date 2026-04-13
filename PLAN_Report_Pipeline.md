# Building Materials Report — Implementation Plan

**Goal:** Produce a publication-ready Building Materials & Products Market Health Report that matches the quality and structure of the 2025 YTD PDF, with an automated pipeline from knowledge base to final output.

**Target:** June 2026 publication  
**Approach:** Method 1 (HTML → PDF) first, then layer interactivity (Method 2)  
**Constraints:** VS Code + Claude Code native. No ThinkCell. No new external service signups.

---

## What Already Exists

| Asset | Status | Location |
|---|---|---|
| 24-page reference PDF | ✅ Ready | `site/public/reports/AV_Building Materials  Products_Report_2025YTD.pdf` |
| Knowledge base (353 articles) | ✅ Ready | `knowledge-base/` + Supabase |
| AV brand colors + logo | ✅ Ready | `lib/docx-formatting.ts`, `site/public/av-logo.png` |
| Financial ratios pipeline | ✅ Ready | `scripts/update-financial-ratios.ts` (Yahoo Finance → Supabase) |
| Weekly summary generator | ✅ Ready | `scripts/generate-weekly-summary.ts` (Claude → Supabase) |
| DOCX report builder | ✅ Ready | `api/build-report.ts` + `lib/docx-formatting.ts` |
| Static JSON build | ✅ Ready | `site/build-static.ts` (earnings, ratios, reports, weekly summary) |
| POC HTML template | ✅ Ready | `site/public/reports/poc-drivers-section.html` (Drivers section, 2 pages) |
| Chart rendering | ❌ Not started | No charting library installed |
| FRED data pipeline | ❌ Not started | No script to fetch macro data |
| Full HTML template | ❌ Not started | Only Drivers section exists |
| Automated content generation | ⚠️ Blocked | `ANTHROPIC_API_KEY` not set in environment |

---

## Phase 1: Data Foundation (Week 1)

**Goal:** Get all the raw data the report needs into structured JSON files, so the template can consume them without manual data entry.

### 1.1 — Create FRED Data Fetcher
**File:** `scripts/fetch-fred-data.ts`  
**What it does:** Pulls time-series data from the FRED API (free, public, no key required for low-volume use) for the 6 chart datasets referenced in the PDF:

| Chart (PDF Figure) | FRED Series IDs |
|---|---|
| Federal Funds Rate + 30Y Mortgage (Fig 2) | `FEDFUNDS`, `MORTGAGE30US` |
| Construction Employment (Fig 3) | `USCONS` |
| Building Materials PPI indices (Fig 4) | `WPUSI012011` (construction materials), `WPU0811` (lumber), `PCU331331` (metals), `PCU327310327310` (cement) |
| Housing Permits + Starts (Fig 6) | `PERMIT`, `HOUST` |
| Non-Residential Construction Spend (Fig 8) | `TLNRESCONS` |
| GDP + Consumer Confidence (Fig 10) | `GDP`, `UMCSENT` |

**Output:** `site/public/data/fred-charts.json` — keyed by chart ID, each containing `{ series: [{ date, value }], metadata }`.

**Why first:** Charts are the single biggest gap in the POC. Without data, we can't render them. FRED is free and has no signup requirement for JSON API access.

### 1.2 — Extend Financial Ratios Export
**File:** Modify `site/build-static.ts`  
**What it does:** The existing `financial-ratios.json` already has per-company metrics. Extend it to also export a **segment-aggregated view** matching the PDF's pages 18-21 format:
- Revenue Growth YoY by company, grouped by segment
- COGS/Sales % with YoY delta
- SG&A/Sales % with YoY delta  
- EBITDA Margin % with YoY delta

**Output:** `site/public/data/company-performance.json`

**Why:** Pages 14-21 of the report are dense financial tables. This data already exists in Supabase — it just needs to be shaped for the template.

### 1.3 — Extract Market Driver Signals
**File:** `scripts/export-driver-signals.ts`  
**What it does:** Reads the 7 market driver wiki files (`knowledge-base/wiki/market-drivers/*.md`), extracts frontmatter (`current_signal`, trend, level, forecast), and writes a structured JSON.

**Output:** `site/public/data/driver-signals.json`

**Why:** The Drivers of Market Health table on page 6 is data-driven. The wiki files already have the signal data — this just makes it machine-readable for the template.

### Phase 1 Deliverable
Three new JSON files in `site/public/data/` containing all data the report needs. No manual data entry — everything sourced from FRED, Supabase, or the knowledge base.

---

## Phase 2: Chart Rendering (Week 1-2)

**Goal:** Generate all 10+ charts from the PDF as static images or inline SVGs that can be embedded in the HTML template.

### 2.1 — Install Chart.js + Node Canvas
```bash
npm install chart.js chartjs-node-canvas
```
**Why Chart.js over matplotlib:** Stays in the Node/Bun ecosystem (no Python dependency for the build pipeline). `chartjs-node-canvas` renders Chart.js to PNG/SVG on the server side without a browser.

### 2.2 — Create Chart Generator Script
**File:** `scripts/generate-report-charts.ts`  
**What it does:** Reads `fred-charts.json` and `company-performance.json`, renders each chart to a PNG file using Chart.js with AV brand styling:

| Chart | Type | AV Style Notes |
|---|---|---|
| Federal Funds + Mortgage Rate | Dual line | Dark green + medium green lines, gray gridlines |
| Construction Employment | Single line | Medium green fill area |
| Building Materials PPI | Multi-line (4 series) | Color-coded by material type |
| Housing Permits + Starts | Dual line | Dashed vs solid |
| Non-Res Construction Spend | Stacked area or grouped bar | Segment colors |
| GDP + Consumer Confidence | Dual-axis line | Left axis GDP, right axis sentiment |
| Share Price YTD Returns | Line (3 series) | S&P 500, Materials, Products |
| Revenue Growth Waterfall | Horizontal bar by company | Segment-colored, sorted |
| COGS/Sales Comparison | Horizontal bar + delta | Green/red delta indicators |
| SG&A/Sales Comparison | Horizontal bar + delta | Same pattern |
| EBITDA Margin Comparison | Horizontal bar + delta | Same pattern |

**Output:** `site/public/reports/charts/*.png` — one file per chart, sized for 8.5x11 landscape embedding.

**Style config:** Create `lib/chart-theme.ts` with AV colors, Arial font, consistent axis formatting, matching the PDF's visual language.

### Phase 2 Deliverable
All 11 charts rendered as PNGs, styled to match the PDF. Each chart is a standalone file that drops into the HTML template via `<img>` tags.

---

## Phase 3: Full HTML Template (Week 2-3)

**Goal:** Expand the POC into a complete 24-page report template.

### 3.1 — Template Architecture
**File:** `scripts/build-report-html.ts`  
**What it does:** Reads all JSON data files + chart images and assembles a single self-contained HTML file.

**Template sections (matching PDF page-by-page):**

| Page(s) | Section | Data Source | Complexity |
|---|---|---|---|
| 1 | Cover page | Static (title, authors, date, logo) | Low |
| 2 | Table of Contents | Auto-generated from sections | Low |
| 3 | Introduction & Executive Summary | AI-generated or manual text | Medium |
| 4 | Market Scope (key risks) | `driver-signals.json` + KB | Medium |
| 5 | Market Context & Outlook | AI-generated or manual text | Medium |
| 6 | Drivers of Market Health table | `driver-signals.json` | **Done (POC)** |
| 7-11 | Driver deep-dives (7 drivers) | `driver-signals.json` + charts | Medium |
| 12 | Public Company Performance narrative | AI-generated or manual text | Medium |
| 13 | Trend Continuity + How AV Can Help | AI-generated or manual text | Low |
| 14-16 | Company snapshot tables | `company-performance.json` | High (complex table layout) |
| 17 | Revenue overview by segment | `company-performance.json` + chart | Medium |
| 18 | Revenue Growth YoY | `company-performance.json` + chart | Medium |
| 19 | COGS/Sales | `company-performance.json` + chart | Medium |
| 20 | SG&A/Sales | `company-performance.json` + chart | Medium |
| 21 | EBITDA Margin | `company-performance.json` + chart | Medium |
| 22-24 | Appendix | Static + contact info | Low |

### 3.2 — CSS Print Stylesheet
Extend the POC's CSS to handle all 24 pages with precise page breaks, running headers/footers, and consistent margins. Key additions:
- `@page` rules for landscape 8.5x11
- Named page regions for headers/footers
- Forced page breaks between major sections
- Table row orphan/widow control (no split rows across pages)

### 3.3 — PDF Generation Script
**File:** `scripts/export-report-pdf.ts`  
**What it does:** Uses Playwright (already installed as a dev dependency for MCP) to open the assembled HTML and call `page.pdf()` with precise landscape settings.

```
HTML file → Playwright headless browser → page.pdf() → final PDF
```

**Why Playwright over browser Ctrl+P:** Reproducible, scriptable, handles page breaks precisely, can be run in CI. Already available in the project.

### Phase 3 Deliverable
A single command (`bun scripts/build-report-html.ts && bun scripts/export-report-pdf.ts`) that produces a complete, branded, 24-page PDF from data files + charts.

---

## Phase 4: Content Generation Pipeline (Week 3)

**Goal:** Automate the narrative text (executive summary, driver analysis, company commentary) so the report doesn't require manual writing.

### 4.1 — Set ANTHROPIC_API_KEY
**Action:** Add `ANTHROPIC_API_KEY` to Vercel env vars and local `.env`.  
**Unblocks:** All AI synthesis endpoints + Method 4 (chat interface).

### 4.2 — Section-by-Section AI Writer
**File:** `scripts/generate-report-content.ts`  
**What it does:** For each narrative section of the report, queries the knowledge base for relevant articles, then sends them to Claude with a section-specific prompt to generate polished prose matching the PDF's analytical tone.

| Section | KB Query | Prompt Focus |
|---|---|---|
| Executive Summary | All articles from period, driver signals | High-level market overview, 2-3 paragraphs |
| Market Context & Outlook | Category: macro, demand, policy | Forward-looking synthesis |
| Driver deep-dives (×7) | Articles tagged to each driver | Data-driven narrative with specific figures |
| Public Company Performance | Financial ratios + earnings articles | Segment-level performance comparison |
| Trend Continuity | Compare current vs prior period signals | Variances from expectation, outlook shifts |

**Output:** `site/public/data/report-content.json` — keyed by section, containing the generated narrative text.

**Quality control:** Each section includes source article references so a human reviewer can verify claims against the KB.

### 4.3 — One-Command Report Generation
**File:** `scripts/generate-full-report.ts`  
**What it does:** Orchestrates the entire pipeline end-to-end:

```
1. fetch-fred-data.ts          → data/fred-charts.json
2. export-driver-signals.ts    → data/driver-signals.json
3. (build-static.ts already runs) → data/company-performance.json
4. generate-report-content.ts  → data/report-content.json  (requires API key)
5. generate-report-charts.ts   → reports/charts/*.png
6. build-report-html.ts        → reports/report-YYYY-MM.html
7. export-report-pdf.ts        → reports/report-YYYY-MM.pdf
```

Single command: `bun scripts/generate-full-report.ts`

### Phase 4 Deliverable
A fully automated pipeline: one command produces a publication-ready PDF with AI-generated content, real data charts, and AV branding. Human review is the only manual step.

---

## Phase 5: Interactive Web Version (Week 3-4, stretch goal)

**Goal:** Layer interactivity on top of the static report for Method 2 delivery.

### 5.1 — Interactive Report Page
**File:** `site/public/report.html` (or a new route in the existing site)  
**What it does:** Same content as the PDF but with:
- Chart.js rendered client-side with hover tooltips (show exact values on mouseover)
- Clickable company names → link to company profile pages on the existing site
- Collapsible driver sections (expand/collapse deep-dives)
- Sticky TOC sidebar for navigation

### 5.2 — Deploy as Vercel Page
The existing site auto-deploys from `main`. Adding `report.html` to `site/public/` means it's live at `{site-url}/report.html` with zero additional config.

### 5.3 — Optional: Email-Gated Access
Add a simple email gate before showing the report (collect email → store in Supabase → show report). Enables tracking who's reading it without requiring a full auth system.

### Phase 5 Deliverable
A shareable URL with the full interactive report, deployed on the existing Vercel site.

---

## Execution Order & Dependencies

```
Phase 1 (Data)──────→ Phase 2 (Charts)──────→ Phase 3 (Template)──→ PDF output
                                                        ↑
Phase 4.1 (API Key)→ Phase 4.2 (AI Content)────────────┘
                                                        ↓
                                               Phase 5 (Interactive) → Web output
```

- Phases 1 and 4.1 can start immediately in parallel
- Phase 2 depends on Phase 1 (needs the data JSON files)
- Phase 3 depends on Phase 2 (needs the chart images)
- Phase 4.2 depends on 4.1 (needs the API key)
- Phase 3 can start with placeholder text and swap in AI content from Phase 4.2 when ready
- Phase 5 is incremental over Phase 3 and can be done after or skipped entirely for June

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| FRED API rate limits | Low | Medium | FRED allows 120 requests/minute without a key; our 6 series need ~12 calls. Can also register for a free API key if needed. |
| Chart.js server-side rendering issues on Windows | Medium | Medium | Fallback: use Playwright to render Chart.js in a headless browser page and screenshot. Already have Playwright. |
| AI-generated content quality | Medium | High | Build in a human review step. Output source references for every claim. Start with manual text from the existing PDF and progressively automate. |
| Company financial data gaps | Low | Medium | Yahoo Finance already working for 35 companies. The `update-financial-ratios.ts` script handles missing data gracefully. |
| Page break precision in CSS | Medium | Low | Playwright's `page.pdf()` gives much better control than browser print. Test iteratively with the first full draft. |
| API key not obtained by Phase 4 | Medium | High | Phase 3 can ship with manually written content (copy from PDF or write fresh). AI automation is an enhancement, not a blocker for June. |

---

## Replication Plan (Steel Report & Other Verticals)

Once this pipeline is built, spinning up a new vertical requires:

1. **New company list** — swap `TRACKED_COMPANIES` in `lib/constants.ts`
2. **New KB folder** — `knowledge-base-steel/` with same structure
3. **Same FRED data** — most macro charts (rates, GDP, PPI) apply across verticals; add sector-specific series
4. **New brand colors** — optional; can reuse AV branding or create a vertical-specific palette
5. **New prompts** — update the AI content generation prompts for sector-specific language

Estimated effort for a second vertical: **3-5 days** (vs 3-4 weeks for the first).

---

## Decision Points for Gavin

Before starting, these decisions would help scope the work:

1. **API key timeline** — Can `ANTHROPIC_API_KEY` be set this week? If yes, Phase 4 runs in parallel. If not, we build with manual content first and automate later.
2. **Chart fidelity target** — Should charts be pixel-perfect matches to the PDF, or is "same data, similar style, AV branded" sufficient?
3. **Content freshness** — Should the June report use 2025 YTD data (replicating the existing PDF) or 2026 YTD data (new report)?
4. **Interactive version priority** — Is Phase 5 (web version) a June deliverable or a post-June enhancement?
5. **Review workflow** — Who reviews the AI-generated content before publication? Just Gavin, or does it go through the full AV team (Jacob, Alex)?
