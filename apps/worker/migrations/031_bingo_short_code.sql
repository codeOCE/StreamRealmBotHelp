-- ============================================
-- 031_bingo_short_code.sql
-- Short share codes for bingo games: app.creatorcastle.gg/b/<code> redirects
-- to /play/bingo/<gameId>. The code is DB-generated (6 hex chars) so the
-- worker's create path needs no changes; backfill covers existing games.
-- ============================================

BEGIN;

ALTER TABLE bot.bingo_games
    ADD COLUMN IF NOT EXISTS short_code TEXT UNIQUE DEFAULT substr(md5(random()::text), 1, 6);

UPDATE bot.bingo_games SET short_code = substr(md5(random()::text), 1, 6) WHERE short_code IS NULL;

COMMIT;
