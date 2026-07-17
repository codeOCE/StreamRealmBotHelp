-- ============================================
-- 037_emotes.sql
-- Custom chat emotes — a 7TV/BTTV-style emote platform. A creator uploads emote
-- images with a text code (e.g. "catJAM"); anyone typing that code in the
-- channel sees the image, both in real Twitch chat (via the CreatorCastle
-- browser extension) and in CreatorCastle's own overlays (chat + emote wall).
--
-- Two layers:
--   bot.emotes          an emote definition (image + code). owner_id NULL = a
--                       platform-global emote available to every channel.
--   bot.channel_emotes  a channel adding a PUBLIC emote (from another channel /
--                       the directory) to its own chat — cross-channel sharing.
--
-- A channel's active emote set = its own emotes (any status) + emotes it has
-- added via channel_emotes that are public AND approved. Own emotes always win
-- a code collision. See routes/emotes.ts (publicChannelEmotes) + chat/emotes.ts.
--
-- Moderation: channel-private emotes (visibility='channel') are auto-approved —
-- they only ever appear in their own channel. Submitting an emote to the shared
-- directory (visibility='public') resets it to 'pending' until a platform admin
-- approves it (PLATFORM_ADMIN_IDS in the Worker env).
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.emotes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULL = platform-global emote (owned by staff, usable by every channel).
    owner_id     UUID REFERENCES public.streamers(id) ON DELETE CASCADE,
    code         TEXT NOT NULL,                 -- the typed token, case-sensitive
    image_url    TEXT NOT NULL,
    storage_path TEXT,                          -- set when uploaded (for deletion); NULL for URL emotes
    width        INTEGER NOT NULL DEFAULT 28,   -- render width hint (px), height auto
    animated     BOOLEAN NOT NULL DEFAULT false,
    visibility   TEXT NOT NULL DEFAULT 'channel'
                 CHECK (visibility IN ('channel', 'public')),
    status       TEXT NOT NULL DEFAULT 'approved'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One code per owner. Case-sensitive (7TV emotes are), so the unique index is on
-- the raw code. Platform-global emotes (owner_id NULL) are deduped separately.
CREATE UNIQUE INDEX IF NOT EXISTS emotes_owner_code_idx ON bot.emotes (owner_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS emotes_global_code_idx ON bot.emotes (code) WHERE owner_id IS NULL;
-- Directory browse/search: public + approved, newest first.
CREATE INDEX IF NOT EXISTS emotes_directory_idx ON bot.emotes (visibility, status, created_at DESC);

-- A channel enabling a public emote it doesn't own (cross-channel / directory).
CREATE TABLE IF NOT EXISTS bot.channel_emotes (
    streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    emote_id    UUID NOT NULL REFERENCES bot.emotes(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (streamer_id, emote_id)
);
CREATE INDEX IF NOT EXISTS channel_emotes_streamer_idx ON bot.channel_emotes (streamer_id);

-- Defense-in-depth: RLS on; the service-role Worker bypasses it and authorizes
-- itself. The extension reads via the Worker's public route, never the anon key
-- (consistent with cosmetics/018 + bingo/004).
ALTER TABLE bot.emotes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.channel_emotes ENABLE ROW LEVEL SECURITY;

GRANT ALL ON bot.emotes, bot.channel_emotes TO service_role;

COMMIT;
