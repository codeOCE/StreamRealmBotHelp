import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { error, json } from '../lib/response';

/**
 * Moderation rules — ported from the NestJS ModerationController
 * (apps/api/src/bot/moderation.*). Rows live in bot.mod_rules, scoped by streamer.
 * The dashboard expects the standard rule set to exist, so GET seeds it
 * idempotently (like built-in commands). Enforcement itself is bot-runtime.
 *
 * Routes (under /api/moderation):
 *   GET    /                list (seeds defaults)
 *   PATCH  /:id/toggle      enable/disable
 *   PATCH  /:id/settings    replace settings JSON
 *   PATCH  /:id             generic update
 */

const DEFAULT_RULES: { type: string; settings: Record<string, unknown> }[] = [
  { type: 'CAPS', settings: { threshold: 70, duration: 600, strictness: 'MEDIUM' } },
  { type: 'LINKS', settings: { duration: 600, strictness: 'MEDIUM' } },
  { type: 'SPAM', settings: { threshold: 4, duration: 600, strictness: 'MEDIUM' } },
  { type: 'SYMBOLS', settings: { threshold: 50, duration: 600, strictness: 'MEDIUM' } },
  { type: 'EMOTES', settings: { threshold: 10, duration: 600, strictness: 'MEDIUM' } },
  { type: 'BANNED_WORDS', settings: { words: [], duration: 600, strictness: 'MEDIUM' } },
];

function toApi(row: Record<string, any>) {
  return { id: row.id, type: row.type, enabled: row.enabled, settings: row.settings ?? {} };
}

async function ensureDefaults(supabase: SupabaseClient, streamerId: string) {
  const bot = botSchema(supabase);
  const { data: existing } = await bot.from('mod_rules').select('type').eq('streamer_id', streamerId);
  const have = new Set((existing ?? []).map((r: { type: string }) => r.type));
  const missing = DEFAULT_RULES.filter((d) => !have.has(d.type));
  if (missing.length === 0) return;
  await bot
    .from('mod_rules')
    .insert(missing.map((d) => ({ streamer_id: streamerId, type: d.type, enabled: false, settings: d.settings })));
}

export async function handleModeration(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response> {
  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const streamerId = user.id;
  const bot = botSchema(supabase);
  const sub = path.slice('/api/moderation'.length).replace(/^\//, '');

  // GET /api/moderation
  if (method === 'GET' && sub === '') {
    await ensureDefaults(supabase, streamerId);
    const { data, error: e } = await bot
      .from('mod_rules')
      .select('*')
      .eq('streamer_id', streamerId)
      .order('type', { ascending: true });
    if (e) return error(e.message, 500, request, env);
    return json((data ?? []).map(toApi), request, env);
  }

  // Shield Mode (hate-raid / follow-bot protection) lives in tenants.settings,
  // not mod_rules — it's a channel-wide mode, not a per-message text rule.
  if (sub === 'shield' && (method === 'GET' || method === 'POST')) {
    const { data: tenant } = await bot
      .from('tenants')
      .select('settings')
      .eq('streamer_id', streamerId)
      .maybeSingle();
    const settings = (tenant?.settings ?? {}) as Record<string, any>;
    const current = { enabled: false, maxAccountAgeDays: 7, requireFollow: false, action: 'timeout', duration: 600, silent: true, ...(settings.shield ?? {}) };

    if (method === 'GET') return json(current, request, env);

    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const next = {
      enabled: body.enabled !== undefined ? !!body.enabled : current.enabled,
      maxAccountAgeDays: body.maxAccountAgeDays !== undefined ? Math.max(0, Number(body.maxAccountAgeDays) || 0) : current.maxAccountAgeDays,
      requireFollow: body.requireFollow !== undefined ? !!body.requireFollow : current.requireFollow,
      action: ['timeout', 'delete', 'ban'].includes(body.action) ? body.action : current.action,
      duration: body.duration !== undefined ? Math.max(1, Number(body.duration) || 600) : current.duration,
      silent: body.silent !== undefined ? !!body.silent : current.silent,
    };
    const { error: e } = await bot
      .from('tenants')
      .update({ settings: { ...settings, shield: next }, updated_at: new Date().toISOString() })
      .eq('streamer_id', streamerId);
    if (e) return error(e.message, 400, request, env);
    return json(next, request, env);
  }

  const idMatch = sub.match(/^([^/]+)(?:\/(toggle|settings))?$/);
  if (idMatch && method === 'PATCH') {
    const id = idMatch[1];
    const kind = idMatch[2];
    const body = (await request.json()) as Record<string, any>;

    let patch: Record<string, any>;
    if (kind === 'toggle') patch = { enabled: !!body.enabled };
    else if (kind === 'settings') patch = { settings: body };
    else {
      patch = {};
      if (body.enabled !== undefined) patch.enabled = body.enabled;
      if (body.settings !== undefined) patch.settings = body.settings;
      if (body.type !== undefined) patch.type = body.type;
    }

    const { data, error: e } = await bot
      .from('mod_rules')
      .update(patch)
      .eq('id', id)
      .eq('streamer_id', streamerId)
      .select('*')
      .maybeSingle();
    if (e) return error(e.message, 400, request, env);
    if (!data) return error('Rule not found', 404, request, env);
    return json(toApi(data), request, env);
  }

  return error('Not found', 404, request, env);
}
