import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { broadcast } from '../realtime';
import { error, json } from '../lib/response';

/**
 * Giveaways — creator API (dashboard).
 *
 *   GET    /api/giveaways                list giveaways (+ entry counts, winners)
 *   POST   /api/giveaways                open a new giveaway
 *   PATCH  /api/giveaways/:id            edit (title/cost/luck/winners) while not drawn
 *   POST   /api/giveaways/:id/close      stop accepting entries
 *   POST   /api/giveaways/:id/open       re-open (fails if another is open)
 *   POST   /api/giveaways/:id/draw       draw one weighted-random winner (RPC)
 *   POST   /api/giveaways/:id/reset      clear entries + winners, re-open
 *   DELETE /api/giveaways/:id            delete
 *   GET    /api/giveaways/:id/entries    list entries
 *
 * Viewers enter via chat (!enter / !join) — see chat/giveaway.ts.
 */

interface GiveawayRow {
  id: string;
  title: string;
  entry_cost: number;
  sub_luck: number;
  winner_count: number;
  status: string;
  created_at: string;
  closed_at: string | null;
}

function rowToApi(g: GiveawayRow, entryCount: number, winners: { name: string; drawnAt: string }[]) {
  return {
    id: g.id,
    title: g.title,
    entryCost: g.entry_cost,
    subLuck: g.sub_luck,
    winnerCount: g.winner_count,
    status: g.status,
    entryCount,
    winners,
    createdAt: g.created_at,
    closedAt: g.closed_at,
  };
}

/** Map an API body to DB columns. Returns null on invalid input. */
function toDb(body: Record<string, any>, partial: boolean): Record<string, any> | null {
  const out: Record<string, any> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const clampInt = (v: any, min: number, max: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
  };

  if (has('title')) out.title = String(body.title ?? '').trim().slice(0, 80) || 'Giveaway';
  if (has('entryCost')) { const n = clampInt(body.entryCost, 0, 1_000_000); if (n === undefined) return null; out.entry_cost = n; }
  if (has('subLuck')) { const n = clampInt(body.subLuck, 1, 100); if (n === undefined) return null; out.sub_luck = n; }
  if (has('winnerCount')) { const n = clampInt(body.winnerCount, 1, 100); if (n === undefined) return null; out.winner_count = n; }

  if (!partial && out.title === undefined) out.title = 'Giveaway';
  return out;
}

/** Attach live entry count + winners to a single giveaway row. */
async function enrichGiveaway(bot: ReturnType<typeof botSchema>, g: GiveawayRow) {
  const [{ count }, { data: wins }] = await Promise.all([
    bot.from('giveaway_entries').select('id', { count: 'exact', head: true }).eq('giveaway_id', g.id),
    bot.from('giveaway_winners').select('viewer_name, drawn_at').eq('giveaway_id', g.id).order('drawn_at', { ascending: true }),
  ]);
  const winners = (wins ?? []).map((w: any) => ({ name: w.viewer_name, drawnAt: w.drawn_at }));
  return rowToApi(g, count ?? 0, winners);
}

