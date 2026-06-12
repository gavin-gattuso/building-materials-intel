# Building Materials & Products — H1 2026 Report Prep

Working artifacts for the **mid-year 2026 (H1 2026)** Market Health Report, framed as a postmortem on the 2025 YTD report (published Nov 2025).

**Due:** week of June 22–26, 2026 · **Authors:** Jacob Wozniewski, Gavin Gattuso · **Source of truth for predictions:** `site/public/reports/Building_Materials_Report_2025YTD.pdf`

| # | Artifact | What it is |
|---|----------|------------|
| 01 | [Prediction Scorecard](01-prediction-scorecard.md) | Every forward call from the last report, scored against H1 2026 actuals. Backbone of the new Postmortem section. |
| 02 | [M&A Digest](02-mna-digest-h1-2026.md) | The H1 2026 deal wave + Berkshire housing bet, organized for the M&A callout box. |
| 03 | [Lever-by-Lever Delta](03-lever-by-lever-delta.md) | Each of the 7 drivers: what the last report said vs. what the KB recorded, with backing articles. |
| 04 | [Report Outline](04-report-outline-h1-2026.md) | Section-by-section outline for the H1 2026 draft, marking what changes vs. last edition. |
| 05 | [Draft v0.1 (skeleton)](05-draft-h1-2026.md) | First block-text draft with editorial annotations (KEEP/REFRESH tags, open decisions). |
| 06 | [Report manuscript](06-report-manuscript-h1-2026.md) | **Publication-prose draft** — clean §1–9 + appendix, all figures filled from KB. Only gaps: 4 AV case studies + §7 financial vintage. Source text for the .docx. |
| — | `H1_2026_Report_DRAFT.docx` | AV-branded render of the manuscript (driver trend table, scorecard, callouts). Regenerate with `bun scripts/build-h1-2026-report-docx.ts`. |
| — | `H1_2026_Report.html` | **Interactive HTML edition** — AV green design system, sidebar nav, Chart.js visuals (mortgage-rate volatility, ABI, segment revenue-growth bar, postmortem scorecard donut). Self-contained; open in any browser. Move to `site/public/reports/` to deploy. |
| 07 | [Print HTML](H1_2026_Report_Print.html) → `H1_2026_Report_DRAFT.pdf` | **PDF first draft, built off the 2025 YTD edition** — mirrors that report's exact structure & voice (cover, TOC, Intro/Exec Summary, Market Scope, Context & Outlook, Drivers with *Impact/Implication* format, Performance + Themes, **Trend Continuity & Retrospective = the postmortem**, How AV Can Help, Performance Detail, Appendix). ~17pp. Regenerate: see command below. |

## The one-line story for this edition
Our directional calls were mostly right (residential weak, tariffs a real cost threat, infra resilient, M&A active) — but the last report **missed the two storylines that came to define H1 2026: the data-center/AI-infrastructure construction boom, and the scale of the M&A wave capped by Berkshire's $8.5B bet on homebuilding.** And our base case of "easing takes hold → residential recovers into 2026" did **not** arrive on schedule; rates stayed higher and more volatile.

> All H1 2026 evidence below is drawn from the live KB (Supabase `articles`, 687 articles Jan–Jun 2026). Figures are sourced inline; verify the starred ⚠ items before publication.

## Regenerate the PDF (with embedded charts)
Two steps, no extra dependencies. `H1_2026_Report_Print.html` is the prose template (with `{{CHART:*}}` tokens); `scripts/build-h1-2026-charts.mjs` injects inline-SVG charts (verified KB data — mortgage-rate volatility, steel price, ABI, segment revenue growth, postmortem donut) into `H1_2026_Report_print_built.html`; headless Chrome renders that to PDF.
```powershell
# from repo root
node scripts/build-h1-2026-charts.mjs
$dir = "knowledge-base\outputs\h1-2026-prep"
$uri = ([System.Uri]((Resolve-Path "$dir\H1_2026_Report_print_built.html"))).AbsoluteUri
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --no-pdf-header-footer `
  "--user-data-dir=$env:TEMP\chrome_pdf_profile" "--print-to-pdf=$dir\H1_2026_Report_DRAFT.pdf" $uri
```
Edit prose in `H1_2026_Report_Print.html` or chart data in `scripts/build-h1-2026-charts.mjs`, then re-run both steps.
