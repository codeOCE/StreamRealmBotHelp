-- ============================================
-- 018_counters.sql
-- Named chat counters (death counter, etc.) — the classic Nightbot feature.
--   !count <name>            show a counter
--   !addcount <name> [n]     add n (default 1)   [mod]
--   !setcount <name> <n>     set to n            [mod]
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.counters (
    streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    value       BIGINT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (streamer_id, name)
);

-- Atomic add (creates the counter at the delta on first use). Returns new value.
CREATE OR REPLACE FUNCTION bot.bump_counter(p_streamer_id UUID, p_name TEXT, p_delta BIGINT)
RETURNS BIGINT LANGUAGE sql AS $$
    INSERT INTO bot.counters (streamer_id, name, value, updated_at)
    VALUES (p_streamer_id, lower(p_name), p_delta, NOW())
    ON CONFLICT (streamer_id, name)
    DO UPDATE SET value = bot.counters.value + p_delta, updated_at = NOW()
    RETURNING value;
$$;

-- Set to an absolute value. Returns new value.
CREATE OR REPLACE FUNCTION bot.set_counter(p_streamer_id UUID, p_name TEXT, p_value BIGINT)
RETURNS BIGINT LANGUAGE sql AS $$
    INSERT INTO bot.counters (streamer_id, name, value, updated_at)
    VALUES (p_streamer_id, lower(p_name), p_value, NOW())
    ON CONFLICT (streamer_id, name)
    DO UPDATE SET value = p_value, updated_at = NOW()
    RETURNING value;
$$;

ALTER TABLE bot.counters ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA bot TO service_role;

COMMIT;
