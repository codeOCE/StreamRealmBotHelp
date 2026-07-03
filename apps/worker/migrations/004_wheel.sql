-- ============================================
-- 004_wheel.sql
-- Wheel Spin integration (src/integrations/wheel-spin).
--
-- A creator configures one or more wheels (a list of segments, each with an
-- optional weight + color). The creator spins from the dashboard; the Worker
-- picks a weighted-random segment, records the spin, and broadcasts it on
-- channel `wheel:<wheelId>` so the OBS overlay animates to the result.
-- The wheel is a single shared object (unlike bingo's per-viewer cards).
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.wheels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT 'Wheel',
    -- [{ label, weight?, color? }]
    segments    JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wheels_streamer ON bot.wheels(streamer_id);

-- Spin history (most recent results power the dashboard + overlay recap).
CREATE TABLE IF NOT EXISTS bot.wheel_spins (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wheel_id      UUID NOT NULL REFERENCES bot.wheels(id) ON DELETE CASCADE,
    streamer_id   UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    result        TEXT NOT NULL,
    segment_index INTEGER NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wheel_spins_wheel ON bot.wheel_spins(wheel_id, created_at DESC);

-- Defense-in-depth: RLS on, no policy (deny direct anon/auth); the Worker uses
-- the service-role key and authorizes itself. Consistent with 002/003.
ALTER TABLE bot.wheels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.wheel_spins ENABLE ROW LEVEL SECURITY;

GRANT ALL ON bot.wheels, bot.wheel_spins TO service_role;

COMMIT;