export async function handleGiveaways(
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
  const seg = path.slice('/api/giveaways'.length).replace(/^\//, '').split('/').filter(Boolean);
  const id = seg[0];
  const action = seg[1];

  // ── Collection ───────────────────────────────────────────────────────────
  if (!id) {
    if (method === 'GET') {
      const { data: rows } = await bot
        .from('giveaways')
        .select('*')
        .eq('streamer_id', streamerId)
        .order('created_at', { ascending: false })
        .limit(25);
      const list = (rows ?? []) as GiveawayRow[];
      const ids = list.map((g) => g.id);

      const counts = new Map<string, number>();
      const winners = new Map<string, { name: string; drawnAt: string }[]>();
      if (ids.length) {
        const [{ data: entries }, { data: wins }] = await Promise.all([
          bot.from('giveaway_entries').select('giveaway_id').in('giveaway_id', ids),
          bot.from('giveaway_winners').select('giveaway_id, viewer_name, drawn_at').in('giveaway_id', ids).order('drawn_at', { ascending: true }),
        ]);
        for (const e of entries ?? []) counts.set((e as any).giveaway_id, (counts.get((e as any).giveaway_id) ?? 0) + 1);
        for (const w of wins ?? []) {
          const k = (w as any).giveaway_id;
          if (!winners.has(k)) winners.set(k, []);
          winners.get(k)!.push({ name: (w as any).viewer_name, drawnAt: (w as any).drawn_at });
        }
      }
      return json(
        { giveaways: list.map((g) => rowToApi(g, counts.get(g.id) ?? 0, winners.get(g.id) ?? [])) },
        request,
        env,
      );
    }

    if (method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as Record<string, any>;
      const row = toDb(body, false);
      if (!row) return error('Invalid giveaway', 400, request, env);
      row.streamer_id = streamerId;
      row.status = 'open';
      const { data, error: insErr } = await bot.from('giveaways').insert(row).select('*').single();
      if (insErr) {
        return error(/duplicate key|unique/i.test(insErr.message) ? 'You already have a giveaway open — close it first' : 'Could not create giveaway', 400, request, env);
      }
      return json({ giveaway: rowToApi(data as GiveawayRow, 0, []) }, request, env, { status: 201 });
    }
    return error('Method not allowed', 405, request, env);
  }

  // ── Single giveaway ──────────────────────────────────────────────────────
  if (action === 'entries' && method === 'GET') {
    const { data } = await bot
      .from('giveaway_entries')
      .select('viewer_name, weight, created_at')
      .eq('giveaway_id', id)
      .order('created_at', { ascending: false })
      .limit(500);
    const entries = (data ?? []).map((e: any) => ({ name: e.viewer_name, weight: e.weight, at: e.created_at }));
    return json({ entries }, request, env);
  }

  if (method === 'PATCH' && !action) {
    const { data: cur } = await bot.from('giveaways').select('status').eq('streamer_id', streamerId).eq('id', id).maybeSingle();
    if (!cur) return error('Giveaway not found', 404, request, env);
    if (cur.status === 'drawn') return error('Cannot edit a giveaway that has been drawn', 400, request, env);
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const row = toDb(body, true);
    if (!row || !Object.keys(row).length) return error('Nothing to update', 400, request, env);
    row.updated_at = new Date().toISOString();
    const { data } = await bot.from('giveaways').update(row).eq('streamer_id', streamerId).eq('id', id).select('*').maybeSingle();
    if (!data) return error('Giveaway not found', 404, request, env);
    return json({ giveaway: await enrichGiveaway(bot, data as GiveawayRow) }, request, env);
  }

  if (method === 'POST' && action === 'close') {
    const { data } = await bot
      .from('giveaways')
      .update({ status: 'closed', closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('streamer_id', streamerId).eq('id', id).eq('status', 'open')
      .select('id');
    if (!data?.length) return error('Giveaway not found or not open', 404, request, env);
    return json({ ok: true }, request, env);
  }

  if (method === 'POST' && action === 'open') {
    const { data, error: updErr } = await bot
      .from('giveaways')
      .update({ status: 'open', closed_at: null, updated_at: new Date().toISOString() })
      .eq('streamer_id', streamerId).eq('id', id)
      .select('id');
    if (updErr) return error('Close your other open giveaway first', 400, request, env);
    if (!data?.length) return error('Giveaway not found', 404, request, env);
    return json({ ok: true }, request, env);
  }

  if (method === 'POST' && action === 'draw') {
    const { data, error: rpcErr } = await bot.rpc('draw_giveaway_winner', { p_streamer_id: streamerId, p_giveaway_id: id });
    const row = Array.isArray(data) ? data[0] : data;
    if (rpcErr || !row) return error('Could not draw a winner', 400, request, env);
    if (!row.ok) {
      const msg = row.reason === 'no entries' ? 'No eligible entries to draw from'
        : row.reason === 'all winners drawn' ? 'All winners have already been drawn'
        : row.reason;
      return error(msg, 400, request, env);
    }
    const winner = { twitchId: row.winner_twitch_id, name: row.winner_name };
    await broadcast(env, `giveaway:${streamerId}`, 'winner', winner).catch(() => undefined);
    return json({ winner }, request, env);
  }

  if (method === 'POST' && action === 'reset') {
    const { data: cur } = await bot.from('giveaways').select('id').eq('streamer_id', streamerId).eq('id', id).maybeSingle();
    if (!cur) return error('Giveaway not found', 404, request, env);
    await bot.from('giveaway_winners').delete().eq('giveaway_id', id);
    await bot.from('giveaway_entries').delete().eq('giveaway_id', id);
    const { error: updErr } = await bot
      .from('giveaways')
      .update({ status: 'open', closed_at: null, updated_at: new Date().toISOString() })
      .eq('streamer_id', streamerId).eq('id', id);
    if (updErr) return error('Close your other open giveaway first', 400, request, env);
    return json({ ok: true }, request, env);
  }

  if (method === 'DELETE' && !action) {
    const { data } = await bot.from('giveaways').delete().eq('streamer_id', streamerId).eq('id', id).select('id');
    if (!data?.length) return error('Giveaway not found', 404, request, env);
    return json({ ok: true }, request, env);
  }

  return error('Not found', 404, request, env);
}
