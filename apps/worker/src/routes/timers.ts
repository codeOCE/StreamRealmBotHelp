import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { error, json } from '../lib/response';
import { normalizeSyntax } from '../chat/variables';

/**
 * Timers CRUD — ported from the NestJS TimerController (apps/api/src/bot/timer.*).
 * Scoped to the authenticated streamer; rows live in bot.timers.
 *
 * NOTE: the NestJS service also runs the interval scheduler that actually posts
 * timer messages to chat (reloadTimers). That is bot-runtime behavior and lives
 * with the chat bot, not this management API. Writes here just persist config;
 * the bot reloads on its own cadence once it reads from Supabase.
 *
 * Routes (under /api/timers): GET /, POST /, PATCH /:id, PATCH /:id/toggle, DELETE /:id, POST /import
 */

function toApi(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    message: row.message,
    intervalSeconds: row.interval_seconds,
    chatLines: row.chat_lines,
    enabled: row.enabled,
  };
}

export async function handleTimers(
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
  const sub = path.slice('/api/timers'.length).replace(/^\//, '');

  // GET /api/timers
  if (method === 'GET' && sub === '') {
    const { data, error: e } = await bot
      .from('timers')
      .select('*')
      .eq('streamer_id', streamerId)
      .order('created_at', { ascending: false });
    if (e) return error(e.message, 500, request, env);
    return json((data ?? []).map(toApi), request, env);
  }

  // POST /api/timers
  if (method === 'POST' && sub === '') {
    const body = (await request.json()) as Record<string, any>;
    if (!body.name || !body.message) return error('name and message are required', 400, request, env);
    const { data, error: e } = await bot
      .from('timers')
      .insert({
        streamer_id: streamerId,
        name: body.name,
        message: body.message,
        interval_seconds: Number(body.intervalSeconds) || 300,
        chat_lines: Number(body.chatLines) || 0,
        enabled: body.enabled ?? true,
      })
      .select('*')
      .single();
    if (e) return error(e.message, 400, request, env);
    return json(toApi(data), request, env, { status: 201 });
  }

  // POST /api/timers/import — bulk import (dedupe by name)
  if (method === 'POST' && sub === 'import') {
    const body = (await request.json()) as { timers?: any[] };
    const result = { imported: 0, skipped: 0, failed: 0, failedCommands: [] as string[] };
    const { data: existing } = await bot.from('timers').select('name').eq('streamer_id', streamerId);
    const have = new Set((existing ?? []).map((r: { name: string }) => r.name));
    const rows = [];
    for (const raw of body.timers ?? []) {
      if (!raw.name) { result.skipped++; continue; }
      if (have.has(raw.name)) { result.skipped++; continue; } // dedupe vs existing + intra-batch
      have.add(raw.name);
      rows.push({
        streamer_id: streamerId,
        name: raw.name,
        message: normalizeSyntax(String(raw.message || '')),
        interval_seconds: Math.max(Number(raw.intervalSeconds) || 300, 60),
        chat_lines: Number(raw.chatLines) || 0,
        enabled: raw.enabled ?? true,
      });
    }
    if (rows.length > 0) {
      const { error: e } = await bot.from('timers').insert(rows);
      // ponytail: all-or-nothing batch, matches commands.ts import — chunk only if real imports hit that.
      if (e) { result.failed = rows.length; result.failedCommands.push(e.message); }
      else { result.imported = rows.length; }
    }
    return json(result, request, env);
  }

  // /api/timers/:id and /api/timers/:id/toggle
  const idMatch = sub.match(/^([^/]+)(\/toggle)?$/);
  if (idMatch) {
    const id = idMatch[1];
    const isToggle = !!idMatch[2];

    if (method === 'PATCH' && isToggle) {
      const body = (await request.json()) as { enabled?: boolean };
      const { data, error: e } = await bot
        .from('timers')
        .update({ enabled: !!body.enabled })
        .eq('id', id)
        .eq('streamer_id', streamerId)
        .select('*')
        .maybeSingle();
      if (e) return error(e.message, 400, request, env);
      if (!data) return error('Timer not found', 404, request, env);
      return json(toApi(data), request, env);
    }

    if (method === 'PATCH') {
      const body = (await request.json()) as Record<string, any>;
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) patch.name = body.name;
      if (body.message !== undefined) patch.message = body.message;
      if (body.intervalSeconds !== undefined) patch.interval_seconds = Number(body.intervalSeconds);
      if (body.chatLines !== undefined) patch.chat_lines = Number(body.chatLines);
      if (body.enabled !== undefined) patch.enabled = body.enabled;
      const { data, error: e } = await bot
        .from('timers')
        .update(patch)
        .eq('id', id)
        .eq('streamer_id', streamerId)
        .select('*')
        .maybeSingle();
      if (e) return error(e.message, 400, request, env);
      if (!data) return error('Timer not found', 404, request, env);
      return json(toApi(data), request, env);
    }

    if (method === 'DELETE') {
      const { data, error: e } = await bot
        .from('timers')
        .delete()
        .eq('id', id)
        .eq('streamer_id', streamerId)
        .select('id')
        .maybeSingle();
      if (e) return error(e.message, 500, request, env);
      if (!data) return error('Timer not found', 404, request, env);
      return json({ ok: true }, request, env);
    }
  }

  return error('Not found', 404, request, env);
}
