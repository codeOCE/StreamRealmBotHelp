-- ============================================
-- 019_giveaways.sql
-- Giveaways / raffles (the StreamElements "Giveaway" feature).
--
-- A creator opens a giveaway from the dashboard. Viewers join in chat with
-- !enter / !join. Entries can be free or cost loyalty Points (bot.viewer_profiles.
-- points), and subscribers can be given weighted "luck". The creator draws one
-- (or more) random winners; draws are weighted by entry weight (sub luck) using
-- A-Res weighted reservoir sampling. Entry + draw are atomic RPCs so Points
-- can't be double-spent and a viewer can't win twice in the same giveaway.
--
-- At most one giveaway per streamer may be 'open' at a time (partial unique idx).
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.giveaways (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id   UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    title         TEXT NOT NULL DEFAULT 'Giveaway',
    entry_cost    INTEGER NOT NULL DEFAULT 0 CHECK (entry_cost >= 0),   -- Points per entry (0 = free)
    sub_luck      INTEGER NOT NULL DEFAULT 1 CHECK (sub_luck >= 1),     -- entry weight for subscribers
    winner_count  INTEGER NOT NULL DEFAULT 1 CHECK (winner_count >= 1), -- advisory: how many to draw
    -- open | closed | drawn
    status        TEXT NOT NULL DEFAULT 'open',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_giveaways_streamer ON bot.giveaways(streamer_id, created_at DESC);
-- Only one giveaway may be 'open' per streamer at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_giveaways_one_open ON bot.giveaways(streamer_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS bot.giveaway_entries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    giveaway_id      UUID NOT NULL REFERENCES bot.giveaways(id) ON DELETE CASCADE,
    viewer_twitch_id TEXT NOT NULL,
    viewer_name      TEXT NOT NULL DEFAULT '',
    weight           INTEGER NOT NULL DEFAULT 1 CHECK (weight >= 1),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (giveaway_id, viewer_twitch_id)
);
CREATE INDEX IF NOT EXISTS idx_giveaway_entries_giveaway ON bot.giveaway_entries(giveaway_id);

CREATE TABLE IF NOT EXISTS bot.giveaway_winners (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    giveaway_id      UUID NOT NULL REFERENCES bot.giveaways(id) ON DELETE CASCADE,
    viewer_twitch_id TEXT NOT NULL,
    viewer_name      TEXT NOT NULL DEFAULT '',
    drawn_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_giveaway_winners_giveaway ON bot.giveaway_winners(giveaway_id, drawn_at DESC);

-- Atomic enter: validates the giveaway is open, dedups per viewer, optionally
-- charges Points (under a row lock so a viewer can't overspend on a double-send),
-- then records the weighted entry. Returns the running entry count.
CREATE OR REPLACE FUNCTION bot.enter_giveaway(
    p_streamer_id UUID,
    p_giveaway_id UUID,
    p_viewer      TEXT,
    p_username    TEXT,
    p_weight      INTEGER
)
RETURNS TABLE (ok BOOLEAN, reason TEXT, total_entries INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    v_status TEXT; v_cost INTEGER; v_points INTEGER; v_profile UUID; v_count INTEGER;
BEGIN
    SELECT status, entry_cost INTO v_status, v_cost
      FROM bot.giveaways WHERE id = p_giveaway_id AND streamer_id = p_streamer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN QUERY SELECT FALSE, 'no giveaway', 0; RETURN; END IF;
    IF v_status <> 'open' THEN RETURN QUERY SELECT FALSE, 'closed', 0; RETURN; END IF;

    IF EXISTS (SELECT 1 FROM bot.giveaway_entries WHERE giveaway_id = p_giveaway_id AND viewer_twitch_id = p_viewer) THEN
        RETURN QUERY SELECT FALSE, 'already entered', 0; RETURN;
    END IF;

    IF v_cost > 0 THEN
        SELECT id, points INTO v_profile, v_points
          FROM bot.viewer_profiles WHERE streamer_id = p_streamer_id AND twitch_user_id = p_viewer FOR UPDATE;
        IF NOT FOUND THEN RETURN QUERY SELECT FALSE, 'no points', 0; RETURN; END IF;
        IF v_points < v_cost THEN RETURN QUERY SELECT FALSE, 'not enough points', 0; RETURN; END IF;
        UPDATE bot.viewer_profiles SET points = points - v_cost WHERE id = v_profile;
    END IF;

    INSERT INTO bot.giveaway_entries (giveaway_id, viewer_twitch_id, viewer_name, weight)
      VALUES (p_giveaway_id, p_viewer, p_username, GREATEST(1, COALESCE(p_weight, 1)));

    SELECT count(*) INTO v_count FROM bot.giveaway_entries WHERE giveaway_id = p_giveaway_id;
    RETURN QUERY SELECT TRUE, 'ok', v_count;
END;
$$;

-- Atomic draw: weighted-random winner among entries who haven't already won this
-- giveaway. Uses A-Res weighted reservoir sampling: key = random()^(1/weight),
-- pick the largest key. Records the winner and flips status to 'drawn'.
CREATE OR REPLACE FUNCTION bot.draw_giveaway_winner(
    p_streamer_id UUID,
    p_giveaway_id UUID
)
RETURNS TABLE (ok BOOLEAN, reason TEXT, winner_twitch_id TEXT, winner_name TEXT)
LANGUAGE plpgsql AS $$
DECLARE
    v_vid TEXT; v_vname TEXT;
BEGIN
    PERFORM 1 FROM bot.giveaways WHERE id = p_giveaway_id AND streamer_id = p_streamer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN QUERY SELECT FALSE, 'no giveaway', NULL::TEXT, NULL::TEXT; RETURN; END IF;

    SELECT e.viewer_twitch_id, e.viewer_name INTO v_vid, v_vname
      FROM bot.giveaway_entries e
      WHERE e.giveaway_id = p_giveaway_id
        AND NOT EXISTS (
            SELECT 1 FROM bot.giveaway_winners w
            WHERE w.giveaway_id = p_giveaway_id AND w.viewer_twitch_id = e.viewer_twitch_id
        )
      ORDER BY power(random(), 1.0 / GREATEST(e.weight, 1)) DESC
      LIMIT 1;

    IF v_vid IS NULL THEN RETURN QUERY SELECT FALSE, 'no entries', NULL::TEXT, NULL::TEXT; RETURN; END IF;

    INSERT INTO bot.giveaway_winners (giveaway_id, viewer_twitch_id, viewer_name)
      VALUES (p_giveaway_id, v_vid, v_vname);
    UPDATE bot.giveaways SET status = 'drawn', updated_at = NOW() WHERE id = p_giveaway_id;

    RETURN QUERY SELECT TRUE, 'ok', v_vid, v_vname;
END;
$$;

-- Defense-in-depth: RLS on, no policy (deny direct anon/auth); the Worker uses
-- the service-role key and authorizes itself. Consistent with 002..018.
ALTER TABLE bot.giveaways         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.giveaway_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.giveaway_winners  ENABLE ROW LEVEL SECURITY;

GRANT ALL ON bot.giveaways, bot.giveaway_entries, bot.giveaway_winners TO service_role;

COMMIT;
