import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema, getPublicOwner } from '../lib/supabase';
import { maskCustomApi } from '../lib/mask-custom-api';
import { getUserFromSession } from '../lib/session';
import { error, json } from '../lib/response';
import { broadcast } from '../realtime';
import { normalizeSyntax } from '../chat/variables';

/**
 * Commands CRUD — ported from the NestJS CommandsController/CommandsService
 * (apps/api/src/bot/commands.*). Scoped to the authenticated streamer; all rows
 * live in bot.commands keyed by streamer_id.
 *
 * Routes (under /api/commands):
 *   GET    /                 list (ensures built-ins exist)
 *   POST   /                 create
 *   PATCH  /:id              update
 *   PATCH  /:id/toggle       enable/disable
 *   DELETE /bulk             delete all custom commands
 *   DELETE /:id              delete one (built-ins protected)
 *   POST   /import           bulk import (dedupe by trigger)
 */

// Built-in command definitions, carried over from the NestJS service.
const BUILT_IN_DEFAULTS = [
  { trigger: 'uptime', category: 'Streaming', description: 'Shows how long the stream has been live.', user_level: 'VIEWER', cooldown: 10, user_cooldown: 5 },
  { trigger: 'game', category: 'Streaming', description: 'Shows the current game being played.', user_level: 'VIEWER', cooldown: 10, user_cooldown: 5 },
  { trigger: 'title', category: 'Streaming', description: 'Shows the current stream title.', user_level: 'VIEWER', cooldown: 10, user_cooldown: 5 },
  { trigger: 'stats', category: 'Loyalty', description: 'Displays your XP, Level, and Watchtime.', user_level: 'VIEWER', cooldown: 15, user_cooldown: 30 },
  { trigger: 'xp', category: 'Loyalty', description: 'Alias for !stats.', user_level: 'VIEWER', cooldown: 15, user_cooldown: 30 },
  { trigger: 'top', category: 'Loyalty', description: 'Shows the top XP leaderboard.', user_level: 'VIEWER', cooldown: 30, user_cooldown: 60 },
  { trigger: 'leaderboard', category: 'Loyalty', description: 'Alias for !top.', user_level: 'VIEWER', cooldown: 30, user_cooldown: 60 },
  { trigger: 'watchtime', category: 'Loyalty', description: 'Shows how much time you have spent in the stream.', user_level: 'VIEWER', cooldown: 15, user_cooldown: 30 },
  { trigger: 'followage', category: 'Loyalty', description: 'Shows long you have been following the channel.', user_level: 'VIEWER', cooldown: 15, user_cooldown: 30 },
  { trigger: 'socials', category: 'Utility', description: 'Displays links to social media profiles.', user_level: 'VIEWER', cooldown: 20, user_cooldown: 60 },
  { trigger: 'commands', category: 'Utility', description: 'Lists all available commands.', user_level: 'VIEWER', cooldown: 30, user_cooldown: 10 },
  { trigger: 'help', category: 'Utility', description: 'Alias for !commands.', user_level: 'VIEWER', cooldown: 30, user_cooldown: 10 },
  { trigger: 'ping', category: 'Utility', description: 'Check if the bot is online.', user_level: 'VIEWER', cooldown: 5, user_cooldown: 10 },
  { trigger: 'shoutout', category: 'Moderation', description: 'Give a shoutout to another streamer.', user_level: 'MODERATOR', cooldown: 0, user_cooldown: 0 },
  { trigger: 'so', category: 'Moderation', description: 'Alias for !shoutout.', user_level: 'MODERATOR', cooldown: 0, user_cooldown: 0 },
  { trigger: 'addcom', category: 'Moderation', description: 'Add a new custom command from chat.', user_level: 'MODERATOR', cooldown: 0, user_cooldown: 0 },
  { trigger: 'editcom', category: 'Moderation', description: 'Edit an existing custom command from chat.', user_level: 'MODERATOR', cooldown: 0, user_cooldown: 0 },
  { trigger: 'delcom', category: 'Moderation', description: 'Delete a custom command from chat.', user_level: 'MODERATOR', cooldown: 0, user_cooldown: 0 },
  { trigger: 'permit', category: 'Moderation', description: 'Permit a user to post links.', user_level: 'MODERATOR', cooldown: 0, user_cooldown: 0 },
  { trigger: 'count', category: 'Utility', description: 'Show a counter, e.g. !count deaths.', user_level: 'VIEWER', cooldown: 5, user_cooldown: 10 },
  { trigger: 'addcount', category: 'Moderation', description: 'Add to a counter, e.g. !addcount deaths (or !addcount deaths 2).', user_level: 'MODERATOR', cooldown: 0, user_cooldown: 0 },
  { trigger: 'setcount', category: 'Moderation', description: 'Set a counter, e.g. !setcount deaths 0.', user_level: 'MODERATOR', cooldown: 0, user_cooldown: 0 },
  // Fun commands every chat bot ships.
  { trigger: '8ball', category: 'Fun', description: 'Ask the magic 8-ball a question.', user_level: 'VIEWER', cooldown: 5, user_cooldown: 10 },
  { trigger: 'dice', category: 'Fun', description: 'Roll a die — !dice, !dice 20, or !dice 2d6.', user_level: 'VIEWER', cooldown: 5, user_cooldown: 10 },
  { trigger: 'roll', category: 'Fun', description: 'Alias for !dice.', user_level: 'VIEWER', cooldown: 5, user_cooldown: 10 },
  { trigger: 'coinflip', category: 'Fun', description: 'Flip a coin — heads or tails.', user_level: 'VIEWER', cooldown: 5, user_cooldown: 10 },
  { trigger: 'flip', category: 'Fun', description: 'Alias for !coinflip.', user_level: 'VIEWER', cooldown: 5, user_cooldown: 10 },
  { trigger: 'dadjoke', category: 'Fun', description: 'Tells a random dad joke.', user_level: 'VIEWER', cooldown: 10, user_cooldown: 30 },
  { trigger: 'fact', category: 'Fun', description: 'Shares a random fun fact.', user_level: 'VIEWER', cooldown: 10, user_cooldown: 30 },
  { trigger: 'hug', category: 'Fun', description: 'Give someone a hug — !hug @user.', user_level: 'VIEWER', cooldown: 5, user_cooldown: 15 },
  { trigger: 'love', category: 'Fun', description: 'Love compatibility — !love @user.', user_level: 'VIEWER', cooldown: 5, user_cooldown: 15 },
  { trigger: 'lurk', category: 'Fun', description: 'Announce that you are lurking.', user_level: 'VIEWER', cooldown: 0, user_cooldown: 60 },
  { trigger: 'unlurk', category: 'Fun', description: 'Announce that you are back from lurking.', user_level: 'VIEWER', cooldown: 0, user_cooldown: 60 },
  // Quotes — per-channel quote book.
  { trigger: 'quote', category: 'Quotes', description: 'Show a random quote, or !quote <number>.', user_level: 'VIEWER', cooldown: 10, user_cooldown: 15 },
  { trigger: 'addquote', category: 'Quotes', description: 'Save a new quote — !addquote <text>.', user_level: 'MODERATOR', cooldown: 0, user_cooldown: 0 },
  { trigger: 'delquote', category: 'Quotes', description: 'Delete a quote — !delquote <number>.', user_level: 'MODERATOR', cooldown: 0, user_cooldown: 0 },
  // Stream tools.
  { trigger: 'clip', category: 'Streaming', description: 'Create a clip of the last moments of the stream.', user_level: 'VIEWER', cooldown: 30, user_cooldown: 60 },
];

