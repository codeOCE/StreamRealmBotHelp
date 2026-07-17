-- ============================================
-- 034_links_clicks.sql
-- Click counts for link-in-bio links. The public page fires a beacon on
-- click; the increment is an RPC so it's atomic under concurrent clicks.
-- ============================================

BEGIN;

ALTER TABLE bot.profile_links ADD COLUMN IF NOT EXISTS clicks INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION bot.click_profile_link(p_streamer_id UUID, p_link_id UUID)
RETURNS VOID
LANGUAGE sql AS $$
  UPDATE bot.profile_links SET clicks = clicks + 1
   WHERE id = p_link_id AND streamer_id = p_streamer_id AND enabled;
$$;

COMMIT;
