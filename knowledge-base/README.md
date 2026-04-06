# Building Materials & Building Products Knowledge Base

## Purpose
This is an LLM-maintained knowledge base that serves as the institutional memory for the Building Materials & Building Products industry. It is the source of truth when updating the semi-annual industry report.

**You rarely edit this wiki manually. The LLM maintains it.**

## Architecture

```
knowledge-base/
  raw/
    articles/          # Full-text markdown of every article ingested (one .md per article)
    data/              # Raw data files, CSVs, data snapshots
  wiki/
    concepts/          # Concept articles (e.g., tariff-impact.md, 3d-printing-construction.md)
    companies/         # Company profiles (e.g., qxo.md, holcim.md, owens-corning.md)
    market-drivers/    # Market driver tracking (e.g., interest-rates.md, labor-dynamics.md)
    indexes/           # Auto-maintained index files for LLM navigation
  outputs/
    reports/           # Generated reports (Word docs, briefings)
    visualizations/    # Charts, graphs, data visualizations
```

## How It Works

### Data Ingest (Daily at 11:59 PM EST + On-Demand)
1. Web searches find articles across 15 categories
2. Each article is deep-read and saved as a raw .md file in `raw/articles/`
3. The wiki is then "compiled" - concepts, company profiles, and market driver pages are created or updated

### Wiki Compilation
After ingesting new articles, the LLM:
- Updates or creates **concept articles** for any new themes or topics
- Updates **company profiles** with new data points, earnings, M&A activity
- Updates **market driver pages** with latest signals and trend data
- Updates **index files** so future queries can navigate efficiently
- Adds **backlinks** between related articles and concepts

### Q&A
With the wiki populated, you can ask complex questions like:
- "What has happened with steel tariffs over the past 3 months?"
- "Give me a timeline of QXO's acquisition strategy"
- "How have mortgage rates correlated with builder confidence this quarter?"
- "What are the top 5 themes for the semi-annual report update?"

### Outputs
Query results are rendered as markdown, Word docs, or visualizations and saved to `outputs/`.

## Key Files
- `wiki/indexes/MASTER-INDEX.md` — Master index of all wiki articles with brief descriptions
- `wiki/indexes/DAILY-LOG.md` — Chronological log of every daily ingest
- `wiki/indexes/COMPANY-INDEX.md` — All tracked companies
- `wiki/indexes/CONCEPT-INDEX.md` — All concept articles
- `wiki/indexes/MARKET-DRIVER-INDEX.md` — Market driver tracking summary
- `wiki/indexes/DATA-POINTS.md` — Running log of key statistics and metrics
