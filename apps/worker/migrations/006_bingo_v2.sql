-- ============================================
-- 006_bingo_v2.sql
-- Bingo v2: viewer-owned cards, self-marking, claim validation, and per-game
-- card entitlements (base + sub-tier + channel-point purchases).
--
-- Model change: the creator "calling" a tile no longer marks cards. Viewers mark
-- their OWN cells (bingo_cards.marks) and press BINGO; a claim is valid only if
-- the marked cells form a winning pattern AND every marked tile is in the game's
-- `called` list (the creator's calls are the validation ground truth).
--
-- Cards now bind to an authenticated Twitch viewer (user_twitch_id, soft ref to
-- public.users.twitch_id) instead of an anonymous browser id, so a viewer gets
-- one card per account by default. Extra cards are granted by sub tier (computed
-- live via Helix) and by channel-point redemptions (recorded as grants via
-- EventSub). All new objects live in the `bot` schema; nothing in public/TCG is
-- touched. Idempotent + transactional, consistent with 001-005.
-- ============================================

BEGIN;

-- 1. bot.bingo_cards — viewer-owned, self-marked ------------------------------
ALTER TABLE bot.bingo_cards ADD COLUMN IF NOT EXISTS user_twitch_id TEXT;
ALTER TABLE bot.bingo_cards ADD COLUMN IF NOT EXISTS marks        JSONB   NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bot.bingo_cards ADD COLUMN IF NOT EXISTS claim_status TEXT    NOT NULL DEFAULT 'none'; -- none | invalid | confirmed
ALTER TABLE bot.bingo_cards ADD COLUMN IF NOT EXISTS card_number  INTEGER NOT NULL DEFAULT 1;
-- player_id was NOT NULL in 003; viewer-owned cards key on user_twitch_id instead.
ALTER TABLE bot.bingo_cards ALTER COLUMN player_id DROP NOT NULL;

-- Replace the single-card-per-(game,player) assumption with one that allows
-- several cards per (game, viewer), numbered 1..N.
ALTER TABLE bot.bingo_cards DROP CONSTRAINT IF EXISTS bingo_cards_game_id_player_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bingo_cards_game_user_number
    ON bot.bingo_cards(game_id, user_twitch_id, card_number);
CREATE INDEX IF NOT EXISTS idx_bingo_cards_game_user
    ON bot.bingo_cards(game_id, user_twitch_id);

-- 2. bot.bingo_games — per-game entitlement config ----------------------------
-- { base, allowMultiple, subTierCards:{ "1000","2000","3000" },
--   channelPoints:{ enabled, rewardId, cost, cardsPerRedemption, maxPerUser } }
ALTER TABLE bot.bingo_games ADD COLUMN IF NOT EXISTS entitlements JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. bot.bingo_entitlement_grants — extra cards granted to a viewer -----------
-- One row per grant. channel-point grants carry the Twitch redemption id so the
-- EventSub handler is idempotent (a replayed webhook can't grant twice).
CREATE TABLE IF NOT EXISTS bot.bingo_entitlement_grants (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id       UUID NOT NULL REFERENCES bot.bingo_games(id) ON DELETE CASCADE,
    streamer_id   UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    user_twitch_id TEXT NOT NULL,
    source        TEXT NOT NULL,            -- sub | channel_points | manual
    amount        INTEGER NOT NULL DEFAULT 1,
    redemption_id TEXT,                     -- Twitch redemption id (channel_points), for dedup
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bingo_grants_game_user
    ON bot.bingo_entitlement_grants(game_id, user_twitch_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bingo_grants_redemption
    ON bot.bingo_entitlement_grants(redemption_id) WHERE redemption_id IS NOT NULL;

-- 4. bot.eventsub_subscriptions — track Twitch EventSub subs (channel points) --
CREATE TABLE IF NOT EXISTS bot.eventsub_subscriptions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id   UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    type          TEXT NOT NULL,            -- e.g. channel.channel_points_custom_reward_redemption.add
    reward_id     TEXT,                     -- the custom reward this sub watches
    twitch_sub_id TEXT,                     -- Twitch's subscription id
    secret        TEXT NOT NULL,            -- HMAC secret to verify webhook signatures
    status        TEXT NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (streamer_id, type, reward_id)
);
CREATE INDEX IF NOT EXISTS idx_eventsub_streamer ON bot.eventsub_subscriptions(streamer_id);
CREATE INDEX IF NOT EXISTS idx_eventsub_reward ON bot.eventsub_subscriptions(reward_id);

-- Defense-in-depth: RLS on, no policy (deny direct anon/auth); the Worker uses
-- the service-role key and authorizes itself. Consistent with 002-005.
ALTER TABLE bot.bingo_entitlement_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.eventsub_subscriptions   ENABLE ROW LEVEL SECURITY;

GRANT ALL ON bot.bingo_entitlement_grants, bot.eventsub_subscriptions TO service_role;

COMMIT;
