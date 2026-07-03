-- ============================================
-- 023_command_response_mode.sql
-- How multi-response commands pick chat lines: ALL (sequential) or RANDOM.
-- ============================================

BEGIN;

ALTER TABLE bot.commands
    ADD COLUMN IF NOT EXISTS response_mode TEXT NOT NULL DEFAULT 'ALL';

COMMIT;
