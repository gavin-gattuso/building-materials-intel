# Building Materials & Building Products Intelligence Platform

## What This System Is

This is an automated intelligence platform built to develop a **comprehensive, reliable knowledge base** for the Building Materials & Building Products industry. The ultimate goal is to support a **bi-annual report** I produce at Applied Value by ensuring Claude has access to a deep, curated, and continuously growing repository of industry data -- not just headlines, but structured financial metrics, company profiles, market driver analysis, and AI-tagged article relevance scores.

## The Core Problem It Solves

Rather than manually researching hundreds of sources every six months when report time comes, this system **captures and archives industry news daily**, building an ever-growing knowledge base that can be queried, searched, and synthesized on demand. By the time I need to write the report, the KB already contains months of curated, deduplicated, source-verified articles organized by company, category, and report section.

---

## How It Works (End-to-End)

### 1. Daily Automated Ingestion (Nightly at 11:59 PM EDT)

A scheduled trigger on Anthropic's cloud fires every night and calls the `/api/daily-scan` endpoint. This:

- **Fetches RSS feeds** from Google News using 3 parameterized queries covering building materials news, tariffs/lumber/steel pricing, and the 39 tracked companies
- **Filters by source whitelist** -- only articles from ~35+ approved domains are accepted (Reuters, Bloomberg, WSJ, CNBC, Construction Dive, ENR, NAHB, Yahoo Finance, Seeking Alpha, etc.) organized into 8 tiers from major news down to construction niche publications
- **Deduplicates** against existing articles by exact URL match and title-phrase similarity (first 5 words + same date) to prevent syndication duplicates
- **Categorizes** each article into one of 10 buckets: Earnings, Tariffs, M&A, Infrastructure, Monetary Policy, Housing, Pricing, Labor, Credit, Economic
- **Matches companies** -- each article is checked against keyword patterns for all 39 tracked companies (e.g., "vulcan materials", "VMC", "martin marietta") and linked via a junction table
- **Summarizes** using Claude Haiku (200-word summaries preserving key numbers, names, and dates)
- **Archives** everything to Supabase (PostgreSQL)
- **Emails a briefing** -- groups the day's articles by category into a styled HTML email sent to my inbox

The trigger also runs supplemental web searches to catch articles the RSS feeds may have missed.

### 2. The Knowledge Base (Supabase PostgreSQL)

The database contains:

| Table | What It Holds |
|-------|--------------|
| `articles` | 350+ archived articles with slug, title, date, source, URL, category, content summary |
| `companies` | 39 company profiles with ticker, sector, subsector, detailed content |
| `market_drivers` | 7 market health drivers: Interest Rates, Labor, Material Costs, Demand, Infrastructure Spending, Credit, GDP |
| `concepts` | Foundational industry knowledge (cycles, supply chain, regulation, technology, sustainability) |
| `article_companies` | Junction table linking articles to matched companies |
| `financial_ratios` | Revenue LTM, Revenue Growth YoY, COGS/Sales %, SG&A/Sales %, EBITDA Margin % for all 39 companies |
| `earnings_calendar` | Upcoming/past earnings dates |
| `weekly_summaries` | AI-generated weekly digests with themes |
| `av_report_sections` | 9 sections mapping to the Applied Value report structure |
| `article_av_sections` | Each article tagged to relevant report sections with a relevance score |

### 3. The 39 Tracked Companies (by segment)

- **Aggregates & Cement:** CRH, CEMEX, Heidelberg Materials, Holcim, Martin Marietta, Taiheiyo Cement, Vulcan Materials
- **Glass & Insulation:** AGC, Owens Corning, Saint-Gobain
- **Wood & Lumber:** Canfor, Interfor, UFP Industries, West Fraser, Weyerhaeuser
- **Steel & Metals:** ArcelorMittal, Nucor, Steel Dynamics, Wienerberger
- **Building Products & Distribution:** Builders FirstSource, Carlisle Companies, Installed Building Products, Kingspan, QXO, RPM International
- **Doors, Windows & Security:** ASSA ABLOY, JELD-WEN, LIXIL, Sanwa Holdings
- **Plumbing, Drainage & Fixtures:** Advanced Drainage Systems, Geberit, Fortune Brands, Masco
- **HVAC & Climate:** Carrier Global, Daikin Industries, Johnson Controls, Trane Technologies
- **Retail & Distribution:** Home Depot, Lowe's

