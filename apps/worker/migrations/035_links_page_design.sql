-- ============================================
-- 035_links_page_design.sql
-- Linktree-parity design options for the link page: wallpaper (color or
-- image) and a per-page title/bio override (defaults stay on brand settings).
-- ============================================

BEGIN;

ALTER TABLE bot.links_pages
    ADD COLUMN IF NOT EXISTS bg_color TEXT,
    ADD COLUMN IF NOT EXISTS bg_image TEXT,
    ADD COLUMN IF NOT EXISTS title    TEXT,
    ADD COLUMN IF NOT EXISTS bio      TEXT;

COMMIT;
