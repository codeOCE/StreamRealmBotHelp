-- ============================================
-- 003_bingo.sql
-- Bingo integration (src/integrations/bingo).
--
-- A creator defines a game with a pool of potential "tiles" (events that might
-- happen on stream). Viewers each generate a randomized card drawn from that
-- pool via the public play link (no login). As the creator "calls" tiles, every
-- card marks matching cells; a card wins when it completes a line (or the whole
-- board, depending on win_condition).
--
-- Cards never store their own marks — a cell is "marked" iff its tile is in the
-- game's `called` list (or it's the FREE space), so calling/uncalling a tile is
-- a single write that updates every card at once.
-- ============================================

BEGIN;

-- A bingo game owned by a streamer. At most one active game per streamer
-- (enforced by the partial unique index below).
CREATE TABLE IF NOT EXISTS bot.bingo_games (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id   UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    title         TEXT NOT NULL DEFAULT 'Stream Bingo',
    size          INTEGER NOT NULL DEFAULT 5,        -- N x N board
    free_space    BOOLEAN NOT NULL DEFAULT true,     -- center FREE cell (odd sizes)
    win_condition TEXT NOT NULL DEFAULT 'line',      -- line | full
    tiles         JSONB NOT NULL DEFAULT '[]'::jsonb, -- pool of potential tiles (strings)
    called        JSONB NOT NULL DEFAULT '[]'::jsonb, -- called tiles, in order
    status        TEXT NOT NULL DEFAULT 'draft',     -- draft | active | ended
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at    TIMESTAMPTZ,
    ended_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bingo_games_streamer ON bot.bingo_games(streamer_id);
-- Only one game may be 'active' per streamer at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bingo_games_one_active
    ON bot.bingo_games(streamer_id) WHERE status = 'active';

-- A viewer's card for a game. One card per (game, player). `cells` is a flat
-- array of length size*size; the literal 'FREE' marks the free space. Marks are
-- derived from bingo_games.called, not stored here. has_bingo is a cached result
-- recomputed by the Worker whenever a tile is called/uncalled.
CREATE TABLE IF NOT EXISTS bot.bingo_cards (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id    UUID NOT NULL REFERENCES bot.bingo_games(id) ON DELETE CASCADE,
    player_id  TEXT NOT NULL,                 -- client-generated stable id (or twitch id)
    name       TEXT NOT NULL DEFAULT 'Player',
    cells      JSONB NOT NULL DEFAULT '[]'::jsonb,
    has_bingo  BOOLEAN NOT NULL DEFAULT false,
    bingo_at   TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (game_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_bingo_cards_game ON bot.bingo_cards(game_id);

-- Defense-in-depth: the Worker uses the service-role key (bypasses RLS) and does
-- its own authorization. Viewers reach games/cards through the Worker's public
-- routes, not the anon key, so enable RLS with no policy (deny direct anon/auth
-- access), consistent with the other bot.* tables (002_enable_rls.sql).
ALTER TABLE bot.bingo_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.bingo_cards ENABLE ROW LEVEL SECURITY;

GRANT ALL ON bot.bingo_games, bot.bingo_cards TO service_role;

COMMIT;