function normalizeResponses(responses: unknown): string[] {
  const arr = Array.isArray(responses) ? responses : [responses];
  return arr.filter((r) => r != null).map((r) => normalizeSyntax(String(r)));
}

/** Map a bot.commands row (snake_case) to the API shape the web app expects (camelCase). */
function toApi(row: Record<string, any>) {
  return {
    id: row.id,
    trigger: row.trigger,
    enabled: row.enabled,
    cooldown: row.cooldown,
    userCooldown: row.user_cooldown,
    userLevel: row.user_level,
    responses: Array.isArray(row.responses) ? row.responses : [],
    responseType: row.response_type,
    responseMode: row.response_mode ?? 'ALL',
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    usages: row.usages,
    description: row.description,
    category: row.category,
    isBuiltIn: row.is_built_in,
    isRegex: row.is_regex,
  };
}

async function writeAudit(
  supabase: SupabaseClient,
  streamerId: string,
  action: string,
  target?: string,
  metadata?: Record<string, unknown>,
) {
  await botSchema(supabase)
    .from('audit_logs')
    .insert({ streamer_id: streamerId, action, actor: 'Dashboard', target, metadata: metadata ?? {} });
}

const BUILT_IN_TRIGGERS = new Set(BUILT_IN_DEFAULTS.map((d) => d.trigger));

