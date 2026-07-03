-- ============================================
-- 001_initial_schema.sql
-- CreatorCastle bot platform — runs in the SHARED Creator Castle Supabase DB
-- (the same project as TCG/mulistreamer-tcg).
--
-- Shared identity (already exists, NOT created here):
--   public.streamers  — creator/channel identity (id UUID, twitch_id unique,
--                        holds the creator's own Twitch token + branding).
--   public.users      — collector/viewer identity (twitch_id PK).
--
-- CreatorCastle's `User` maps to public.streamers. CreatorCastle's `Tenant`
-- collapses into bot.tenants (1:1 extension of streamers). All CreatorCastle
-- tables live in the dedicated `bot` schema, scoped by
--   streamer_id UUID REFERENCES public.streamers(id).
-- Translated from packages/database/prisma/schema.prisma.
-- ============================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS bot;

-- PostgREST/supabase-js reach the schema via client.schema('bot'); these roles
-- need USAGE. (`bot` must also be added to the project's Exposed Schemas — see README.)
GRANT USAGE ON SCHEMA bot TO service_role, authenticated, anon;

-- 1. bot.tenants — CreatorCastle channel config, 1:1 with a streamer ----------
-- name / twitch_id / display come from public.streamers (shared identity).
-- CreatorCastle uses its OWN Twitch app, so the streamer's user token from
-- /auth/twitch is stored HERE (encrypted_creator_*), NOT in
-- public.streamers.twitch_* (which is bound to the TCG's client_id).
-- encrypted_bot_* is the separate chat-bot account token.
CREATE TABLE IF NOT EXISTS bot.tenants (
    streamer_id                    UUID PRIMARY KEY REFERENCES public.streamers(id) ON DELETE CASCADE,
    plan_tier                      TEXT NOT NULL DEFAULT 'FREE',
    stripe_sub_id                  TEXT,
    settings                       JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_connected                   BOOLEAN NOT NULL DEFAULT false,
    -- Streamer's own Twitch token (CreatorCastle app), encrypted.
    encrypted_creator_access_token  TEXT,
    encrypted_creator_refresh_token TEXT,
    creator_token_scope            TEXT,
    creator_token_expires_at       TIMESTAMPTZ,
    -- Optional dedicated chat-bot account token.
    encrypted_bot_access_token     TEXT,
    encrypted_bot_refresh_token    TEXT,
    bot_username                   TEXT,
    target_channel                 TEXT,
    created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. bot.onboarding (1:1 with streamer) --------------------------------------
CREATE TABLE IF NOT EXISTS bot.onboarding (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id            UUID UNIQUE NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    has_linked_bot         BOOLEAN NOT NULL DEFAULT false,
    has_created_command    BOOLEAN NOT NULL DEFAULT false,
    has_enabled_moderation BOOLEAN NOT NULL DEFAULT false,
    has_visited_dashboard  BOOLEAN NOT NULL DEFAULT false,
    has_imported_commands  BOOLEAN NOT NULL DEFAULT false,
    completed_at           TIMESTAMPTZ
);

-- 3. bot.integrations --------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot.integrations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id             UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    provider                TEXT NOT NULL, -- nightbot | streamelements | fossabot
    external_user_id        TEXT,
    encrypted_access_token  TEXT NOT NULL,
    encrypted_refresh_token TEXT,
    token_expires_at        TIMESTAMPTZ,
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (streamer_id, provider)
);

-- 4. bot.commands ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot.commands (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id   UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    trigger       TEXT NOT NULL,
    enabled       BOOLEAN NOT NULL DEFAULT true,
    cooldown      INTEGER NOT NULL DEFAULT 0,
    user_cooldown INTEGER NOT NULL DEFAULT 0,
    user_level    TEXT NOT NULL DEFAULT 'VIEWER',
    responses     JSONB NOT NULL DEFAULT '[]'::jsonb,
    response_type TEXT NOT NULL DEFAULT 'SAY',
    aliases       JSONB NOT NULL DEFAULT '[]'::jsonb,
    usages        INTEGER NOT NULL DEFAULT 0,
    description   TEXT,
    category      TEXT NOT NULL DEFAULT 'General',
    is_built_in   BOOLEAN NOT NULL DEFAULT false,
    is_regex      BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (streamer_id, trigger)
);

-- 5. bot.song_requests -------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot.song_requests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id  UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    requested_by TEXT NOT NULL,
    user_name    TEXT NOT NULL DEFAULT '',
    song_title   TEXT NOT NULL,
    artist       TEXT,
    spotify_uri  TEXT NOT NULL,
    query        TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|PLAYING|COMPLETED|SKIPPED
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    played_at    TIMESTAMPTZ,
    duration     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_song_requests_streamer ON bot.song_requests(streamer_id);

-- 6. bot.timers --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot.timers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id      UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    message          TEXT NOT NULL,
    interval_seconds INTEGER NOT NULL DEFAULT 300,
    chat_lines       INTEGER NOT NULL DEFAULT 1,
    enabled          BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (streamer_id, name)
);

-- 7. bot.mod_rules -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot.mod_rules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    settings    JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_mod_rules_streamer ON bot.mod_rules(streamer_id);

-- 8. bot.viewer_profiles -----------------------------------------------------
-- Per-channel chat loyalty/XP state. twitch_user_id corresponds to
-- public.users.twitch_id but is a soft reference (chatters may have no collector
-- account), so it is kept as TEXT without a FK.
CREATE TABLE IF NOT EXISTS bot.viewer_profiles (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id    UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    twitch_user_id TEXT NOT NULL,
    username       TEXT NOT NULL,
    xp             INTEGER NOT NULL DEFAULT 0,
    level          INTEGER NOT NULL DEFAULT 1,
    points         INTEGER NOT NULL DEFAULT 0,
    watch_time     INTEGER NOT NULL DEFAULT 0,
    first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    prestige_level INTEGER NOT NULL DEFAULT 0,
    skill_points   INTEGER NOT NULL DEFAULT 0,
    season_xp      INTEGER NOT NULL DEFAULT 0,
    mmr            INTEGER NOT NULL DEFAULT 1000,
    UNIQUE (streamer_id, twitch_user_id)
);

-- 9. bot.skill_nodes (self-referential tree) ---------------------------------
CREATE TABLE IF NOT EXISTS bot.skill_nodes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id  UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL,
    effect_type  TEXT NOT NULL,
    effect_value DOUBLE PRECISION NOT NULL,
    cost         INTEGER NOT NULL,
    parent_id    UUID REFERENCES bot.skill_nodes(id)
);
CREATE INDEX IF NOT EXISTS idx_skill_nodes_streamer ON bot.skill_nodes(streamer_id);

-- 10. bot.user_skills --------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot.user_skills (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viewer_profile_id UUID NOT NULL REFERENCES bot.viewer_profiles(id) ON DELETE CASCADE,
    skill_node_id     UUID NOT NULL REFERENCES bot.skill_nodes(id) ON DELETE CASCADE,
    unlocked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (viewer_profile_id, skill_node_id)
);

-- 11. bot.achievements (chat-activity achievements; distinct from public.achievements) --
CREATE TABLE IF NOT EXISTS bot.achievements (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id  UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL,
    trigger_type TEXT NOT NULL, -- MESSAGE_COUNT | WATCH_TIME | RAID_PARTICIPATION ...
    threshold    INTEGER NOT NULL,
    reward_xp    INTEGER NOT NULL,
    icon         TEXT
);
CREATE INDEX IF NOT EXISTS idx_achievements_streamer ON bot.achievements(streamer_id);

-- 12. bot.user_achievements --------------------------------------------------
CREATE TABLE IF NOT EXISTS bot.user_achievements (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viewer_profile_id UUID NOT NULL REFERENCES bot.viewer_profiles(id) ON DELETE CASCADE,
    achievement_id    UUID NOT NULL REFERENCES bot.achievements(id) ON DELETE CASCADE,
    unlocked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (viewer_profile_id, achievement_id)
);

-- 13. bot.seasons ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot.seasons (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    start_date  TIMESTAMPTZ NOT NULL,
    end_date    TIMESTAMPTZ,
    is_active   BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_seasons_streamer ON bot.seasons(streamer_id);

-- 14. bot.battles (chat dice battles; distinct from public.battles) -----------
CREATE TABLE IF NOT EXISTS bot.battles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id     UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    challenger_id   UUID NOT NULL REFERENCES bot.viewer_profiles(id),
    opponent_id     UUID NOT NULL REFERENCES bot.viewer_profiles(id),
    challenger_roll INTEGER NOT NULL,
    opponent_roll   INTEGER NOT NULL,
    winner_id       UUID NOT NULL REFERENCES bot.viewer_profiles(id),
    mmr_change      INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_battles_streamer ON bot.battles(streamer_id);

-- 15. bot.chat_logs ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot.chat_logs (
    id          BIGSERIAL PRIMARY KEY,
    streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    viewer_id   TEXT NOT NULL,
    message     TEXT NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_logs_streamer ON bot.chat_logs(streamer_id);

-- 16. bot.event_logs ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot.event_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_logs_streamer ON bot.event_logs(streamer_id);

-- 17. bot.audit_logs ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot.audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,
    actor       TEXT NOT NULL,
    target      TEXT,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_streamer ON bot.audit_logs(streamer_id);

-- 18. bot.overlays -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot.overlays (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    width       INTEGER NOT NULL DEFAULT 1920,
    height      INTEGER NOT NULL DEFAULT 1080,
    config      JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_public   BOOLEAN NOT NULL DEFAULT true,
    url_slug    TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_overlays_streamer ON bot.overlays(streamer_id);
CREATE INDEX IF NOT EXISTS idx_overlays_url_slug ON bot.overlays(url_slug);

-- 19. bot.overlay_widgets ----------------------------------------------------
CREATE TABLE IF NOT EXISTS bot.overlay_widgets (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    overlay_id UUID NOT NULL REFERENCES bot.overlays(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    x          INTEGER NOT NULL DEFAULT 0,
    y          INTEGER NOT NULL DEFAULT 0,
    width      INTEGER NOT NULL DEFAULT 300,
    height     INTEGER NOT NULL DEFAULT 200,
    rotation   INTEGER NOT NULL DEFAULT 0,
    z_index    INTEGER NOT NULL DEFAULT 0,
    config     JSONB NOT NULL DEFAULT '{}'::jsonb,
    styles     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_overlay_widgets_overlay ON bot.overlay_widgets(overlay_id);

-- Privileges: the Worker uses the service-role key (bypasses RLS) but still
-- needs table/sequence grants in this new schema. Cover existing + future objects.
GRANT ALL ON ALL TABLES    IN SCHEMA bot TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA bot TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA bot GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA bot GRANT ALL ON SEQUENCES TO service_role;

COMMIT;
