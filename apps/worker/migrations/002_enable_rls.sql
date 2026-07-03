-- ============================================
-- 002_enable_rls.sql
-- Row Level Security for the `bot` schema (CreatorCastle).
--
-- The Worker connects with the service-role key, which BYPASSES RLS, so the
-- application authorizes requests itself (src/lib/session.ts). These policies
-- are defense-in-depth against direct anon/authenticated-key access: deny by
-- default, with a narrow public-read carve-out for public overlays (loaded by
-- unauthenticated OBS browser sources).
-- (Mirrors TCG/mulistreamer-tcg/migrations/002_enable_rls.sql.)
-- ============================================

BEGIN;

ALTER TABLE bot.tenants           ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.onboarding        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.integrations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.commands          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.song_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.timers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.mod_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.viewer_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.skill_nodes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.user_skills       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.achievements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.seasons           ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.battles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.chat_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.event_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.audit_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.overlays          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.overlay_widgets   ENABLE ROW LEVEL SECURITY;

-- Public read: a public overlay + its widgets can be rendered by an
-- unauthenticated browser source (loaded by url_slug).
DROP POLICY IF EXISTS "Public read public overlays" ON bot.overlays;
CREATE POLICY "Public read public overlays" ON bot.overlays
    FOR SELECT USING (is_public = true);

DROP POLICY IF EXISTS "Public read widgets of public overlays" ON bot.overlay_widgets;
CREATE POLICY "Public read widgets of public overlays" ON bot.overlay_widgets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM bot.overlays o
            WHERE o.id = bot.overlay_widgets.overlay_id AND o.is_public = true
        )
    );

-- The anon role needs SELECT privilege in addition to a permissive policy.
GRANT SELECT ON bot.overlays, bot.overlay_widgets TO anon;

-- All other bot tables have RLS enabled with no policy: anon/authenticated
-- access is fully denied. The Worker (service-role) is unaffected.

COMMIT;
