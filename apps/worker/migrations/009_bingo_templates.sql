-- ============================================
-- 009_bingo_templates.sql
-- Saved bingo card templates: a creator can store reusable tile pools + styling
-- on their account and spin up a new game from one. bot.* only; references
-- public.streamers read-only. Idempotent + transactional.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bot.bingo_templates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    streamer_id   UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    size          INTEGER NOT NULL DEFAULT 5,
    free_space    BOOLEAN NOT NULL DEFAULT true,
    win_condition TEXT NOT NULL DEFAULT 'line',
    tiles         JSONB NOT NULL DEFAULT '[]'::jsonb,
    card_style    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bingo_templates_streamer ON bot.bingo_templates(streamer_id);

ALTER TABLE bot.bingo_templates ENABLE ROW LEVEL SECURITY;
GRANT ALL ON bot.bingo_templates TO service_role;

COMMIT;
