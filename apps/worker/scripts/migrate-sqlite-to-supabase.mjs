/**
 * One-shot data migration: Prisma/SQLite (apps/api dev.db) -> shared Supabase DB.
 *
 * Maps each legacy Tenant to a `public.streamers` row (creator identity) and
 * moves its bot data into the `bot` schema, scoped by streamer_id. Idempotent
 * where natural unique keys exist (commands, timers, mod rules).
 *
 * NOT migrated (by design):
 *   - Encrypted Twitch tokens (NestJS used a different cipher; users re-auth via
 *     /auth/twitch, which stores fresh tokens in bot.tenants).
 *   - Loyalty/battle/skill/achievement and log tables (deferred domains).
 *
 * Usage (from repo root or apps/worker):
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node apps/worker/scripts/migrate-sqlite-to-supabase.mjs
 *
 * Prereqs: `npm run generate --workspace=@stream-realm/database` (Prisma client),
 * and the SQL migrations (001/002) already applied to the Supabase project.
 */
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@stream-realm/database';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});
const bot = supabase.schema('bot');

const parseJson = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
};
const slugify = (name, twitchId) => {
  let s = String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (s.length < 3) s = `twitch${twitchId}`.replace(/[^a-z0-9_]/g, '');
  return s.slice(0, 25);
};

/** Ensure a public.streamers row exists for this tenant; return its id. */
async function ensureStreamer(tenant) {
  const { data: existing } = await supabase
    .from('streamers').select('id').eq('twitch_id', tenant.twitchId).maybeSingle();
  if (existing?.id) return existing.id;

  const slug = slugify(tenant.name, tenant.twitchId);
  const { data, error } = await supabase
    .from('streamers')
    .insert({
      twitch_id: tenant.twitchId,
      username: slug,
      castle_code: slug,
      brand_name: tenant.name,
      display_name: tenant.name,
    })
    .select('id')
    .single();
  if (error) throw new Error(`streamers insert (${tenant.name}): ${error.message}`);
  return data.id;
}

async function migrateTenant(tenant) {
  const streamerId = await ensureStreamer(tenant);
  console.log(`\n→ ${tenant.name} (${tenant.twitchId}) -> streamer ${streamerId}`);

  // public.users (shared identity for the owner)
  const owner = await prisma.user.findUnique({ where: { id: tenant.ownerId } });
  if (owner) {
    await supabase.from('users').upsert(
      { twitch_id: owner.twitchId, username: owner.username, is_linked: true },
      { onConflict: 'twitch_id' },
    );
  }

  // bot.tenants
  await bot.from('tenants').upsert(
    {
      streamer_id: streamerId,
      plan_tier: tenant.planTier ?? 'FREE',
      stripe_sub_id: tenant.stripeSubId ?? null,
      settings: parseJson(tenant.settings, {}),
      is_connected: tenant.isConnected ?? false,
      bot_username: tenant.botUsername ?? null,
      target_channel: tenant.targetChannel ?? null,
    },
    { onConflict: 'streamer_id' },
  );

  // commands
  const commands = await prisma.command.findMany({ where: { tenantId: tenant.id } });
  if (commands.length) {
    const rows = commands.map((c) => ({
      streamer_id: streamerId,
      trigger: c.trigger,
      enabled: c.enabled,
      cooldown: c.cooldown,
      user_cooldown: c.userCooldown,
      user_level: c.userLevel,
      responses: parseJson(c.responses, []),
      response_type: c.responseType,
      aliases: parseJson(c.aliases, []),
      usages: c.usages,
      description: c.description,
      category: c.category,
      is_built_in: c.isBuiltIn,
      is_regex: c.isRegex,
    }));
    const { error } = await bot.from('commands').upsert(rows, { onConflict: 'streamer_id,trigger' });
    console.log(`  commands: ${error ? 'ERROR ' + error.message : rows.length}`);
  }

  // timers
  const timers = await prisma.timer.findMany({ where: { tenantId: tenant.id } });
  if (timers.length) {
    const rows = timers.map((t) => ({
      streamer_id: streamerId,
      name: t.name,
      message: t.message,
      interval_seconds: t.intervalSeconds,
      chat_lines: t.chatLines,
      enabled: t.enabled,
    }));
    const { error } = await bot.from('timers').upsert(rows, { onConflict: 'streamer_id,name' });
    console.log(`  timers: ${error ? 'ERROR ' + error.message : rows.length}`);
  }

  // mod rules
  const rules = await prisma.modRule.findMany({ where: { tenantId: tenant.id } });
  if (rules.length) {
    const rows = rules.map((r) => ({
      streamer_id: streamerId,
      type: r.type,
      enabled: r.enabled,
      settings: parseJson(r.settings, {}),
    }));
    const { error } = await bot.from('mod_rules').insert(rows);
    console.log(`  mod_rules: ${error ? 'ERROR ' + error.message : rows.length}`);
  }

  // viewer profiles
  const viewers = await prisma.viewerProfile.findMany({ where: { tenantId: tenant.id } });
  if (viewers.length) {
    const rows = viewers.map((v) => ({
      streamer_id: streamerId,
      twitch_user_id: v.twitchUserId,
      username: v.username,
      xp: v.xp, level: v.level, points: v.points, watch_time: v.watchTime,
      prestige_level: v.prestigeLevel, skill_points: v.skillPoints, season_xp: v.seasonXp, mmr: v.mmr,
    }));
    const { error } = await bot.from('viewer_profiles').upsert(rows, { onConflict: 'streamer_id,twitch_user_id' });
    console.log(`  viewer_profiles: ${error ? 'ERROR ' + error.message : rows.length}`);
  }

  // overlays + widgets
  const overlays = await prisma.overlay.findMany({ where: { tenantId: tenant.id }, include: { widgets: true } });
  for (const o of overlays) {
    const { data: ov, error } = await bot.from('overlays').insert({
      streamer_id: streamerId,
      name: o.name, description: o.description,
      width: o.width, height: o.height,
      config: parseJson(o.config, {}),
      is_public: o.isPublic, url_slug: o.urlSlug,
    }).select('id').single();
    if (error) { console.log(`  overlay "${o.name}": ERROR ${error.message}`); continue; }
    if (o.widgets.length) {
      const wRows = o.widgets.map((w) => ({
        overlay_id: ov.id, type: w.type,
        x: w.x, y: w.y, width: w.width, height: w.height, rotation: w.rotation, z_index: w.zIndex,
        config: parseJson(w.config, {}), styles: parseJson(w.styles, {}),
      }));
      await bot.from('overlay_widgets').insert(wRows);
    }
    console.log(`  overlay "${o.name}": ${o.widgets.length} widgets`);
  }
}

async function main() {
  const tenants = await prisma.tenant.findMany();
  console.log(`Migrating ${tenants.length} tenant(s) to Supabase...`);
  for (const tenant of tenants) {
    try {
      await migrateTenant(tenant);
    } catch (e) {
      console.error(`FAILED tenant ${tenant.name}:`, e.message);
    }
  }
  await prisma.$disconnect();
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
