-- Audit trail for manual verification of financial_ratios rows.
-- `manually_verified` already exists; this adds who verified and when.

ALTER TABLE financial_ratios
  ADD COLUMN IF NOT EXISTS verified_by TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
