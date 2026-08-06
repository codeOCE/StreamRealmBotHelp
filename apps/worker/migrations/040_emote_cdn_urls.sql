-- Emote CDN URLs — move image_url off raw Supabase Storage links and onto the
-- branded, storage-agnostic cdn.creatorcastle.gg path (7TV's cdn.7tv.app shape).
--
-- Nothing moves in storage. `storage_path` still points at the original file;
-- the worker resolves a size to either a variant beside it or the original, so
-- legacy rows keep working untouched and the old Supabase URLs stay live for
-- any extension client that cached them.

-- Static emotes get real 1x–4x webp variants written beside the original at
-- upload time; animated ones serve the original at every size path.
ALTER TABLE bot.emotes ADD COLUMN IF NOT EXISTS has_variants boolean NOT NULL DEFAULT false;

-- Backfill: every emote that lives in our storage bucket now advertises the CDN
-- URL. 2x is the canonical default (matches what chat renders at width 28–56).
-- Emotes added by remote URL (storage_path IS NULL) keep their original link.
-- NOTE: cdn.creatorcastle.gg is already taken by an R2 public bucket, so the
-- CDN currently rides on the api host. The worker serves /emote/:id/:size on
-- whatever host reaches it, so moving to a dedicated subdomain later is a
-- one-line UPDATE here plus the EMOTE_CDN_URL var — no storage change.
UPDATE bot.emotes
   SET image_url = 'https://api.creatorcastle.gg/emote/' || id || '/2x.webp'
 WHERE storage_path IS NOT NULL
   AND image_url NOT LIKE '%/emote/%';