/**
 * Ensure every built-in trigger exists for the streamer. Runs on every GET, so
 * it must stay cheap: 1 read + (insert missing) + (one-time backfill flag).
 * ponytail: dropped the per-row UPDATE loop (was ~35 sequential queries → 500
 * once each round-trip costs ~1s). Built-ins get description/category on insert;
 * the only thing legacy rows need is the is_built_in flag, done in one update.
 */
async function ensureBuiltIns(supabase: SupabaseClient, streamerId: string) {
  const bot = botSchema(supabase);
  const { data: existing, error: readErr } = await bot
    .from('commands')
    .select('trigger, is_built_in')
    .eq('streamer_id', streamerId);
  if (readErr) {
    console.error('[commands] ensureBuiltIns list failed:', readErr.message);
    return;
  }

  const existingTriggers = new Set((existing ?? []).map((r) => r.trigger));
  const toInsert = BUILT_IN_DEFAULTS.filter((def) => !existingTriggers.has(def.trigger)).map((def) => ({
    ...def,
    streamer_id: streamerId,
    responses: [],
    is_built_in: true,
    enabled: true,
  }));

  if (toInsert.length > 0) {
    const { error: insertErr } = await bot.from('commands').insert(toInsert);
    if (insertErr) console.error('[commands] ensureBuiltIns bulk insert failed:', insertErr.message);
  }

  // One-time backfill for legacy rows that predate the is_built_in flag. No-op
  // (and skipped entirely) once flagged, so steady state is just the read above.
  const needsFlag = (existing ?? []).some((r) => !r.is_built_in && BUILT_IN_TRIGGERS.has(r.trigger));
  if (needsFlag) {
    const { error: flagErr } = await bot
      .from('commands')
      .update({ is_built_in: true })
      .eq('streamer_id', streamerId)
      .in('trigger', [...BUILT_IN_TRIGGERS]);
    if (flagErr) console.error('[commands] ensureBuiltIns backfill flag failed:', flagErr.message);
  }
}

