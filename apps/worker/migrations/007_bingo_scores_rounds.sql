-- ============================================
-- 007_bingo_scores_rounds.sql
-- Bingo: per-channel season leaderboard + back-to-back rounds.
--
-- bot.bingo_scores: cumulative points/wins/plays per (streamer, viewer). Points
-- are awarded on a viewer's first confirmed win in a game (finish rank + pattern
-- bonus); plays increments when they pick up their first card in a game. A
-- creator "reset leaderboard" simply deletes their rows (= new season).
--
-- bingo_games.round: incremented by the "next round" action, which re-deals every
-- card and clears marks so the same players play again with no re-join.
--
-- bot.* only; references public.streamers read-only. Idempotent + transactional.
-- ============================================

BEGIN;

ALTER TABLE bot.bingo_games ADD COLUMN IF NOT EXISTS round INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS bot.bingo_scores (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id    UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    user_twitch_id TEXT NOT NULL,
    username       TEXT NOT NULL DEFAULT 'Player',
    points         INTEGER NOT NULL DEFAULT 0,
    wins           INTEGER NOT NULL DEFAULT 0,
    plays          INTEGER NOT NULL DEFAULT 0,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (streamer_id, user_twitch_id)
);
CREATE INDEX IF NOT EXISTS idx_bingo_scores_leaderboard ON bot.bingo_scores(streamer_id, points DESC);

ALTER TABLE bot.bingo_scores ENABLE ROW LEVEL SECURITY;
GRANT ALL ON bot.bingo_scores TO service_role;

COMMIT;
