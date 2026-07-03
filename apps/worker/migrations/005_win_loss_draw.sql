-- ============================================
-- 005_win_loss_draw.sql
-- Win/Loss/Draw record overlay (src/integrations/win-loss-draw).
--
-- A creator tracks a session record (wins/losses/draws) and fully customizes its
-- appearance (layout, colors, fonts, box styling) via a JSONB `config`. The
-- counts + style are broadcast on `wld:<boardId>` so the OBS overlay updates
-- live as the creator adjusts the score or restyles it.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.wld_boards (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT 'Scoreboard',
    wins        INTEGER NOT NULL DEFAULT 0,
    losses      INTEGER NOT NULL DEFAULT 0,
    draws       INTEGER NOT NULL DEFAULT 0,
    -- Style overrides; merged over the worker's DEFAULT_CONFIG on read.
    config      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wld_boards_streamer ON bot.wld_boards(streamer_id);

-- Defense-in-depth: RLS on, no policy (deny direct anon/auth); the Worker uses
-- the service-role key and authorizes itself. Consistent with 002/003/004.
ALTER TABLE bot.wld_boards ENABLE ROW LEVEL SECURITY;

GRANT ALL ON bot.wld_boards TO service_role;

COMMIT;
