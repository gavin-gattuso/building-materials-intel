-- Daily run lock: prevents the Vercel cron and the Anthropic remote trigger
-- from both processing the same day's ingest. First writer wins; the second
-- invocation observes a unique-constraint violation and exits cleanly.

CREATE TABLE IF NOT EXISTS daily_run_lock (
  run_date DATE PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress' | 'complete' | 'failed'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  articles_inserted INTEGER
);
