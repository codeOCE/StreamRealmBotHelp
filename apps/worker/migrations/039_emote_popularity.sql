-- ============================================
-- 039_emote_popularity.sql
-- 7TV/BTTV parity for the public vault: rank emotes by how many channels use
-- them (Top), by recent adds (Trending), and expose a "used in N channels" count.
--
-- channel_emotes(streamer_id, emote_id, created_at) already records every add,
-- so popularity is derived live — no denormalized counters to drift. One SQL
-- function does the filtering + counting + sorting + pagination in the DB, since
-- ordering the whole directory by a computed count can't be done client-side.
--   Called by routes/emotes.ts publicDirectory via botSchema(supabase).rpc().
-- ============================================

BEGIN;

CREATE OR REPLACE FUNCTION bot.public_emote_directory(
  p_q          text    DEFAULT '',
  p_tag        text    DEFAULT '',
  p_exact      boolean DEFAULT false,
  p_animated   text    DEFAULT NULL,   -- 'true' | 'false' | NULL (any)
  p_overlaying boolean DEFAULT false,
  p_sort       text    DEFAULT 'new',  -- new | name | top | trending
  p_limit      int     DEFAULT 48,
  p_offset     int     DEFAULT 0
)
RETURNS TABLE (
  id uuid, code text, image_url text, width int, animated boolean,
  zero_width boolean, tags text[], owner_id uuid, created_at timestamptz,
  channel_count bigint, total_count bigint
)
LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT
      e.id, e.code, e.image_url, e.width, e.animated, e.zero_width,
      e.tags, e.owner_id, e.created_at,
      (SELECT count(*) FROM bot.channel_emotes ce WHERE ce.emote_id = e.id) AS channel_count,
      (SELECT count(*) FROM bot.channel_emotes ce
         WHERE ce.emote_id = e.id AND ce.created_at > now() - interval '14 days') AS recent_count
    FROM bot.emotes e
    WHERE e.visibility = 'public' AND e.status = 'approved'
      AND (p_q = '' OR (CASE WHEN p_exact THEN e.code = p_q ELSE e.code ILIKE '%' || p_q || '%' END))
      AND (p_tag = '' OR e.tags @> ARRAY[p_tag])
      AND (p_animated IS NULL OR e.animated = (p_animated = 'true'))
      AND (NOT p_overlaying OR e.zero_width = true)
  )
  SELECT
    id, code, image_url, width, animated, zero_width, tags, owner_id, created_at,
    channel_count,
    count(*) OVER () AS total_count
  FROM base
  ORDER BY
    CASE WHEN p_sort = 'top'      THEN channel_count END DESC NULLS LAST,
    CASE WHEN p_sort = 'trending' THEN recent_count  END DESC NULLS LAST,
    CASE WHEN p_sort = 'name'     THEN code          END ASC  NULLS LAST,
    created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION bot.public_emote_directory(text, text, boolean, text, boolean, text, int, int)
  TO service_role, anon, authenticated;

COMMIT;
