-- ============================================
-- 029_shop_item_image.sql
-- The Royal Shop — add an optional reward image (URL) for the SE-style,
-- image-forward viewer store catalog. Emoji `icon` stays as the fallback.
-- ============================================

BEGIN;

ALTER TABLE bot.shop_items ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMIT;
