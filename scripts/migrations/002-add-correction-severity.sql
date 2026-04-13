-- Correction severity classification for the weekly correction sweep.
--   'cosmetic'   — only the headline changed; body unchanged
--   'structural' — body paragraphs added/removed (>10% length change)
--   'numeric'    — at least one numeric figure disappeared or moved >5%
-- 'numeric' takes precedence over 'structural' when both apply.

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS change_severity TEXT;
