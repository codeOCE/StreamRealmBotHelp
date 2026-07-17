-- ============================================
-- 038_emote_tags_overlay.sql
-- 7TV parity for the emote uploader: searchable tags + "overlaying" (zero-width)
-- emotes. Tags feed the vault search; zero_width emotes render stacked on top of
-- the preceding emote in chat (the browser extension reads the flag). See
-- routes/emotes.ts + apps/extension.
-- ============================================

BEGIN;

ALTER TABLE bot.emotes ADD COLUMN IF NOT EXISTS tags       TEXT[]  NOT NULL DEFAULT '{}';
ALTER TABLE bot.emotes ADD COLUMN IF NOT EXISTS zero_width BOOLEAN NOT NULL DEFAULT false;

-- Vault search by tag.
CREATE INDEX IF NOT EXISTS emotes_tags_idx ON bot.emotes USING GIN (tags);

COMMIT;
