-- ============================================
-- 030_wheel_base_segments.sql
-- Wheel Spin: snapshot of the creator-authored segments so remove-on-select
-- is reversible (POST /wheels/:id/reset restores them).
--
-- base_segments is (re)written whenever the creator saves segments (POST /
-- PATCH); spins with remove-on-select shrink `segments` only. Backfilled from
-- the current segments so pre-existing wheels behave sanely.
-- ============================================

BEGIN;

ALTER TABLE bot.wheels
    ADD COLUMN IF NOT EXISTS base_segments JSONB;

UPDATE bot.wheels SET base_segments = segments WHERE base_segments IS NULL;

COMMIT;
