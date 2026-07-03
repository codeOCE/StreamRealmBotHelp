-- ============================================
-- 020_polls.sql
-- Chat polls (the StreamElements "Poll" / crowd-vote feature).
--
-- A creator opens a poll with 2–6 options from the dashboard. Viewers vote in
-- chat with !vote <n>. One vote per viewer; re-voting moves the vote (the unique
-- (poll_id, viewer) row is updated). Casting a vote is an atomic RPC that returns
-- the live per-option tally so the dashboard/overlay can update immediately.
--
-- At most one poll per streamer may be 'open' at a time (partial unique index).
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.polls (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    question    TEXT NOT NULL DEFAULT 'Poll',
    options     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of option labels (strings)
    -- open | closed
    status      TEXT NOT NULL DEFAULT 'open',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_polls_streamer ON bot.polls(streamer_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_polls_one_open ON bot.polls(streamer_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS bot.poll_votes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id          UUID NOT NULL REFERENCES bot.polls(id) ON DELETE CASCADE,
    viewer_twitch_id TEXT NOT NULL,
    option_index     INTEGER NOT NULL CHECK (option_index >= 0),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (poll_id, viewer_twitch_id)
);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON bot.poll_votes(poll_id);

-- Atomic vote: validates the poll is open and the option is in range, upserts the
-- viewer's single vote (re-vote moves it), and returns the live per-option counts
-- as an INTEGER[] aligned to the options array.
CREATE OR REPLACE FUNCTION bot.cast_poll_vote(
    p_streamer_id UUID,
    p_poll_id     UUID,
    p_viewer      TEXT,
    p_option      INTEGER
)
RETURNS TABLE (ok BOOLEAN, reason TEXT, counts INTEGER[])
LANGUAGE plpgsql AS $$
DECLARE
    v_status TEXT; v_len INTEGER; v_counts INTEGER[];
BEGIN
    SELECT status, jsonb_array_length(options) INTO v_status, v_len
      FROM bot.polls WHERE id = p_poll_id AND streamer_id = p_streamer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN QUERY SELECT FALSE, 'no poll', NULL::INTEGER[]; RETURN; END IF;
    IF v_status <> 'open' THEN RETURN QUERY SELECT FALSE, 'closed', NULL::INTEGER[]; RETURN; END IF;
    IF p_option < 0 OR p_option >= v_len THEN RETURN QUERY SELECT FALSE, 'bad option', NULL::INTEGER[]; RETURN; END IF;

    INSERT INTO bot.poll_votes (poll_id, viewer_twitch_id, option_index)
      VALUES (p_poll_id, p_viewer, p_option)
      ON CONFLICT (poll_id, viewer_twitch_id)
      DO UPDATE SET option_index = EXCLUDED.option_index, created_at = NOW();

    SELECT array_agg(c ORDER BY i) INTO v_counts
      FROM generate_series(0, v_len - 1) AS i
      LEFT JOIN LATERAL (
        SELECT count(*)::INTEGER AS c FROM bot.poll_votes v WHERE v.poll_id = p_poll_id AND v.option_index = i
      ) t ON TRUE;

    RETURN QUERY SELECT TRUE, 'ok', COALESCE(v_counts, ARRAY[]::INTEGER[]);
END;
$$;

-- Read-only tally for the dashboard/route.
CREATE OR REPLACE FUNCTION bot.poll_results(p_poll_id UUID)
RETURNS INTEGER[]
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_len INTEGER; v_counts INTEGER[];
BEGIN
    SELECT jsonb_array_length(options) INTO v_len FROM bot.polls WHERE id = p_poll_id;
    IF v_len IS NULL THEN RETURN ARRAY[]::INTEGER[]; END IF;
    SELECT array_agg(c ORDER BY i) INTO v_counts
      FROM generate_series(0, v_len - 1) AS i
      LEFT JOIN LATERAL (
        SELECT count(*)::INTEGER AS c FROM bot.poll_votes v WHERE v.poll_id = p_poll_id AND v.option_index = i
      ) t ON TRUE;
    RETURN COALESCE(v_counts, ARRAY[]::INTEGER[]);
END;
$$;

ALTER TABLE bot.polls      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.poll_votes ENABLE ROW LEVEL SECURITY;

GRANT ALL ON bot.polls, bot.poll_votes TO service_role;

COMMIT;
