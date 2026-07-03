-- ============================================
-- 010_fonts.sql
-- Custom fonts a creator uploads to their Castle account (≤5, enforced in app),
-- usable across CreatorCastle apps (bingo card text today). Files live in the
-- public `bingo-assets` storage bucket; this table records the @font-face family
-- + public URL. bot.* only; references public.streamers read-only.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.fonts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id  UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,            -- display name the creator typed
    family       TEXT NOT NULL,            -- CSS font-family used in @font-face
    url          TEXT NOT NULL,            -- public URL of the .ttf
    storage_path TEXT,                     -- bucket path (for deletion)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fonts_streamer ON bot.fonts(streamer_id);

ALTER TABLE bot.fonts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON bot.fonts TO service_role;

COMMIT;
