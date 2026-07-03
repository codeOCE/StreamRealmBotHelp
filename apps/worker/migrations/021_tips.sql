-- ============================================
-- 021_tips.sql
-- Tipping / donations (the StreamElements "Tip" feature) — the core monetization
-- surface. A creator gets a public tip page (/tip/<channel>); supporters leave a
-- name, amount, and message. Completed tips fire the overlay alert (type
-- 'donation', already supported by the Alert widget), feed the donation goal/
-- ticker widgets, and power a top-donator leaderboard.
--
-- Payment providers:
--   * 'manual'  — the creator logs an external donation (PayPal/StreamElements/
--                 cash). Completed immediately. Works with NO payment keys.
--   * 'stripe'  — Stripe Checkout. A pending tip is created at checkout and flips
--                 to 'completed' from the Stripe webhook. Requires STRIPE_SECRET_KEY
--                 (+ optional Stripe Connect account in tip_settings).
--
-- Amounts are stored in MINOR units (cents) to avoid float drift.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.tip_settings (
    streamer_id       UUID PRIMARY KEY REFERENCES public.streamers(id) ON DELETE CASCADE,
    enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    currency          TEXT NOT NULL DEFAULT 'USD',
    min_amount_cents  INTEGER NOT NULL DEFAULT 100 CHECK (min_amount_cents >= 50),
    thanks_message    TEXT NOT NULL DEFAULT 'Thank you so much for the support!',
    -- Stripe Connect account (acct_...) that receives the funds. NULL => charge
    -- to the platform account (dev / single-tenant).
    stripe_account_id TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot.tips (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id  UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    donor_name   TEXT NOT NULL DEFAULT 'Anonymous',
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency     TEXT NOT NULL DEFAULT 'USD',
    message      TEXT NOT NULL DEFAULT '',
    -- pending | completed | refunded
    status       TEXT NOT NULL DEFAULT 'pending',
    provider     TEXT NOT NULL DEFAULT 'manual',  -- manual | stripe
    provider_ref TEXT,                             -- Stripe Checkout Session id, etc.
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tips_streamer ON bot.tips(streamer_id, status, created_at DESC);
-- Idempotency for webhook completion: one row per provider ref.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tips_provider_ref ON bot.tips(provider, provider_ref) WHERE provider_ref IS NOT NULL;

-- Top supporters by completed total (leaderboard + top-donator widget).
CREATE OR REPLACE FUNCTION bot.tip_leaderboard(p_streamer_id UUID, p_limit INTEGER)
RETURNS TABLE (donor_name TEXT, total_cents BIGINT, tip_count BIGINT)
LANGUAGE sql STABLE AS $$
    SELECT donor_name, SUM(amount_cents)::BIGINT AS total_cents, COUNT(*)::BIGINT AS tip_count
      FROM bot.tips
     WHERE streamer_id = p_streamer_id AND status = 'completed'
     GROUP BY donor_name
     ORDER BY total_cents DESC
     LIMIT GREATEST(1, COALESCE(p_limit, 10));
$$;

-- Completed total (for goals). Returns cents.
CREATE OR REPLACE FUNCTION bot.tip_total(p_streamer_id UUID, p_since TIMESTAMPTZ)
RETURNS BIGINT
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(SUM(amount_cents), 0)::BIGINT
      FROM bot.tips
     WHERE streamer_id = p_streamer_id AND status = 'completed'
       AND (p_since IS NULL OR completed_at >= p_since);
$$;

ALTER TABLE bot.tip_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.tips         ENABLE ROW LEVEL SECURITY;

GRANT ALL ON bot.tip_settings, bot.tips TO service_role;

COMMIT;
