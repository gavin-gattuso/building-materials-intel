# Articles by Company

A per-company filesystem mirror of the Supabase `articles` table. Each company folder contains every article in the knowledge base linked to that company, written once per company so each folder is a complete company-pivot view.

**Articles linked to multiple companies are duplicated across folders** — this is intentional. Folder name = company slug; the `primary_company` frontmatter field tells you which folder a file is in.

## Layout

```
by-company/
├── _index.md              ← this file
├── _unlinked/             ← articles with no tracked-company link (macro/policy)
├── crh/                   ← 13 articles
├── nucor/                 ← 17 articles
├── lowes/                 ← 73 articles  (top by volume)
├── home-depot/            ← 24 articles
├── vulcan-materials/      ← 19 articles
... (one folder per linked tracked company)
```

## Frontmatter contract

Every file carries rich YAML frontmatter so the entire archive is greppable / `rg`-able without touching Supabase:

```yaml
---
slug: 2026-04-09-nucor-q1-2026-earnings-guidance
article_id: <uuid>
title: "Nucor Announces Q1 2026 Earnings Guidance..."
date: 2026-04-09
source: "Nucor IR"
source_url: "https://nucor.com/news-release/..."
source_domain: "nucor.com"
source_tier: 3
category: "Earnings"
primary_company: nucor
companies:
  - slug: nucor
    name: "Nucor Corporation"
    confidence: high
sections:
  - slug: public-company-performance
    relevance_score: 0.85
tags: [earnings, q1-2026, steel]
report_ready: true
report_ready_reason: "auto_promoted_non_earnings"
syndication_hash: <sha256>
corroborating_sources: []
content_length: 350
has_body: true
body_length: 7970
has_extraction: false   # true when ANTHROPIC_API_KEY is set
extraction: { ... }     # revenue_figure, ebitda_margin_pct, guidance_direction, ...
---

[Article body or summary]
```

## How to regenerate

```bash
SUPABASE_SERVICE_ROLE_KEY=<your-key> bun scripts/export-articles-by-company.ts
```

Optional flags: `--since 2026-05-01` (incremental), `--dry-run` (no writes).

This pull was last refreshed by hand on 2026-05-12. Going forward, the script can be added to the Friday cron (`api/cron-weekly.ts`) once Vercel function filesystem write semantics are confirmed.

## Common queries

```bash
# All Nucor articles with revenue figures extracted
rg -l 'revenue_figure: [0-9]' knowledge-base/by-company/nucor/

# Every Q1 2026 earnings article across all companies
rg -l 'category: Earnings' knowledge-base/by-company/ | xargs rg -l 'q1.*2026'

# Articles where Wells Fargo upgraded a company
rg -l 'Wells Fargo' knowledge-base/by-company/

# Macro/policy pieces (no company link)
ls knowledge-base/by-company/_unlinked/

# Articles with full body fetched (not just headline)
rg -l 'has_body: true' knowledge-base/by-company/
```

## Top folders (by article count, as of 2026-05-12)

| Folder | Articles |
|---|---|
| `lowes/` | 73 |
| `home-depot/` | 24 |
| `vulcan-materials/` | 19 |
| `qxo/` | 18 |
| `nucor/` | 17 |
| `martin-marietta/` | 15 |
| `trane-technologies/` | 14 |
| `crh/` | 13 |
| `advanced-drainage-systems/` | 12 |
| `johnson-controls/` | 12 |

Full table after a complete export run. The script is the source of truth.
