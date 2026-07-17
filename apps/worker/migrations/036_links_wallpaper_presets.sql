-- ============================================
-- 036_links_wallpaper_presets.sql
-- Wallpaper becomes a curated preset key instead of free-form color/image
-- (presets defined in apps/web/lib/link-wallpapers.ts). Feature is days old,
-- so dropping the free-form columns loses nothing.
-- ============================================

BEGIN;

ALTER TABLE bot.links_pages
    DROP COLUMN IF EXISTS bg_color,
    DROP COLUMN IF EXISTS bg_image,
    ADD COLUMN IF NOT EXISTS wallpaper TEXT NOT NULL DEFAULT 'default';

COMMIT;
