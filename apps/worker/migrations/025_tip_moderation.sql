-- Tip moderation (profanity, manual approval, blocked donors)
BEGIN;

ALTER TABLE bot.tip_settings
  ADD COLUMN IF NOT EXISTS profanity_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS custom_blocked_words JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS blocked_donors JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS filter_action TEXT NOT NULL DEFAULT 'replace'
    CHECK (filter_action IN ('allow', 'replace', 'hide_message', 'block_alert')),
  ADD COLUMN IF NOT EXISTS replacement_text TEXT NOT NULL DEFAULT '***',
  ADD COLUMN IF NOT EXISTS manual_approval BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tts_anti_spam BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE bot.tips
  ADD COLUMN IF NOT EXISTS display_message TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS display_donor_name TEXT,
  ADD COLUMN IF NOT EXISTS alert_suppressed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS moderation_status TEXT,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT;

COMMIT;
