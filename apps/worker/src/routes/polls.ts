import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { broadcast } from '../realtime';
import { error, json } from '../lib/response';

/**
 * Polls — creator API (dashboard).
 *
 *   GET    /api/polls            list polls (+ live vote tallies)
 *   POST   /api/polls            open a poll { question, options: string[] }
 *   POST   /api/polls/:id/close  stop accepting votes
 *   POST   /api/polls/:id/reset  clear votes, re-open
 *   DELETE /api/polls/:id        delete
 *
 * Viewers vote via chat (!vote <n>) — see chat/poll.ts.
 */

interface PollRow {
  id: string;
  question: string;
  options: unknown;
  status: string;
  created_at: string;
  closed_at: string | null;
}

async function rowToApi(bot: ReturnType<typeof botSchema>, p: PollRow) {
  const options = (Array.isArray(p.options) ? p.options : []) as string[];
  const { data: counts } = await bot.rpc('poll_results', { p_poll_id: p.id });
  return {
    id: p.id,
    question: p.question,
    options,
    counts: (Array.isArray(counts) ? counts : []) as number[],
    status: p.status,
    createdAt: p.created_at,
    closedAt: p.closed_at,
  };
}

export async function handlePolls(
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
  const seg = path.slice('/api/polls'.length).replace(/^\//, '').split('/').filter(Boolean);
  const id = seg[0];
  const action = seg[1];

  // ── Collection ───────────────────────────────────────────────────────────
  if (!id) {
    if (method === 'GET') {
      const { data: rows } = await bot
        .from('polls')
        .select('*')
        .eq('streamer_id', streamerId)
        .order('created_at', { ascending: false })
        .limit(25);
      const polls = await Promise.all(((rows ?? []) as PollRow[]).map((p) => rowToApi(bot, p)));
      return json({ polls }, request, env);
    }

    if (method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as Record<string, any>;
      const question = String(body.question ?? '').trim().slice(0, 140) || 'Poll';
      const options = (Array.isArray(body.options) ? body.options : [])
        .map((o: any) => String(o ?? '').trim().slice(0, 60))
        .filter(Boolean)
        .slice(0, 6);
      if (options.length < 2) return error('A poll needs at least 2 options', 400, request, env);

      const { data, error: insErr } = await bot
        .from('polls')
        .insert({ streamer_id: streamerId, question, options, status: 'open' })
        .select('*')
        .single();
      if (insErr) {
        return error(/duplicate key|unique/i.test(insErr.message) ? 'You already have a poll open — close it first' : 'Could not create poll', 400, request, env);
      }
      return json({ poll: await rowToApi(bot, data as PollRow) }, request, env, { status: 201 });
    }
    return error('Method not allowed', 405, request, env);
  }

  // ── Single poll ──────────────────────────────────────────────────────────
  if (method === 'POST' && action === 'close') {
    const { data } = await bot
      .from('polls')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('streamer_id', streamerId).eq('id', id).eq('status', 'open')
      .select('id');
    if (!data?.length) return error('Poll not found or not open', 404, request, env);
    await broadcast(env, `poll:${streamerId}`, 'closed', { pollId: id }).catch(() => undefined);
    return json({ ok: true }, request, env);
  }

  if (method === 'POST' && action === 'reset') {
    const { data: cur } = await bot.from('polls').select('id').eq('streamer_id', streamerId).eq('id', id).maybeSingle();
    if (!cur) return error('Poll not found', 404, request, env);
    await bot.from('poll_votes').delete().eq('poll_id', id);
    const { error: updErr } = await bot.from('polls').update({ status: 'open', closed_at: null }).eq('streamer_id', streamerId).eq('id', id);
    if (updErr) return error('Close your other open poll first', 400, request, env);
    return json({ ok: true }, request, env);
  }

  if (method === 'DELETE' && !action) {
    const { data } = await bot.from('polls').delete().eq('streamer_id', streamerId).eq('id', id).select('id');
    if (!data?.length) return error('Poll not found', 404, request, env);
    return json({ ok: true }, request, env);
  }

  return error('Not found', 404, request, env);
}
