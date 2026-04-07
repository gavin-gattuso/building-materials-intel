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
- Files: `site/server.ts`, `site/kb.ts`, `site/public/index.html`
- Features: Dashboard, Articles search, Company profiles, Market Drivers, Concepts, AI Chat
- Chat mode: Smart Search (no API key needed). Set ANTHROPIC_API_KEY env var to enable AI synthesis mode.
- Auto-refreshes KB data every 60 seconds

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