export async function handleCommands(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response> {
  // Sub-path after /api/commands (e.g. '', '/bulk', '/<id>', '/<id>/toggle', '/import')
  const sub = path.slice('/api/commands'.length).replace(/^\//, '');

  // GET /api/commands/public/:streamerId — no auth. Powers the shareable
  // viewer-facing command list. All enabled commands are listed (including
  // mod/broadcaster-only ones) with their permission level shown — knowing a
  // command exists isn't sensitive, the server still enforces who can run it.
  if (method === 'GET' && sub.startsWith('public/')) {
    const sid = sub.slice('public/'.length);
    if (!sid) return error('Not found', 404, request, env);
    const bot = botSchema(supabase);
    const [{ data }, owner] = await Promise.all([
      bot
        .from('commands')
        .select('trigger, aliases, responses, category, user_level, cooldown, user_cooldown, is_built_in')
        .eq('streamer_id', sid)
        .eq('enabled', true)
        .order('trigger', { ascending: true }),
      getPublicOwner(supabase, sid),
    ]);
    const commands = (data ?? []).map((c: any) => ({
      trigger: c.trigger,
      aliases: Array.isArray(c.aliases) ? c.aliases : [],
      // Built-ins (!uptime, !stats, …) run code, not a stored template — no
      // response text to show, and that's fine; the trigger name says enough.
      response: maskCustomApi((Array.isArray(c.responses) ? c.responses[0] : null) || ''),
      category: c.category,
      userLevel: c.user_level,
      cooldown: c.cooldown,
      userCooldown: c.user_cooldown,
      isBuiltIn: !!c.is_built_in,
    }));
    return json({ owner, commands }, request, env);
  }

  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const streamerId = user.id;

  const bot = botSchema(supabase);

  // GET /api/commands — list (ensure built-ins first)
  if (method === 'GET' && sub === '') {
    await ensureBuiltIns(supabase, streamerId);
    const { data, error: e } = await bot
      .from('commands')
      .select('*')
      .eq('streamer_id', streamerId)
      .order('trigger', { ascending: true });
    if (e) return error(e.message, 500, request, env);
    return json((data ?? []).map(toApi), request, env);
  }

  // POST /api/commands — create
  if (method === 'POST' && sub === '') {
    const body = (await request.json()) as Record<string, any>;
    if (!body.trigger) return error('trigger is required', 400, request, env);
    const insertRow = {
      streamer_id: streamerId,
      trigger: String(body.trigger).toLowerCase().replace('!', ''),
      responses: normalizeResponses(body.responses ?? []),
      response_type: body.responseType ?? 'SAY',
      response_mode: body.responseMode === 'RANDOM' ? 'RANDOM' : 'ALL',
      aliases: Array.isArray(body.aliases) ? body.aliases : [],
      cooldown: body.cooldown ?? 0,
      user_cooldown: body.userCooldown ?? 0,
      user_level: body.userLevel ?? 'VIEWER',
      description: body.description ?? null,
      category: body.category ?? 'General',
      is_regex: body.isRegex ?? false,
      is_built_in: false,
    };
    const { data, error: e } = await bot.from('commands').insert(insertRow).select('*').single();
    if (e) return error(e.message, 400, request, env);
    await writeAudit(supabase, streamerId, 'COMMAND_ADD', `!${data.trigger}`);
    await broadcast(env, `streamer:${streamerId}`, 'commandUpdated');
    return json(toApi(data), request, env, { status: 201 });
  }

  // POST /api/commands/import — bulk import
  if (method === 'POST' && sub === 'import') {
    const body = (await request.json()) as { commands?: any[] };
    const result = { imported: 0, skipped: 0, failed: 0, failedCommands: [] as string[] };
    const { data: existing } = await bot.from('commands').select('trigger').eq('streamer_id', streamerId);
    const have = new Set((existing ?? []).map((r: { trigger: string }) => r.trigger));
    // Build all rows first, then insert in one round-trip. A StreamElements
    // import can be 100+ commands; one insert per row times out the request.
    const rows = [];
    for (const raw of body.commands ?? []) {
      if (!raw.trigger || raw.responses == null) { result.skipped++; continue; }
      const trigger = String(raw.trigger).toLowerCase().replace('!', '');
      if (have.has(trigger)) { result.skipped++; continue; } // dedupe vs existing + intra-batch
      have.add(trigger);
      const level = String(raw.userLevel ?? 'viewer').toLowerCase();
      const userLevel =
        level === 'moderator' || level === 'mod' ? 'MODERATOR'
        : level === 'vip' ? 'VIP'
        : level === 'subscriber' || level === 'sub' ? 'SUBSCRIBER'
        : level === 'broadcaster' || level === 'owner' ? 'BROADCASTER'
        : 'VIEWER';
      rows.push({
        streamer_id: streamerId,
        trigger,
        responses: normalizeResponses(raw.responses),
        response_mode: raw.responseMode === 'RANDOM' ? 'RANDOM' : 'ALL',
        aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
        description: raw.description ?? `Imported from ${raw.source ?? 'external bot'}`,
        category: raw.category ?? 'Imported',
        user_level: userLevel,
        cooldown: raw.cooldown ?? 10,
        user_cooldown: raw.userCooldown ?? 5,
        enabled: true,
        is_built_in: false,
        is_regex: false,
      });
    }
    if (rows.length > 0) {
      const { error: e } = await bot.from('commands').insert(rows);
      // ponytail: all-or-nothing batch. One bad row fails the lot; chunk only if real imports hit that.
      if (e) { result.failed = rows.length; result.failedCommands.push(e.message); }
      else { result.imported = rows.length; }
    }
    await writeAudit(supabase, streamerId, 'COMMAND_IMPORT', `${result.imported} commands`, { result });
    await broadcast(env, `streamer:${streamerId}`, 'commandUpdated');
    return json(result, request, env);
  }

  // DELETE /api/commands/bulk — delete all custom commands
  if (method === 'DELETE' && sub === 'bulk') {
    const { data, error: e } = await bot
      .from('commands')
      .delete()
      .eq('streamer_id', streamerId)
      .eq('is_built_in', false)
      .select('id');
    if (e) return error(e.message, 500, request, env);
    const count = data?.length ?? 0;
    await writeAudit(supabase, streamerId, 'COMMAND_BULK_DELETE', undefined, { count });
    await broadcast(env, `streamer:${streamerId}`, 'commandUpdated');
    return json({ count }, request, env);
  }

  // /api/commands/:id and /api/commands/:id/toggle
  const idMatch = sub.match(/^([^/]+)(\/toggle)?$/);
  if (idMatch) {
    const id = idMatch[1];
    const isToggle = !!idMatch[2];

    // PATCH /api/commands/:id/toggle
    if (method === 'PATCH' && isToggle) {
      const body = (await request.json()) as { enabled?: boolean };
      const { data, error: e } = await bot
        .from('commands')
        .update({ enabled: !!body.enabled })
        .eq('id', id)
        .eq('streamer_id', streamerId)
        .select('*')
        .maybeSingle();
      if (e) return error(e.message, 400, request, env);
      if (!data) return error('Command not found', 404, request, env);
      return json(toApi(data), request, env);
    }

    // PATCH /api/commands/:id — update
    if (method === 'PATCH' && !isToggle) {
      const body = (await request.json()) as Record<string, any>;
      const patch: Record<string, any> = {};
      if (body.trigger !== undefined) patch.trigger = String(body.trigger).toLowerCase().replace('!', '');
      if (body.responses !== undefined) patch.responses = normalizeResponses(body.responses);
      if (body.responseType !== undefined) patch.response_type = body.responseType;
      if (body.responseMode !== undefined) patch.response_mode = body.responseMode === 'RANDOM' ? 'RANDOM' : 'ALL';
      if (body.aliases !== undefined) patch.aliases = Array.isArray(body.aliases) ? body.aliases : [];
      if (body.cooldown !== undefined) patch.cooldown = body.cooldown;
      if (body.userCooldown !== undefined) patch.user_cooldown = body.userCooldown;
      if (body.userLevel !== undefined) patch.user_level = body.userLevel;
      if (body.enabled !== undefined) patch.enabled = body.enabled;
      if (body.description !== undefined) patch.description = body.description;
      if (body.category !== undefined) patch.category = body.category;
      if (body.isRegex !== undefined) patch.is_regex = body.isRegex;
      if (body.usages !== undefined) patch.usages = body.usages;

      const { data, error: e } = await bot
        .from('commands')
        .update(patch)
        .eq('id', id)
        .eq('streamer_id', streamerId)
        .select('*')
        .maybeSingle();
      if (e) return error(e.message, 400, request, env);
      if (!data) return error('Command not found', 404, request, env);
      await writeAudit(supabase, streamerId, 'COMMAND_EDIT', `!${data.trigger}`, { patch });
    await broadcast(env, `streamer:${streamerId}`, 'commandUpdated');
      return json(toApi(data), request, env);
    }

    // DELETE /api/commands/:id — delete (built-ins protected)
    if (method === 'DELETE') {
      const { data: existing } = await bot
        .from('commands')
        .select('trigger, is_built_in')
        .eq('id', id)
        .eq('streamer_id', streamerId)
        .maybeSingle();
      if (!existing) return error('Command not found', 404, request, env);
      if (existing.is_built_in) return error('Built-in commands cannot be deleted, only disabled.', 400, request, env);
      const { error: e } = await bot.from('commands').delete().eq('id', id).eq('streamer_id', streamerId);
      if (e) return error(e.message, 500, request, env);
      await writeAudit(supabase, streamerId, 'COMMAND_DELETE', `!${existing.trigger}`);
    await broadcast(env, `streamer:${streamerId}`, 'commandUpdated');
      return json({ ok: true }, request, env);
    }
  }

  return error('Not found', 404, request, env);
}
