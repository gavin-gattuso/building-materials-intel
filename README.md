# Building Materials & Building Products Intelligence Platform

Industry intelligence system that tracks 35 companies across the building materials sector, curates daily news, and serves an interactive knowledge base.

## Prerequisites

- [Bun](https://bun.sh) (v1.3+) - JavaScript runtime
- [Node.js](https://nodejs.org) (v20+) - for Vercel deployment
- A [Supabase](https://supabase.com) project (for the deployed API)
- [Claude Code](https://claude.ai/code) - for the automated daily newsletter trigger

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/gavin-gattuso/building-materials-intel.git
cd building-materials-intel

# 2. Install dependencies
bun install

# 3. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your actual keys (see Environment Variables below)

# 4. Run the local site
bun run site
# Opens at http://localhost:3000
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

| Variable | Required | Used By | Description |
|----------|----------|---------|-------------|
| `SUPABASE_ACCESS_TOKEN` | Yes (scripts) | `push-to-supabase.ts`, `.mcp.json` | Supabase Management API personal access token |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (scripts + API) | `sync-local-to-supabase.ts`, `api/index.ts` | Supabase project service role key |
| `SUPABASE_URL` | Yes (API) | `api/index.ts` | Supabase project URL (default: `https://pmjqymxdaiwfpfglwqux.supabase.co`) |
| `ANTHROPIC_API_KEY` | Optional | `site/server.ts`, `api/index.ts` | Enables AI-powered chat; without it, site uses smart search mode |

On Vercel, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `ANTHROPIC_API_KEY` in the project environment variables.

## Project Structure

```
site/                   # Local dev server (Bun)
  server.ts             # HTTP server with KB search + optional AI chat
  kb.ts                 # Knowledge base loader (reads markdown files)
  public/               # Frontend (HTML, CSS, JS)
api/                    # Vercel serverless API (reads from Supabase)
  index.ts              # All API routes: /api/stats, /api/articles, /api/chat, etc.
knowledge-base/         # All content (tracked in git)
  raw/articles/         # 353+ markdown articles with YAML frontmatter
  wiki/companies/       # 39 company profiles
  wiki/market-drivers/  # 7 market health driver pages
  wiki/concepts/        # 6 concept/analysis pages
  wiki/indexes/         # Master indexes
  outputs/              # Generated briefings and reports
scripts/                # Utility scripts
  push-to-supabase.ts   # Full KB push to Supabase (via Management API)
  sync-local-to-supabase.ts  # Incremental sync (only missing articles)
newsletters/            # Generated newsletter .docx files
generate-newsletter.ts  # Newsletter generation script
generate-briefing.cjs   # Briefing generation script
vercel.json             # Vercel deployment configuration
CLAUDE.md               # Claude Code project instructions
```

## How It Works

### Local Development
`bun run site` starts a local server that reads markdown files directly from `knowledge-base/`. No database needed. Features: dashboard, article search, company profiles, market drivers, concepts, and AI chat.

### Vercel Deployment
The deployed site at `building-materials-intel.vercel.app` uses `api/index.ts` which reads from Supabase instead of local files. Push content to Supabase using the sync scripts.

### Daily Automated Newsletter
A Claude Code remote scheduled trigger (`building-materials-daily-review`, ID: `trig_015uykDko3ppsdJ7kNN5ezSW`) runs at 11:59 PM EDT every night. It:
1. Searches for today's building materials & building products news
2. Filters through a 9-tier approved source whitelist
3. Archives every article into the knowledge base
4. Deep dives all 35 tracked companies
5. Curates top stories into a briefing
6. Emails the digest to the configured recipient

To recreate this trigger, use Claude Code's `/schedule` command with the prompt from `CLAUDE.md`.

Manage at: https://claude.ai/code/scheduled/trig_015uykDko3ppsdJ7kNN5ezSW

## Tracked Companies (35)

| Segment | Companies |
|---------|-----------|
| Aggregates & Cement | CRH, CEMEX, Heidelberg Materials, Holcim, Martin Marietta, Taiheiyo Cement, Vulcan Materials |
| Glass & Insulation | AGC, Owens Corning, Saint-Gobain |
| Wood & Lumber | Canfor, Interfor, UFP Industries, West Fraser, Weyerhaeuser |
| Steel & Metals | ArcelorMittal, Nucor, Steel Dynamics, Wienerberger |
| Building Products & Distribution | Builders FirstSource, Carlisle Companies, Kingspan, QXO |
| Doors, Windows & Security | ASSA ABLOY, JELD-WEN, LIXIL, Sanwa Holdings |
| Plumbing, Drainage & Fixtures | Advanced Drainage Systems, Geberit, Fortune Brands, Masco |
| HVAC & Climate | Carrier Global, Daikin Industries, Johnson Controls, Trane Technologies |

## Source Whitelist (9 tiers)

1. **Major News** - Reuters, Bloomberg, WSJ, FT, NYT, CNBC, Forbes, Fortune, AP, etc.
2. **Top Publications** - TechCrunch, Verge, Wired, MIT Tech Review, etc.
3. **Industry-Specific** - Construction Dive, BD+C, ENR, Remodeling Magazine, etc.
4. **Company IR Pages** - All 35 companies' official investor relations sites
5. **Associations & Research** - NAHB, ABC, PCA, AISI, AGC, AIA, S&P Global Ratings, etc.
6. **Government & Data** - Census, BLS/PPI, BEA, FRED, Federal Reserve, USGS, etc.
7. **Financial Analysis** - Yahoo Finance, Seeking Alpha, MarketScreener
8. **Consulting Firms** - Bain, Deloitte, PwC, KPMG, FMI Corp, Capstone Partners
9. **Construction Niche** - LBM Journal, Builder Online, Steel Market Update, HousingWire, etc.
