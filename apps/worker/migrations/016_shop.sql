-- ============================================
-- 016_shop.sql
-- "The Royal Shop" — Castle's loyalty store (the StreamElements points store,
-- castle-themed). Viewers spend channel Points (bot.viewer_profiles.points) on
-- creator-defined rewards; redemptions land in a fulfillment queue the creator
-- works through. Redeem/refund are atomic RPCs so points can't be double-spent.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.shop_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id    UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    code           TEXT NOT NULL,                 -- short slug for !buy <code>
    name           TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    icon           TEXT,
    cost           INTEGER NOT NULL CHECK (cost >= 0),
    stock          INTEGER,                       -- NULL = unlimited
    per_user_limit INTEGER,                       -- NULL = no limit
    enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    sort           INTEGER NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (streamer_id, code)
);
CREATE INDEX IF NOT EXISTS shop_items_streamer_idx ON bot.shop_items (streamer_id, sort);

CREATE TABLE IF NOT EXISTS bot.shop_redemptions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id      UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    item_id          UUID REFERENCES bot.shop_items(id) ON DELETE SET NULL,
    item_name        TEXT NOT NULL DEFAULT '',
    viewer_twitch_id TEXT NOT NULL,
    viewer_name      TEXT NOT NULL DEFAULT '',
    cost             INTEGER NOT NULL DEFAULT 0,   -- snapshot at redeem time
    -- pending | fulfilled | refunded
    status           TEXT NOT NULL DEFAULT 'pending',
    note             TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS shop_redemptions_queue_idx
    ON bot.shop_redemptions (streamer_id, status, created_at DESC);

-- Atomic redeem: validates item/stock/limit/balance, deducts points, decrements
-- stock, and queues the redemption — all under row locks so concurrent !buy
-- can't overspend or oversell.
CREATE OR REPLACE FUNCTION bot.redeem_shop_item(
    p_streamer_id UUID,
    p_item_id     UUID,
    p_viewer      TEXT,
    p_username    TEXT
)
RETURNS TABLE (ok BOOLEAN, reason TEXT, item_name TEXT, remaining_points INTEGER, redemption_id UUID)
LANGUAGE plpgsql AS $$
DECLARE
    v_cost INTEGER; v_enabled BOOLEAN; v_stock INTEGER; v_limit INTEGER; v_name TEXT;
    v_points INTEGER; v_profile UUID; v_used INTEGER; v_redid UUID;
BEGIN
    SELECT cost, enabled, stock, per_user_limit, name
      INTO v_cost, v_enabled, v_stock, v_limit, v_name
      FROM bot.shop_items WHERE id = p_item_id AND streamer_id = p_streamer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN QUERY SELECT FALSE, 'no such item', ''::TEXT, 0, NULL::UUID; RETURN; END IF;
    IF NOT v_enabled THEN RETURN QUERY SELECT FALSE, 'item unavailable', v_name, 0, NULL::UUID; RETURN; END IF;
    IF v_stock IS NOT NULL AND v_stock <= 0 THEN RETURN QUERY SELECT FALSE, 'out of stock', v_name, 0, NULL::UUID; RETURN; END IF;

    SELECT id, points INTO v_profile, v_points
      FROM bot.viewer_profiles WHERE streamer_id = p_streamer_id AND twitch_user_id = p_viewer FOR UPDATE;
    IF NOT FOUND THEN RETURN QUERY SELECT FALSE, 'no points yet', v_name, 0, NULL::UUID; RETURN; END IF;
    IF v_points < v_cost THEN RETURN QUERY SELECT FALSE, 'not enough points', v_name, v_points, NULL::UUID; RETURN; END IF;

    IF v_limit IS NOT NULL THEN
        SELECT count(*) INTO v_used FROM bot.shop_redemptions
          WHERE item_id = p_item_id AND viewer_twitch_id = p_viewer AND status <> 'refunded';
        IF v_used >= v_limit THEN RETURN QUERY SELECT FALSE, 'limit reached', v_name, v_points, NULL::UUID; RETURN; END IF;
    END IF;

    UPDATE bot.viewer_profiles SET points = points - v_cost WHERE id = v_profile;
    IF v_stock IS NOT NULL THEN UPDATE bot.shop_items SET stock = stock - 1 WHERE id = p_item_id; END IF;
    INSERT INTO bot.shop_redemptions (streamer_id, item_id, item_name, viewer_twitch_id, viewer_name, cost, status)
      VALUES (p_streamer_id, p_item_id, v_name, p_viewer, p_username, v_cost, 'pending')
      RETURNING id INTO v_redid;

    RETURN QUERY SELECT TRUE, v_name, v_name, v_points - v_cost, v_redid;
END;
$$;

-- Atomic refund: refunds points (and restocks) once, then marks the redemption.
CREATE OR REPLACE FUNCTION bot.refund_shop_redemption(
    p_streamer_id UUID,
    p_redemption_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
    v_cost INTEGER; v_item UUID; v_viewer TEXT; v_status TEXT;
BEGIN
    SELECT cost, item_id, viewer_twitch_id, status INTO v_cost, v_item, v_viewer, v_status
      FROM bot.shop_redemptions WHERE id = p_redemption_id AND streamer_id = p_streamer_id FOR UPDATE;
    IF NOT FOUND OR v_status = 'refunded' THEN RETURN FALSE; END IF;

    UPDATE bot.viewer_profiles SET points = points + v_cost
      WHERE streamer_id = p_streamer_id AND twitch_user_id = v_viewer;
    IF v_item IS NOT NULL THEN
        UPDATE bot.shop_items SET stock = stock + 1 WHERE id = v_item AND stock IS NOT NULL;
    END IF;
    UPDATE bot.shop_redemptions SET status = 'refunded', resolved_at = NOW() WHERE id = p_redemption_id;
    RETURN TRUE;
END;
$$;

ALTER TABLE bot.shop_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.shop_redemptions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA bot TO service_role;

COMMIT;
