-- ============================================
-- 017_platform_bot.sql
-- The dedicated platform bot account ("CreatorCastleBot").
--
-- One shared bot account posts to every connected channel (the Nightbot /
-- StreamElements model), rather than the bot posting as the broadcaster
-- themselves. Works because creators already grant `channel:bot` at login, so
-- the bot's token can send to their channel with sender_id = the bot.
--
-- Singleton table: a single row (id = TRUE) holds the bot's encrypted user token.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.platform_bot (
    id                      BOOLEAN PRIMARY KEY DEFAULT TRUE,
    bot_user_id             TEXT NOT NULL,
    bot_username            TEXT NOT NULL,
    encrypted_access_token  TEXT NOT NULL,
    encrypted_refresh_token TEXT,
    token_scope             TEXT,
    token_expires_at        TIMESTAMPTZ,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT platform_bot_singleton CHECK (id = TRUE)
);

ALTER TABLE bot.platform_bot ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA bot TO service_role;

COMMIT;
