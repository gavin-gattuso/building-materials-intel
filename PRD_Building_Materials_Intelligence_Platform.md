# Product Requirements Document
## Building Materials & Products Intelligence Platform

**Prepared by:** Applied Value — Gavin Gattuso
**Date:** April 7, 2026
**Status:** Live & Operational

---

## 1. Product Overview

The Building Materials Intelligence Platform is an AI-powered research and monitoring system that automatically tracks, analyzes, and reports on the building materials and building products industry. It eliminates the manual work of news monitoring, company tracking, financial analysis, and report creation — delivering continuously updated intelligence to support Applied Value's semi-annual industry report and day-to-day advisory work.

**Core value proposition:** What previously required hours of manual research each week now happens automatically, 24/7, with AI-powered synthesis available on demand.

---

## 2. The Problem It Solves

| Challenge | Before | After |
|---|---|---|
| **Industry monitoring** | Manual daily scanning of 50+ sources | Automated nightly ingestion from 9-tier curated source whitelist |
| **Company tracking** | Spreadsheet-based, updated quarterly | 35 companies tracked daily with earnings, financials, and news |
| **Market driver analysis** | Assembled manually per report cycle | 7 drivers continuously updated with direction signals |
| **Report creation** | Weeks of research, writing, formatting | AI-generated custom reports in under 2 minutes |
| **Knowledge retention** | Scattered across emails, bookmarks, files | Centralized searchable knowledge base of 353+ articles |
| **Team onboarding** | Read past reports, ask colleagues | Self-serve dashboard with AI chat for instant answers |

---

## 3. Automated Intelligence Pipeline

### 3.1 Nightly Data Collection (Runs at 11:59 PM EDT, Every Night)

A cloud-based scheduled task runs automatically — even when all computers are off — performing the following:

1. **Searches** for the day's Building Materials & Building Products news across all approved sources
2. **Filters** through a 9-tier approved source whitelist (80+ named sources from Reuters/Bloomberg down to industry-specific publications)
3. **Archives** every qualifying article into a search-optimized knowledge base
4. **Deep-dives** all 35 tracked companies for company-specific developments
5. **Curates** the top 10-15 stories into a daily briefing
6. **Emails** the digest automatically

**Impact:** The team starts every morning with a comprehensive, pre-filtered view of what happened in the industry overnight. No articles are missed, no sources are forgotten.

### 3.2 Weekly AI Summary

Every week, AI synthesizes the week's articles into a 2-3 paragraph digest highlighting:
- Dominant themes across the industry
- Notable company developments
- Market driver shifts
- Clickable theme tags that filter directly to relevant articles

### 3.3 Financial Ratio Tracking

Automated financial data pipeline for all 35 companies:
- Pulls from Yahoo Finance API
- Tracks 5 key metrics: Revenue, Revenue Growth, COGS/Sales, SG&A/Sales, EBITDA Margin
- Calculates year-over-year deltas
- **Flags** metrics that surge or drop >15% and links to the articles explaining why
- Updates automatically post-earnings with "Pending" badges for companies that haven't reported yet

---

## 4. Website & Dashboard

The platform is a live web application (deployed on Vercel, auto-deploys from code changes) with 8 main sections:

### 4.1 Dashboard
- **At-a-glance stats**: Total articles, companies tracked, category breakdown
- **Weekly AI Summary**: AI-generated digest with clickable theme tags
- **Latest articles**: Most recent additions with source, date, category
- **Earnings calendar**: Upcoming earnings dates for all 35 companies

### 4.2 Articles
- **Full-text search** across 353+ articles with instant results
- **Filter by category**: Earnings & Financials, M&A, Market Analysis, Infrastructure, Tariffs & Trade, etc.
- **Filter by company**: See all articles mentioning a specific company
- **Article detail view**: Full content with metadata, source links, and company tags

### 4.3 Companies
- **35 company profiles** organized across 8 industry segments:
  - Aggregates & Cement (7 companies)
  - Glass & Insulation (3)
  - Wood & Lumber (5)
  - Steel & Metals (4)
  - Building Products & Distribution (4)
  - Doors, Windows & Security (4)
  - Plumbing, Drainage & Fixtures (4)
  - HVAC & Climate (4)
