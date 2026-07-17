-- ============================================
-- 033_links_page_style.sql
-- Per-creator styling for the link-in-bio page (/links/:streamerId):
-- accent color override, button style, and button shape.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.links_pages (
    streamer_id  UUID PRIMARY KEY REFERENCES public.streamers(id) ON DELETE CASCADE,
    accent       TEXT,                                   -- NULL = use brand color
    button_style TEXT NOT NULL DEFAULT 'glass',          -- glass | solid | outline
    shape        TEXT NOT NULL DEFAULT 'rounded',        -- rounded | pill | sharp
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bot.links_pages ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA bot TO service_role;

COMMIT;
