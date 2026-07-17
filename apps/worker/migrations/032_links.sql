-- ============================================
-- 032_links.sql
-- Link-in-bio page — a single shareable page listing a creator's other
-- links (socials, merch, Discord, ...). Public page lives at /links/:streamerId.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.profile_links (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id    UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    label          TEXT NOT NULL,
    url            TEXT NOT NULL,
    icon           TEXT,
    enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    sort           INTEGER NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS profile_links_streamer_idx ON bot.profile_links (streamer_id, sort);

ALTER TABLE bot.profile_links ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA bot TO service_role;

COMMIT;
