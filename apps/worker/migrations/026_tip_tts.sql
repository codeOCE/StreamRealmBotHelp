-- Tip text-to-speech (read donation messages on overlay)
BEGIN;

ALTER TABLE bot.tip_settings
  ADD COLUMN IF NOT EXISTS tts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tts_min_amount_cents INTEGER NOT NULL DEFAULT 100
    CHECK (tts_min_amount_cents >= 0);

COMMIT;
