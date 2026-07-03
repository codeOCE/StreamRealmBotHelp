-- Extended tipping page settings (presets & limits)
BEGIN;

ALTER TABLE bot.tip_settings
  ADD COLUMN IF NOT EXISTS max_amount_cents INTEGER CHECK (max_amount_cents IS NULL OR max_amount_cents >= 50),
  ADD COLUMN IF NOT EXISTS suggested_amount_cents INTEGER NOT NULL DEFAULT 500 CHECK (suggested_amount_cents >= 50),
  ADD COLUMN IF NOT EXISTS max_message_length INTEGER NOT NULL DEFAULT 200 CHECK (max_message_length >= 20 AND max_message_length <= 500),
  ADD COLUMN IF NOT EXISTS tip_presets JSONB NOT NULL DEFAULT '[5, 10, 25, 50]'::jsonb,
  ADD COLUMN IF NOT EXISTS paypal_email TEXT;

COMMIT;