### 4. Financial Ratios (Yahoo Finance Integration)

A script fetches quarterly/annual financial data from Yahoo Finance for all 39 companies and calculates:

- Revenue LTM and YoY growth
- COGS/Sales % and YoY delta
- SG&A/Sales % and YoY delta
- EBITDA Margin % and YoY delta
- Anomaly flags when any metric changes >15% YoY (or >2-3 percentage points for ratios)

Each flagged anomaly is linked to relevant earnings articles in the KB for context.

### 5. Article Tagging to Report Sections

An AI tagging script maps every article to 9 Applied Value report sections using keyword matching, category alignment, and company relevance scoring:

1. **Intro / Executive Summary**
2. **Market Scope** (market size, TAM, segments)
3. **Market Context & Outlook** (macro conditions, trends)
4. **Drivers of Market Health** (the 7 drivers)
5. **Public Company Performance** (earnings, revenue, EBITDA, guidance)
6. **Positioning & EOY Outlook** (strategy, backlogs)
7. **Trend Continuity & Retrospective** (cycles, YoY patterns)
8. **How AV Can Help** (consulting, M&A, valuation angles)
9. **Public Company Snapshot** (stock prices, dividends, ratings)

Each article gets a relevance score per section (threshold: 0.15 minimum), so when it's time to write the report, I can pull all articles relevant to a specific section ranked by relevance.

### 6. The Intelligence Website

A live web platform provides:

- **Article search** with full-text search, synonym expansion, category/company filters
- **Company profiles** for all 39 companies
- **Market driver pages** for the 7 health indicators
- **Financial ratios dashboard** with interactive bar charts by company/segment
- **Earnings calendar**
- **Report section coverage** heatmap showing article density per section
- **Weekly AI summaries** with theme labels
- **AI Chat** -- ask questions about the knowledge base and get sourced answers (powered by Claude Sonnet, grounded in KB articles only)
- **Report generator** -- select a date range and generate an AI-synthesized report with 6 narrative sections, driver analysis, and category analysis

### 7. Report Generation

The report generation endpoint can produce full reports by:

- Pulling all articles in a date range from the KB
- Using Claude Sonnet to synthesize 6 narrative sections: Market Scope, Market Context, Company Snapshot, Share Price Analysis, Positioning, and Retrospective
- Analyzing all 7 market drivers with trend signals
- Analyzing all news categories
- Generating an executive summary and conclusion
- Outputting as an interactive HTML dashboard

---

## 8-Tier Source Whitelist

All articles must pass through this whitelist before entering the knowledge base:

1. **Major News:** Reuters, Bloomberg, WSJ, FT, NYT, WaPo, BBC, CNBC, Forbes, Fortune, AP
2. **Industry-Specific:** Construction Dive, BD+C, ENR, Remodeling Magazine, JLC, ProBuilder
3. **Company IR Pages:** All 39 companies' official investor relations sites
4. **Associations & Research:** NAHB, ABC, PCA, AISI, AGC, Construction Analytics, AIA, Conference Board, S&P Global Ratings
5. **Government & Data:** Census, BLS/PPI, BEA, FRED, Federal Reserve, USGS, Procore, BusinessWire/PR Newswire/GlobeNewsWire
6. **Financial Analysis:** Yahoo Finance, Seeking Alpha, MarketScreener (limited to these three)
7. **Consulting Firms:** Bain, Deloitte, PwC, KPMG, FMI Corp, Capstone Partners
8. **Construction Niche:** LBM Journal, Builder Online, Steel Market Update, Fastmarkets, For Construction Pros, ConstructConnect, Concrete Products, Pit & Quarry, Rock Products, CemNet, HousingWire, Data Center Dynamics, Roofing Contractor

---

## Why This Matters for the Bi-Annual Report

The entire system is designed so that when I sit down to write the Applied Value bi-annual Building Materials & Building Products report, I'm not starting from scratch. Instead:

1. **Months of daily-curated articles** are already archived, deduplicated, and source-verified
2. **Every article is pre-tagged** to the specific report section it's relevant to
3. **Financial metrics** are already calculated with anomaly flags
4. **Company and market driver context** is continuously maintained
5. **AI can synthesize any section** on demand, grounded entirely in the KB data

The goal is **institutional-quality data reliability** -- every claim traceable to an approved source, every financial metric sourced from Yahoo Finance with earnings date verification, every article passing through an 8-tier whitelist before entering the knowledge base.
