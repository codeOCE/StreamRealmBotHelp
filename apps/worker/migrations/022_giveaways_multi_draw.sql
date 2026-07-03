-- ============================================
-- 022_giveaways_multi_draw.sql
-- Fix draw_giveaway_winner: support drawing up to winner_count winners
-- before flipping status to 'drawn' (was marking drawn after the first draw).
-- ============================================

BEGIN;

CREATE OR REPLACE FUNCTION bot.draw_giveaway_winner(
    p_streamer_id UUID,
    p_giveaway_id UUID
)
RETURNS TABLE (ok BOOLEAN, reason TEXT, winner_twitch_id TEXT, winner_name TEXT)
LANGUAGE plpgsql AS $$
DECLARE
    v_vid TEXT; v_vname TEXT; v_winner_count INTEGER; v_win_count INTEGER;
BEGIN
    SELECT winner_count INTO v_winner_count
      FROM bot.giveaways WHERE id = p_giveaway_id AND streamer_id = p_streamer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN QUERY SELECT FALSE, 'no giveaway', NULL::TEXT, NULL::TEXT; RETURN; END IF;

    SELECT count(*) INTO v_win_count FROM bot.giveaway_winners WHERE giveaway_id = p_giveaway_id;
    IF v_win_count >= v_winner_count THEN
        RETURN QUERY SELECT FALSE, 'all winners drawn', NULL::TEXT, NULL::TEXT; RETURN;
    END IF;

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

    SELECT count(*) INTO v_win_count FROM bot.giveaway_winners WHERE giveaway_id = p_giveaway_id;
    IF v_win_count >= v_winner_count THEN
        UPDATE bot.giveaways SET status = 'drawn', updated_at = NOW(), closed_at = COALESCE(closed_at, NOW())
          WHERE id = p_giveaway_id;
    END IF;

    RETURN QUERY SELECT TRUE, 'ok', v_vid, v_vname;
END;
$$;

COMMIT;
