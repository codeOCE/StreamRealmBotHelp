-- ============================================
-- 013_chat_pipeline.sql
-- State for the serverless chat pipeline (EventSub channel.chat.message webhook
-- → commands / moderation / loyalty, per ADR-0001). The Worker is stateless, so
-- cooldowns, permits and the per-channel message counter that used to live in
-- NestJS process memory move into Postgres.
-- ============================================

BEGIN;

-- Global per-command cooldown stamp (was an in-memory Map in ChatHandlerService).
ALTER TABLE bot.commands ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- Per-user command cooldowns. One row per (command, chatter); upserted on use.
CREATE TABLE IF NOT EXISTS bot.command_cooldowns (
    command_id     UUID NOT NULL REFERENCES bot.commands(id) ON DELETE CASCADE,
    user_twitch_id TEXT NOT NULL,
    used_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (command_id, user_twitch_id)
);

-- Monotonic per-channel chat-line counter. Feeds the timers "post only after N
-- chat lines" gate (timers store the counter value at their last fire).
CREATE TABLE IF NOT EXISTS bot.chat_activity (
    streamer_id   UUID PRIMARY KEY REFERENCES public.streamers(id) ON DELETE CASCADE,
    message_count BIGINT NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Atomic increment (supabase-js cannot express `count = count + 1`).
CREATE OR REPLACE FUNCTION bot.bump_chat_activity(p_streamer_id UUID)
RETURNS BIGINT
LANGUAGE sql AS $$
    INSERT INTO bot.chat_activity (streamer_id, message_count, updated_at)
    VALUES (p_streamer_id, 1, NOW())
    ON CONFLICT (streamer_id)
    DO UPDATE SET message_count = bot.chat_activity.message_count + 1, updated_at = NOW()
    RETURNING message_count;
$$;

-- Atomic usage increment for commands (returns the new count for $(count)).
CREATE OR REPLACE FUNCTION bot.increment_command_usage(p_command_id UUID)
RETURNS INTEGER
LANGUAGE sql AS $$
    UPDATE bot.commands SET usages = usages + 1, last_used_at = NOW()
    WHERE id = p_command_id
    RETURNING usages;
$$;

-- Counter snapshot at the timer's last fire (gate: current - snapshot >= chat_lines).
ALTER TABLE bot.timers ADD COLUMN IF NOT EXISTS last_fired_count BIGINT NOT NULL DEFAULT 0;

-- !permit grants (was an in-memory Map + setTimeout in ModerationService).
CREATE TABLE IF NOT EXISTS bot.permits (
    streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    user_login  TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (streamer_id, user_login)
);

-- Same posture as 002: RLS on, no policies — only the service-role key (which
-- bypasses RLS) can touch these; PostgREST anon/authenticated get nothing.
ALTER TABLE bot.command_cooldowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.chat_activity     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot.permits           ENABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA bot TO service_role;

COMMIT;
