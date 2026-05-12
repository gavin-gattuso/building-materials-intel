# Operational Runbook

What to do when something breaks. Use the existing email alerts as your starting point — each alert subject below has a recovery path. Status page is at https://building-materials-intel.vercel.app/status.html — always check it first.

## Daily checks

Glance at the status page once a day. Healthy state:
- **Overall:** green "Healthy" pill
- **Last scheduled run:** completed today between 04:00–04:30 UTC, archived 5+ articles
- **7d URL decode %:** 95%+ (drops below 60% = decoder broken)
- **7d body fetch %:** 30–60% is normal (paywalls dominate the failure rate)
- **7d Anthropic OK %:** 95%+ if `ANTHROPIC_API_KEY` is set; 0% otherwise (known)
- **Article freshness:** newest article < 36h old
- **Weekly digest:** age < 8 days
- **Stuck locks:** 0
- **Pending reviews:** trend, not absolute — if growing > 20 you're behind

## Alert recovery

### `[ALERT] Nightly ingest returned 0 articles — YYYY-MM-DD`

The 04:00 UTC cron ran but inserted nothing.

1. Open `/status.html`. Look at the last run's `candidates` count.
2. If candidates > 100 but `archived: 0` → dedup is over-firing. Likely cause: title-dedup matching too aggressively, or syndication-hash colliding. Check recent `rejected_articles`:
   ```sql
   SELECT rejection_reason, COUNT(*) FROM rejected_articles
   WHERE rejection_timestamp > NOW() - INTERVAL '24 hours'
   GROUP BY rejection_reason ORDER BY 2 DESC;
   ```
3. If candidates < 30 → Google News query returned empty. Could be:
   - Google rate-limiting the Vercel egress IP — wait a day, retry.
   - The 8 default queries no longer match recent news (unlikely but possible).
   - Try a manual backfill with `?days=7&backfill=1` to widen the window.
4. If candidates > 100 and `archived > 0` but tiny — pipeline is degraded. Check `pipeline_runs`:
   ```sql
   SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 5;
   ```
   Look at url_decode_pct + body_fetch_pct + anthropic_pct trends.

### `[DEGRADED] {metric} dropped {N}pts WoW`

Telemetry shows a week-over-week regression. Investigate which metric:

- **`url_decode_pct` dropped:** Google rotated the batchexecute RPC ID or scrape attribute names. Run `bun scripts/test-google-news-decoder.ts` against current URLs to confirm. Fix is usually a 1-line update to `lib/google-news-decoder.ts` regex.
- **`body_fetch_pct` dropped:** Common cause is sites adding new bot protection. Spot-check 3 failing URLs in a browser. If it's a single source dominating failures, consider downgrading its source_tier or adding to a "skip-body-fetch" list.
- **`anthropic_pct` dropped:** Most likely `ANTHROPIC_API_KEY` expired or hit prepay zero. Check `/api/cron-weekly-summary` directly — it returns the error message verbatim. Top up the key.

### `[STUCK RUN] daily_run_lock has N stuck in_progress rows`

A daily-scan function crashed without updating its lock row. Clean up:

```sql
UPDATE daily_run_lock SET status='failed', completed_at=now()
WHERE status='in_progress' AND started_at < now() - interval '15 minutes';
```

Then investigate why it crashed — check Vercel function logs for the run_date. Usually OOM or hard timeout.

### `[DIGEST MISSING] Weekly summary for week ending YYYY-MM-DD`

Saturday/Sunday healthcheck didn't find a row for the current week. Manual recovery:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://building-materials-intel.vercel.app/api/cron-weekly-summary"
```

The endpoint auto-uses the deterministic fallback when `ANTHROPIC_API_KEY` is missing, so it always succeeds.

### `[ACTION REQUIRED] N review queue items overdue`

Items have been pending > 48h. Clear via the dashboard or the approve/dismiss links in the digest email. The HMAC-signed links in emails sent 2026-05-12 onward are tamper-resistant; older `key=cron` links no longer work.

### `[PIPELINE DOWN] No articles ingested in Nh`

Healthcheck detected > 48h since the last article.date. This is the "catastrophic" alert.

1. Check `/api/stats` → does it return at all? If not, Vercel function is broken — check deployment logs.
2. If yes, run a manual backfill: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" "...vercel.app/api/daily-scan?backfill=1&days=4"`.
3. Watch the response log for the actual failure mode (Anthropic 401, Supabase RLS error, etc.).

## Maintenance tasks

### Refresh the per-company filesystem mirror

```bash
SUPABASE_SERVICE_ROLE_KEY=... bun scripts/export-articles-by-company.ts
git add knowledge-base/by-company/
git commit -m "kb: refresh by-company mirror"
```

