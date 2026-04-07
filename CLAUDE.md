# Building Materials & Building Products Newsletter

## Custom Commands
- `/jarvis-newsletter` -- Search for Building Materials & Building Products headlines, generate a comprehensive Word document (detailed research repository), and send a brief high-level email digest to gavin.gattuso@appliedvalue.com

## Trigger Phrases
When the user says "Jarvis run my newsletter" (or similar), invoke the `/jarvis-newsletter` skill. This defaults to Building Materials & Building Products industry coverage across both industry news and 7 market health drivers (Interest Rates, Labor, Material Costs, Demand, Infrastructure Spending, Credit, GDP).

## Daily Automated Task
A remote scheduled trigger (`building-materials-daily-review`, ID: `trig_015uykDko3ppsdJ7kNN5ezSW`) runs at 11:59 PM EDT every night on Anthropic's cloud (works even when laptop is off). It:
1. Searches for today's Building Materials & Building Products news
2. Filters through a 9-tier approved source whitelist
3. Archives EVERY article into a search-optimized knowledge base (KB_Raw HTML on SharePoint)
4. Deep dives all 35 tracked companies (KB_Companies HTML on SharePoint)
5. Curates top 10-15 stories into a briefing (Building_Materials_Briefing HTML on SharePoint)
6. Emails the digest to gavin.gattuso@appliedvalue.com
- Manage at: https://claude.ai/code/scheduled/trig_015uykDko3ppsdJ7kNN5ezSW

