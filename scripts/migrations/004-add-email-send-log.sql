-- Persistent audit log for every email send attempt.
-- Internal mail only — no suppression / bounce columns.
-- status: 'sent' | 'failed' | 'skipped_env' | 'skipped_no_key'

CREATE TABLE IF NOT EXISTS email_send_log (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,                    -- 'digest' | 'alert-zero-articles' | ...
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  resend_id TEXT,
  error TEXT,
  idempotency_key TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  env TEXT,                              -- 'production' | 'preview' | 'development'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_send_log_type_created_idx
  ON email_send_log (type, created_at DESC);
CREATE INDEX IF NOT EXISTS email_send_log_idempotency_idx
  ON email_send_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
