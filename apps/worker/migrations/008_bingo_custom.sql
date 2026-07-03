-- ============================================
-- 008_bingo_custom.sql
-- Bingo customisation: a prize/reward field, a per-game win-check mode
-- (auto-validate vs manual streamer review), and card styling (daub colour/shape/
-- image + tile text font/colour).
--
-- The richer tile model (objects with id/label/image/count for multi-check + image
-- tiles), called-counts, and viewer mark-counts all live in EXISTING JSONB columns
-- (bingo_games.tiles/called, bingo_cards.cells/marks) — no DDL needed for those.
-- bingo_cards.claim_status gains values 'pending'/'denied' (plain TEXT, no DDL).
--
-- bot.* only; references nothing in public/TCG. Additive + idempotent.
-- ============================================

BEGIN;

ALTER TABLE bot.bingo_games ADD COLUMN IF NOT EXISTS reward      TEXT;
ALTER TABLE bot.bingo_games ADD COLUMN IF NOT EXISTS review_mode TEXT NOT NULL DEFAULT 'auto'; -- auto | manual
-- { markStyle:'cross'|'dot'|'check'|'star'|'image', markColor, markImage, tileFont, tileTextColor }
ALTER TABLE bot.bingo_games ADD COLUMN IF NOT EXISTS card_style  JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