## Website / Intelligence Platform
- Run with: `bun run site` (http://localhost:3000)
- Deployed: Vercel (auto-deploys from `main` branch)
- Files: `site/server.ts`, `site/kb.ts`, `site/public/index.html`
- Features: Dashboard, Articles search, Company profiles, Market Drivers, Concepts, Financial Ratios, Reports, AI Chat
- Chat mode: Smart Search (no API key needed). Set ANTHROPIC_API_KEY env var to enable AI synthesis mode.
- Auto-refreshes KB data every 60 seconds

## Report Generation
- Custom intelligence reports generated as .docx via `/api/build-report` (POST)
- Formatting matches Applied Value YTD 2025 PDF style (green brand colors, Arial font, color-coded trend indicators)
- `api/build-report.ts` -- Dedicated Vercel serverless function (isolated from main API to avoid `docx` library bloating other endpoints)
- `lib/docx-formatting.ts` -- Shared formatting utilities (brand colors, heading styles, trend table, title block)
- Important: ESM imports in `api/` must use `.js` extensions for Vercel Node.js runtime compatibility

## Vercel API Endpoints
The main API (`api/index.ts`) handles all endpoints except build-report:
- `GET /api/stats` -- Article counts, category breakdown, company mentions
- `GET /api/mode` -- Whether AI synthesis is enabled
- `GET /api/articles?q=&category=&company=&limit=` -- Search/filter articles
- `GET /api/article/{slug}` -- Full article detail
- `GET /api/wiki?type=company|market-driver|concept` -- Wiki page listings
- `GET /api/wiki/{slug}` -- Full wiki page content
- `GET /api/weekly-summary` -- Latest AI-generated weekly digest
- `GET /api/financial-ratios?period=` -- Financial metrics for all 35 companies
- `GET /api/financial-ratio-flags?period=` -- Flagged >15% YoY changes with linked articles
- `GET /api/av-sections` -- 9 Applied Value report sections
- `GET /api/av-sections/{slug}` -- Section detail with tagged articles and relevance scores
- `GET /api/av-coverage` -- Article coverage counts per report section
- `POST /api/chat` -- Smart search or AI synthesis (body: {message, history})
- `POST /api/synthesize-section` -- AI synthesis for report sections
- `POST /api/executive-summary` -- AI-generated executive summary
- `POST /api/build-report` -- Generates .docx report (separate serverless function in `api/build-report.ts`)

## Database (Supabase)
- All data served from Supabase (PostgreSQL) -- articles, companies, market_drivers, concepts, financial_ratios, weekly_summaries, av_report_sections, article_av_sections, earnings_calendar
- Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
- Migration scripts in `scripts/` (migrate-to-supabase.ts, migrate-av-reports-schema.ts, etc.)

## Scripts
- `scripts/push-to-supabase.ts` -- Upload parsed KB to Supabase
- `scripts/update-financial-ratios.ts` -- Fetch Yahoo Finance data, calculate metrics, flag changes
- `scripts/generate-weekly-summary.ts` -- AI weekly digest (runs Friday via trigger)
- `scripts/tag-articles-with-av-sections.ts` -- AI-tag articles to 9 AV report sections
- `scripts/fetch-fy2025.ts` / `fetch-cogs-sga.ts` -- Financial data fetchers
- `scripts/lint-kb.ts` -- Validate KB markdown frontmatter

## Static Build
- `site/build-static.ts` -- Generates static JSON files at build time (earnings-calendar.json, reports.json, financial-ratios.json, weekly-summary.json)
- Vercel build command: `npm install && npx bun site/build-static.ts`

## Knowledge Base Structure
- `knowledge-base/raw/articles/` -- 353+ markdown articles with YAML frontmatter (date, source, url, category, companies, tags)
- `knowledge-base/wiki/companies/` -- 39 company profiles
- `knowledge-base/wiki/market-drivers/` -- 7 market health driver pages
- `knowledge-base/wiki/concepts/` -- 6 concept/analysis pages
- `knowledge-base/wiki/indexes/` -- MASTER-INDEX.md, COMPANY-INDEX.md, etc.
- `knowledge-base/outputs/` -- Generated briefings and reports

## 35 Tracked Companies (by segment)
**Aggregates & Cement:** CRH, CEMEX, Heidelberg Materials, Holcim, Martin Marietta, Taiheiyo Cement, Vulcan Materials
**Glass & Insulation:** AGC, Owens Corning, Saint-Gobain
**Wood & Lumber:** Canfor, Interfor, UFP Industries, West Fraser, Weyerhaeuser
**Steel & Metals:** ArcelorMittal, Nucor, Steel Dynamics, Wienerberger
**Building Products & Distribution:** Builders FirstSource, Carlisle Companies, Kingspan, QXO
**Doors, Windows & Security:** ASSA ABLOY, JELD-WEN, LIXIL, Sanwa Holdings
**Plumbing, Drainage & Fixtures:** Advanced Drainage Systems, Geberit, Fortune Brands, Masco
**HVAC & Climate:** Carrier Global, Daikin Industries, Johnson Controls, Trane Technologies

## 9-Tier Source Whitelist
1. Major News (Reuters, Bloomberg, WSJ, FT, NYT, WaPo, BBC, CNBC, Forbes, Fortune, AP)
2. Top Publications (TechCrunch, Verge, Wired, Ars Technica, MIT Tech Review, VentureBeat, ZDNet, CNET)
3. Industry-Specific (Construction Dive, BD+C, ENR, Remodeling Magazine, JLC, ProBuilder)
4. Company IR Pages (all 35 companies' official investor relations sites)
5. Associations & Research (NAHB, ABC, PCA, AISI, AGC, Construction Analytics, AIA, Conference Board, S&P Global Ratings)
6. Government & Data (Census, BLS/PPI, BEA, FRED, Federal Reserve, USGS, Procore, BusinessWire/PR Newswire/GlobeNewsWire)
7. Financial Analysis (Yahoo Finance, Seeking Alpha, MarketScreener -- limited to these three)
8. Consulting Firms (Bain, Deloitte, PwC, KPMG, FMI Corp, Capstone Partners)
9. Construction Niche (LBM Journal, Builder Online, Steel Market Update, Fastmarkets, For Construction Pros, ConstructConnect, Concrete Products, Pit & Quarry, Rock Products, CemNet, HousingWire, Data Center Dynamics, Roofing Contractor)

