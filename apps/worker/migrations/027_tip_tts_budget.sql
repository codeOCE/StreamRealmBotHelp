-- Polly TTS monthly character budget (cost control)
BEGIN;

ALTER TABLE bot.tip_settings
  ADD COLUMN IF NOT EXISTS tts_monthly_char_limit INTEGER NOT NULL DEFAULT 50000
    CHECK (tts_monthly_char_limit >= 0),
  ADD COLUMN IF NOT EXISTS tts_chars_used INTEGER NOT NULL DEFAULT 0
    CHECK (tts_chars_used >= 0),
  ADD COLUMN IF NOT EXISTS tts_usage_month TEXT NOT NULL DEFAULT '';

COMMIT;