This regenerates `knowledge-base/by-company/{slug}/{date}-{title}.md` for every article in Supabase. Each company folder lists their articles with rich YAML frontmatter — use `grep` / `rg` to query without touching the database.

### Backfill article bodies for older rows

When more articles need full text (e.g., after adding a new source to the whitelist):

```bash
# Via API (no env vars needed locally)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://building-materials-intel.vercel.app/api/backfill?op=article-bodies&limit=100"

# Or locally
SUPABASE_SERVICE_ROLE_KEY=... bun scripts/backfill-article-bodies.ts --limit 100
```

### Resolve Google News URLs in older rows

When the URL decoder gets upgraded and you want to re-resolve everything:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://building-materials-intel.vercel.app/api/backfill?op=google-news-urls&limit=200"
```

### Re-run company matching on unlinked articles

Currently ~49% of report-ready articles have no company link (macro/policy). After loosening the match rules:

```sql
-- Check how many would be impacted before running anything
SELECT COUNT(*) FROM articles a
WHERE NOT EXISTS (SELECT 1 FROM article_companies ac WHERE ac.article_id = a.id);
```

(There's no current endpoint that re-runs `matchCompanies` against existing rows — TODO if needed.)

### Update earnings calendar

The calendar is in `site/build-static.ts:earningsSchedule[]`. Hardcoded for now (`earnings_calendar` DB table planned but not yet wired). Edit the array, push, Vercel rebuilds `earnings-calendar.json`.

### Run the test suite locally

```bash
bun test                          # everything
bun run test:reliability          # CI subset (93 tests, ~500ms)
```

## Env vars (Vercel)

| Var | What it does | Where to find it |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | Supabase dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Full DB access — used by all server-side code | Supabase dashboard, **secret** |
| `SUPABASE_ANON_KEY` | Public read access — fallback for build-static | Supabase dashboard |
| `ANTHROPIC_API_KEY` | Powers extraction, summary, weekly digest | console.anthropic.com — **currently MISSING per audit** |
| `RESEND_API_KEY` | Email delivery for digests + alerts | resend.com dashboard |
| `RESEND_FROM_EMAIL` | Sender address (optional, defaults to `onboarding@resend.dev`) | configurable |
| `CRON_SECRET` | Auth for cron + privileged endpoints | generate any 32+ char random string |
| `BRIEFING_API_KEY` | Legacy alt secret accepted by some endpoints | optional |
| `ANTHROPIC_DAILY_CAP` | Max Anthropic calls/day before refusing new runs | optional, default 5000 |
| `CAPIQ_API_KEY` | S&P Capital IQ integration (not currently producing rows) | **TODO** |

## Tier-related limits (heads-up)

- **Vercel Hobby:** max 2 cron jobs. We have 3 declared. If you can't tell which two are firing, check `daily_run_lock` (every run lands a row) and `weekly_summaries` (`created_at` should advance every Friday).
- **Supabase Free:** 7-day rolling backups via dashboard only, not downloadable. Project pauses after 7 days inactivity. **Plan B is currently the only backup: re-ingest from Google News, which only retains ~30 days.**
- **Resend Free:** 3,000 emails/month. Current burn ~50/month including alerts.
- **Anthropic prepay:** drains silently if hit zero. The new daily cap protects against runaway cost but not against organic prepay exhaustion.

## Common queries

```sql
-- Are we ingesting? (newest article)
SELECT MAX(date) AS newest, COUNT(*) AS total FROM articles;

-- Recent pipeline runs
SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 10;

-- Articles with no body text yet
SELECT COUNT(*) FROM articles
WHERE full_text IS NULL OR LENGTH(full_text) < 200;

-- Articles with no company link (the "macro/policy" bucket)
SELECT COUNT(*) FROM articles a
WHERE NOT EXISTS (SELECT 1 FROM article_companies ac WHERE ac.article_id = a.id);

-- Top sources this week
SELECT source, COUNT(*) FROM articles
WHERE date >= CURRENT_DATE - 7 GROUP BY source ORDER BY 2 DESC LIMIT 10;

-- Article extraction quality (when ANTHROPIC_API_KEY is set)
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE extraction_confidence > 0.5) AS high_conf,
  AVG(extraction_confidence) AS avg_conf
FROM article_extractions
WHERE created_at > NOW() - INTERVAL '7 days';

-- Rejection forensics
SELECT source_domain, rejection_reason, COUNT(*) FROM rejected_articles
WHERE rejection_timestamp > NOW() - INTERVAL '7 days'
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20;
```

## When in doubt

1. `/status.html` first.
2. `pipeline_runs` table for trends.
3. `rejected_articles.raw_feed_data` for "why didn't this article ingest?" forensics.
4. `email_send_log` for "did the alert actually go out?".
5. Vercel function logs (dashboard → Functions → daily-scan) for runtime errors.
