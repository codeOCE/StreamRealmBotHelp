-- Align default tip message length with common tipping-page default (255 chars).
BEGIN;

ALTER TABLE bot.tip_settings
  ALTER COLUMN max_message_length SET DEFAULT 255;

COMMIT;
