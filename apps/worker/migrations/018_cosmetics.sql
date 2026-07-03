-- ============================================
-- 018_cosmetics.sql
-- Chat cosmetics — a 7TV-style badge + "paint" system for the CreatorCastle
-- browser extension. A creator defines cosmetics for their channel (or platform
-- staff define castle-wide ones with streamer_id = NULL), grants them to viewers
-- manually, or ties them to a loyalty level so they're auto-applied to everyone
-- who qualifies. The extension reads them per-channel from a public route and
-- renders badges/paints onto usernames in Twitch chat.
--
--   bot.cosmetics       definitions (badge image OR paint gradient config)
--   bot.user_cosmetics  manual grants of a cosmetic to a viewer (by login)
--
-- TCG tie-in (future): a `source = 'tcg'` cosmetic with requirement.cardId is
-- granted from card ownership in the shared TCG schema; the manual-grant table
-- is the same insert path the TCG worker can write to.
-- ============================================

BEGIN;

-- A badge or paint definition.
--   kind    'badge' (an image shown next to the name) | 'paint' (username styling)
--   source  how a viewer gets it:
--             'manual'  — only via an explicit bot.user_cosmetics grant
--             'loyalty' — auto-granted to viewers at/above requirement.minLevel
--             'tcg'     — granted from TCG card ownership (requirement.cardId)
--   rarity  cosmetic-only styling hint (common|rare|epic|legendary|mythic)
--   image_url  badge image (kind = 'badge')
--   paint   JSONB paint config (kind = 'paint'), e.g.
--             { "function": "linear-gradient", "angle": 90,
--               "stops": [{ "color": "#a855f7", "at": 0 }, { "color": "#22d3ee", "at": 100 }],
--               "animation": "shimmer", "shadow": "0 0 8px rgba(168,85,247,.6)" }
--   requirement JSONB grant rule for non-manual sources, e.g. { "minLevel": 10 }.
CREATE TABLE IF NOT EXISTS bot.cosmetics (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULL = castle-wide cosmetic available to every channel.
    streamer_id  UUID REFERENCES public.streamers(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL CHECK (kind IN ('badge', 'paint')),
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    rarity       TEXT NOT NULL DEFAULT 'common'
                 CHECK (rarity IN ('common', 'rare', 'epic', 'legendary', 'mythic')),
    source       TEXT NOT NULL DEFAULT 'manual'
                 CHECK (source IN ('manual', 'loyalty', 'tcg')),
    image_url    TEXT,
    paint        JSONB NOT NULL DEFAULT '{}'::jsonb,
    requirement  JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled      BOOLEAN NOT NULL DEFAULT true,
    sort         INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cosmetics_streamer_idx ON bot.cosmetics (streamer_id, sort);

-- A grant of a cosmetic to a specific viewer. Keyed by lowercased Twitch login
-- (what the extension can read from the chat DOM); twitch_user_id is filled in
-- when known (resolved via Helix or seen by the bot). `equipped` lets a viewer
-- toggle a cosmetic on/off later from the website; defaults on at grant time.
CREATE TABLE IF NOT EXISTS bot.user_cosmetics (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id      UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    cosmetic_id      UUID NOT NULL REFERENCES bot.cosmetics(id) ON DELETE CASCADE,
    viewer_login     TEXT NOT NULL,            -- lowercased Twitch login
    viewer_twitch_id TEXT,                     -- numeric id when known
    equipped         BOOLEAN NOT NULL DEFAULT true,
    granted_by       TEXT NOT NULL DEFAULT 'manual', -- manual | loyalty | tcg
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cosmetic_id, viewer_login)
);
CREATE INDEX IF NOT EXISTS user_cosmetics_streamer_idx ON bot.user_cosmetics (streamer_id);
CREATE INDEX IF NOT EXISTS user_cosmetics_login_idx ON bot.user_cosmetics (streamer_id, viewer_login);

-- Defense-in-depth: RLS on, service-role (the Worker) bypasses it and authorizes
-- itself. The extension never uses the anon key — it calls the Worker's public
-- route — so no public-read policy is needed here (consistent with bingo/004/005).
ALTER TABLE bot.cosmetics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.user_cosmetics ENABLE ROW LEVEL SECURITY;

GRANT ALL ON bot.cosmetics, bot.user_cosmetics TO service_role;

COMMIT;
