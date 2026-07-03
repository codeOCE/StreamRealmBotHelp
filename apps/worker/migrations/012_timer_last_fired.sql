-- ============================================
-- 012_timer_last_fired.sql
-- Cron-driven timers (replaces the NestJS in-process setInterval scheduler).
--
-- A Cloudflare Cron Trigger fires the Worker's scheduled() handler every minute;
-- it posts any timer whose interval has elapsed and stamps last_fired_at. This
-- column is the durable "when did this last post" the stateless sweep needs in
-- place of the old in-memory interval map (apps/api/src/bot/timer.service.ts).
-- ============================================

BEGIN;

ALTER TABLE bot.timers
    ADD COLUMN IF NOT EXISTS last_fired_at TIMESTAMPTZ;

COMMIT;
