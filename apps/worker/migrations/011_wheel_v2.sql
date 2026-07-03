-- ============================================
-- 011_wheel_v2.sql
-- Wheel Spin customization (src/integrations/wheel-spin).
--
-- Adds a per-wheel `config` JSONB holding all the look-and-feel + behavior
-- options (pointer style/image/angle, center image, stroke, size, spin speed,
-- remove-on-select, and announce/sound settings). Worker merges it over its
-- DEFAULT_CONFIG on read, mirroring bot.wld_boards.config (005).
--
-- Segments stay in bot.wheels.segments as [{ label, weight?, color?, image? }];
-- `weight` now drives BOTH the win odds AND the visual slice size, so creators
-- can type "10, 30, 30, 50" for bigger/smaller wedges that don't need to sum to
-- anything in particular.
-- ============================================

BEGIN;

ALTER TABLE bot.wheels
    ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
