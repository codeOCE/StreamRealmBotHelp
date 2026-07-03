-- ============================================
-- 014_quotes.sql
-- Quote system for the chat bot (!quote / !addquote / !delquote) — a staple of
-- Nightbot/StreamElements. Quotes are numbered per streamer (quote_number),
-- which is what chat refers to ("!quote 12"), separate from the row UUID.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.quotes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id  UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    quote_number INTEGER NOT NULL,
    text         TEXT NOT NULL,
    added_by     TEXT,
    game         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (streamer_id, quote_number)
);
CREATE INDEX IF NOT EXISTS idx_quotes_streamer ON bot.quotes(streamer_id);

-- Insert with the next per-streamer number, atomically enough for chat-speed
-- writes (the UNIQUE constraint backstops the rare concurrent add).
CREATE OR REPLACE FUNCTION bot.add_quote(p_streamer_id UUID, p_text TEXT, p_added_by TEXT, p_game TEXT)
RETURNS INTEGER
LANGUAGE sql AS $$
    INSERT INTO bot.quotes (streamer_id, quote_number, text, added_by, game)
    VALUES (
        p_streamer_id,
        COALESCE((SELECT MAX(quote_number) FROM bot.quotes WHERE streamer_id = p_streamer_id), 0) + 1,
        p_text,
        p_added_by,
        p_game
    )
    RETURNING quote_number;
$$;

-- PostgREST cannot ORDER BY random(), so random pick is a function.
CREATE OR REPLACE FUNCTION bot.random_quote(p_streamer_id UUID)
RETURNS SETOF bot.quotes
LANGUAGE sql AS $$
    SELECT * FROM bot.quotes WHERE streamer_id = p_streamer_id ORDER BY random() LIMIT 1;
$$;

-- Service-role-only, same posture as the rest of the bot schema.
ALTER TABLE bot.quotes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA bot TO service_role;

COMMIT;