- Each profile includes sector positioning, recent developments, and strategic context

### 4.4 Market Drivers
- **7 continuously monitored drivers** with color-coded direction signals:
  1. Interest & Mortgage Rates
  2. Labor Dynamics
  3. Material & Energy Costs
  4. Demand Visibility
  5. Government Infrastructure Spending
  6. Credit Availability & Lending Standards
  7. GDP Growth & Consumer Confidence
- Each driver has: current direction (Positive/Neutral/Negative), detailed analysis, impact assessment, and supporting data points

### 4.5 Financial Ratios
- **Interactive visualization** of financial metrics across all 35 companies
- Period selector (H1/H2 reporting cycles)
- 5 toggleable metrics with bar charts and YoY delta indicators
- Segment color-coding with click-to-filter
- Flagged changes (>15% YoY) linked to explanatory articles
- Split view: Building Materials vs. Building Products companies

### 4.6 Reports
- **Custom AI-generated reports** (see Section 5 below)
- **Published report archive**: Downloadable PDFs of past Applied Value reports
- **AV Report Section coverage mapping**: Shows how many articles are tagged to each of the 9 report sections with relevance scores

### 4.7 AI Chat
- **Ask questions in plain English** about anything in the knowledge base
- Two modes:
  - **Smart Search** (always available): Synonym-expanded search with relevance scoring, recency boost, and excerpt highlighting
  - **AI Synthesis** (with API key): Claude-powered answers that synthesize across multiple sources with numbered citations
- Pre-built suggestion prompts for common queries
- Full conversation history maintained within session

### 4.8 Concepts
- Deep-dive analysis pages on cross-cutting industry topics
- Provides foundational context that spans multiple companies and drivers

---

## 5. Report Generation

### The Workflow (Under 2 Minutes)

1. **Select date range** (defaults to last 6 months)
2. **Click "Generate Report"**
3. **Watch real-time progress** as the system:
   - Checks article coverage for the date range
   - Synthesizes 6 news category sections (each with top articles, analysis, and data points)
   - Synthesizes 7 market driver sections (each with direction, signal, content, impact, data points)
   - Writes an executive summary tying everything together
   - Builds and downloads a formatted Word document
4. **Open the .docx** — ready for review and distribution

### Document Formatting

The generated report matches Applied Value's official brand guidelines (based on the YTD 2025 Building Materials & Products Report):
- Applied Value green color scheme and branding
- Arial font family throughout
- Professional title page with company info and date range
- **Drivers of Market Health summary table** with color-coded trend indicators (Green=Positive, Amber=Neutral, Red=Negative)
- Individual driver deep-dives with impact assessments and data points
- Industry news organized by category with article citations and source links
- Page headers and footers with page numbers
- Executive summary synthesizing all sections

### What This Replaces

Previously, assembling a building materials report required:
- Manually reviewing dozens of sources over weeks
- Writing section-by-section in PowerPoint/Word
- Formatting tables, charts, and citations by hand
- Multiple review cycles for consistency

Now: the platform has been continuously collecting and analyzing articles. The report generation pulls from this living knowledge base and synthesizes it on demand.

---

## 6. AI Capabilities (Pending API Key Activation)

### Current State: Smart Search
- Works without any API key
- Synonym expansion (e.g., "tariff" also searches "duties, trade policy, import tax")
- Industry-aware search (e.g., "cement" also finds "concrete, aggregates, ready-mix")
- Relevance scoring with title match boosting (+30pts), metadata match (+20pts), recency bonus
- Excerpt extraction highlighting matched terms

### With API Key: Full AI Synthesis
- **Chat**: Ask "What are the top risks for residential-focused building materials companies?" and get a multi-paragraph answer with specific data points, company names, and numbered source citations
- **Report sections**: AI generates narrative analysis for each news category and market driver, extracting key themes and supporting data
- **Executive summaries**: AI synthesizes all section summaries into a cohesive 2-3 paragraph overview with forward-looking outlook
- **Model**: Claude Sonnet with full knowledge base context (353+ articles, 35 company profiles, 7 driver analyses)

