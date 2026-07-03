import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { error, json } from '../lib/response';

/**
 * Named chat counters — creator API (dashboard mirror of !count/!addcount/!setcount).
 *
 *   GET    /api/counters            list counters
 *   POST   /api/counters            create/set { name, value }
 *   PATCH  /api/counters/:name      { value } (absolute) or { delta } (relative)
 *   DELETE /api/counters/:name      delete
 *
 * Counter names are lowercased + slugged to match the chat side (chat/pipeline.ts).
 */

const cleanName = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);

export async function handleCounters(
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
  const seg = path.slice('/api/counters'.length).replace(/^\//, '').split('/').filter(Boolean);
  const name = seg[0] ? cleanName(decodeURIComponent(seg[0])) : '';

  if (!name) {
    if (method === 'GET') {
      const { data } = await bot
        .from('counters')
        .select('name, value, updated_at')
        .eq('streamer_id', streamerId)
        .order('name', { ascending: true });
      const counters = (data ?? []).map((c: any) => ({ name: c.name, value: Number(c.value), updatedAt: c.updated_at }));
      return json({ counters }, request, env);
    }
    if (method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as Record<string, any>;
      const n = cleanName(body.name);
      if (!n) return error('Invalid counter name', 400, request, env);
      const value = Math.trunc(Number(body.value) || 0);
      const { data } = await bot.rpc('set_counter', { p_streamer_id: streamerId, p_name: n, p_value: value });
      return json({ name: n, value: Number(Array.isArray(data) ? data[0] : data) }, request, env, { status: 201 });
    }
    return error('Method not allowed', 405, request, env);
  }

  if (method === 'PATCH') {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    if (Object.prototype.hasOwnProperty.call(body, 'delta')) {
      const delta = Math.trunc(Number(body.delta) || 0);
      const { data } = await bot.rpc('bump_counter', { p_streamer_id: streamerId, p_name: name, p_delta: delta });
      return json({ name, value: Number(Array.isArray(data) ? data[0] : data) }, request, env);
    }
    const value = Math.trunc(Number(body.value) || 0);
    const { data } = await bot.rpc('set_counter', { p_streamer_id: streamerId, p_name: name, p_value: value });
    return json({ name, value: Number(Array.isArray(data) ? data[0] : data) }, request, env);
  }

  if (method === 'DELETE') {
    const { data } = await bot.from('counters').delete().eq('streamer_id', streamerId).eq('name', name).select('name');
    if (!data?.length) return error('Counter not found', 404, request, env);
    return json({ ok: true }, request, env);
  }

  return error('Method not allowed', 405, request, env);
}
