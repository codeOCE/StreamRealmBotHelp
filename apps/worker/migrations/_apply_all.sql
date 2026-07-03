-- ============================================================
-- _apply_all.sql — CreatorCastle bot schema, consolidated.
-- Generated from 001..005 (do not edit; edit the sources).
-- Paste into the Supabase SQL Editor of the SHARED project and run.
-- TCG-safe: only creates bot.* and references public.streamers(id).
-- Each source keeps its own BEGIN/COMMIT (independent transactions).
-- After running: add `bot` to Settings -> API -> Exposed Schemas.
-- ============================================================

-- ---- PREFLIGHT (read-only): confirm TCG identity tables exist ----
-- Fails fast with a clear message instead of a cryptic FK error.
-- Does NOT modify anything.
DO $preflight$
BEGIN
  IF to_regclass('public.streamers') IS NULL THEN
    RAISE EXCEPTION 'Aborting: public.streamers not found. This must run in the SHARED Supabase project that owns the TCG identity tables.';
  END IF;
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Aborting: public.users not found. Wrong database/project?';
  END IF;
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name='streamers' AND column_name='id') <> 'uuid' THEN
    RAISE EXCEPTION 'Aborting: public.streamers.id is not uuid; bot.* foreign keys expect uuid.';
  END IF;
  RAISE NOTICE 'Preflight OK: public.streamers + public.users present, streamers.id is uuid.';
END
$preflight$;

-- >>>>>>>>>>>>>>>>>>>> 001_initial_schema.sql <<<<<<<<<<<<<<<<<<<<

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

-- >>>>>>>>>>>>>>>>>>>> 002_enable_rls.sql <<<<<<<<<<<<<<<<<<<<

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

-- >>>>>>>>>>>>>>>>>>>> 003_bingo.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================
-- 003_bingo.sql
-- Bingo integration (src/integrations/bingo).
--
-- A creator defines a game with a pool of potential "tiles" (events that might
-- happen on stream). Viewers each generate a randomized card drawn from that
-- pool via the public play link (no login). As the creator "calls" tiles, every
-- card marks matching cells; a card wins when it completes a line (or the whole
-- board, depending on win_condition).
--
-- Cards never store their own marks — a cell is "marked" iff its tile is in the
-- game's `called` list (or it's the FREE space), so calling/uncalling a tile is
-- a single write that updates every card at once.
-- ============================================

BEGIN;

-- A bingo game owned by a streamer. At most one active game per streamer
-- (enforced by the partial unique index below).
CREATE TABLE IF NOT EXISTS bot.bingo_games (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id   UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    title         TEXT NOT NULL DEFAULT 'Stream Bingo',
    size          INTEGER NOT NULL DEFAULT 5,        -- N x N board
    free_space    BOOLEAN NOT NULL DEFAULT true,     -- center FREE cell (odd sizes)
    win_condition TEXT NOT NULL DEFAULT 'line',      -- line | full
    tiles         JSONB NOT NULL DEFAULT '[]'::jsonb, -- pool of potential tiles (strings)
    called        JSONB NOT NULL DEFAULT '[]'::jsonb, -- called tiles, in order
    status        TEXT NOT NULL DEFAULT 'draft',     -- draft | active | ended
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at    TIMESTAMPTZ,
    ended_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bingo_games_streamer ON bot.bingo_games(streamer_id);
-- Only one game may be 'active' per streamer at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bingo_games_one_active
    ON bot.bingo_games(streamer_id) WHERE status = 'active';

-- A viewer's card for a game. One card per (game, player). `cells` is a flat
-- array of length size*size; the literal 'FREE' marks the free space. Marks are
-- derived from bingo_games.called, not stored here. has_bingo is a cached result
-- recomputed by the Worker whenever a tile is called/uncalled.
CREATE TABLE IF NOT EXISTS bot.bingo_cards (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id    UUID NOT NULL REFERENCES bot.bingo_games(id) ON DELETE CASCADE,
    player_id  TEXT NOT NULL,                 -- client-generated stable id (or twitch id)
    name       TEXT NOT NULL DEFAULT 'Player',
    cells      JSONB NOT NULL DEFAULT '[]'::jsonb,
    has_bingo  BOOLEAN NOT NULL DEFAULT false,
    bingo_at   TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (game_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_bingo_cards_game ON bot.bingo_cards(game_id);

-- Defense-in-depth: the Worker uses the service-role key (bypasses RLS) and does
-- its own authorization. Viewers reach games/cards through the Worker's public
-- routes, not the anon key, so enable RLS with no policy (deny direct anon/auth
-- access), consistent with the other bot.* tables (002_enable_rls.sql).
ALTER TABLE bot.bingo_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.bingo_cards ENABLE ROW LEVEL SECURITY;

GRANT ALL ON bot.bingo_games, bot.bingo_cards TO service_role;

COMMIT;

-- >>>>>>>>>>>>>>>>>>>> 004_wheel.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================
-- 004_wheel.sql
-- Wheel Spin integration (src/integrations/wheel-spin).
--
-- A creator configures one or more wheels (a list of segments, each with an
-- optional weight + color). The creator spins from the dashboard; the Worker
-- picks a weighted-random segment, records the spin, and broadcasts it on
-- channel `wheel:<wheelId>` so the OBS overlay animates to the result.
-- The wheel is a single shared object (unlike bingo's per-viewer cards).
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.wheels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT 'Wheel',
    -- [{ label, weight?, color? }]
    segments    JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wheels_streamer ON bot.wheels(streamer_id);

-- Spin history (most recent results power the dashboard + overlay recap).
CREATE TABLE IF NOT EXISTS bot.wheel_spins (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wheel_id      UUID NOT NULL REFERENCES bot.wheels(id) ON DELETE CASCADE,
    streamer_id   UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    result        TEXT NOT NULL,
    segment_index INTEGER NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wheel_spins_wheel ON bot.wheel_spins(wheel_id, created_at DESC);

-- Defense-in-depth: RLS on, no policy (deny direct anon/auth); the Worker uses
-- the service-role key and authorizes itself. Consistent with 002/003.
ALTER TABLE bot.wheels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.wheel_spins ENABLE ROW LEVEL SECURITY;

GRANT ALL ON bot.wheels, bot.wheel_spins TO service_role;

COMMIT;

-- >>>>>>>>>>>>>>>>>>>> 005_win_loss_draw.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================
-- 005_win_loss_draw.sql
-- Win/Loss/Draw record overlay (src/integrations/win-loss-draw).
--
-- A creator tracks a session record (wins/losses/draws) and fully customizes its
-- appearance (layout, colors, fonts, box styling) via a JSONB `config`. The
-- counts + style are broadcast on `wld:<boardId>` so the OBS overlay updates
-- live as the creator adjusts the score or restyles it.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.wld_boards (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT 'Scoreboard',
    wins        INTEGER NOT NULL DEFAULT 0,
    losses      INTEGER NOT NULL DEFAULT 0,
    draws       INTEGER NOT NULL DEFAULT 0,
    -- Style overrides; merged over the worker's DEFAULT_CONFIG on read.
    config      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wld_boards_streamer ON bot.wld_boards(streamer_id);

-- Defense-in-depth: RLS on, no policy (deny direct anon/auth); the Worker uses
-- the service-role key and authorizes itself. Consistent with 002/003/004.
ALTER TABLE bot.wld_boards ENABLE ROW LEVEL SECURITY;

GRANT ALL ON bot.wld_boards TO service_role;

COMMIT;