---

## 7. Data Architecture

### Knowledge Base
| Asset | Count | Description |
|---|---|---|
| Articles | 353+ | Full-text with YAML frontmatter (date, source, URL, category, companies, tags) |
| Company Profiles | 35 | Across 8 segments with sector, subsector, strategic positioning |
| Market Drivers | 7 | With direction signals, analysis, and data points |
| Concepts | 6 | Deep-dive cross-cutting analysis pages |
| Report Sections | 9 | Mapped to Applied Value report structure with article relevance scores |

### Source Coverage (9-Tier Whitelist)
1. **Major News**: Reuters, Bloomberg, WSJ, FT, NYT, WaPo, BBC, CNBC, Forbes, Fortune, AP
2. **Top Publications**: TechCrunch, Verge, Wired, Ars Technica, MIT Tech Review
3. **Industry-Specific**: Construction Dive, BD+C, ENR, Remodeling Magazine, JLC, ProBuilder
4. **Company IR**: All 35 companies' official investor relations pages
5. **Associations**: NAHB, ABC, PCA, AISI, AGC, AIA, Conference Board, S&P Global Ratings
6. **Government & Data**: Census, BLS/PPI, BEA, FRED, Federal Reserve, USGS
7. **Financial Analysis**: Yahoo Finance, Seeking Alpha, MarketScreener
8. **Consulting Firms**: Bain, Deloitte, PwC, KPMG, FMI Corp, Capstone Partners
9. **Construction Niche**: LBM Journal, Steel Market Update, Fastmarkets, HousingWire, and 10+ others

### Infrastructure
- **Database**: Supabase (PostgreSQL) with full-text search
- **Hosting**: Vercel (auto-deploys from GitHub on every push)
- **Automation**: Anthropic cloud-based scheduled triggers (runs even when laptop is off)
- **Financial Data**: Yahoo Finance API for earnings and ratios

---

## 8. Impact Summary

### Time Savings
| Task | Manual Effort | With Platform |
|---|---|---|
| Daily news monitoring | 1-2 hours/day | Automated (0 minutes) |
| Weekly industry summary | 2-3 hours/week | Automated + AI digest |
| Finding a specific article or data point | 15-30 minutes | Instant search (<1 second) |
| Assembling semi-annual report draft | 2-4 weeks | Under 2 minutes |
| Tracking 35 company financials | 1-2 days/quarter | Automated with flags |
| Answering ad-hoc industry questions | 30-60 minutes research | AI Chat instant response |

### Quality Improvements
- **No articles missed**: 9-tier whitelist ensures comprehensive source coverage
- **Always current**: Knowledge base updates every night automatically
- **Consistent analysis**: Same framework applied to every driver and company
- **Institutional memory**: Every article archived and searchable forever — knowledge doesn't walk out the door
- **Faster client response**: Can answer building materials questions in real-time during meetings

### Strategic Value
- **Positions Applied Value as a technology-forward advisory firm** with proprietary intelligence capabilities
- **Scales expertise**: Junior team members can access the same depth of industry knowledge as senior analysts
- **Report differentiation**: AI-synthesized reports backed by comprehensive, continuously updated data
- **Client deliverable**: The platform itself (or reports from it) can be shared with clients as a value-add

---

## 9. Roadmap & Future Capabilities

| Priority | Feature | Status |
|---|---|---|
| **Now** | Full platform operational with Smart Search | Live |
| **Next** | Enable AI Synthesis mode (add ANTHROPIC_API_KEY) | Awaiting key |
| **Next** | AI Chat with source-cited answers | Ready (pending key) |
| **Next** | AI-powered report generation with narrative sections | Ready (pending key) |
| **Future** | Client-facing read-only dashboard | Planned |
| **Future** | Custom alerts for specific companies or topics | Planned |
| **Future** | Competitor intelligence tracking | Planned |
| **Future** | Integration with Applied Value CRM/deal pipeline | Planned |
