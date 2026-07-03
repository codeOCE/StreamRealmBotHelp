import type { SupabaseClient } from '@supabase/supabase-js';
import type { Integration, IntegrationContext, PublicIntegrationContext } from '../types';
import { botSchema } from '../../lib/supabase';
import { json, error } from '../../lib/response';
import { broadcast } from '../../realtime';
import { deepMerge, resolveConfig } from './config';

/**
 * Win/Loss/Draw — a customizable session record overlay. The creator adjusts the
 * counts and the full style config from the dashboard; both are broadcast on
 * `wld:<boardId>` so the OBS overlay updates live. See migrations/005_win_loss_draw.sql.
 *
 * Owner routes (auth, under /api/integrations/win-loss-draw):
 *   GET    /boards            list the streamer's boards
 *   POST   /boards            create { title?, config? }
 *   GET    /boards/:id        board + resolved config
 *   PATCH  /boards/:id        update { title?, config? }  (config deep-merges)
 *   DELETE /boards/:id
 *   POST   /boards/:id/adjust { field: 'wins'|'losses'|'draws', delta }  (clamped >= 0)
 *   POST   /boards/:id/set    { wins?, losses?, draws? }
 *   POST   /boards/:id/reset
 *
 * Public route (no auth, under /api/integrations/win-loss-draw/public):
 *   GET    /boards/:id        counts + resolved config for the overlay
 */

type BoardRow = {
  id: string;
  streamer_id: string;
  title: string;
  wins: number;
  losses: number;
  draws: number;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

const COUNT_FIELDS = new Set(['wins', 'losses', 'draws']);

function mapBoard(b: BoardRow) {
  return {
    id: b.id,
    title: b.title,
    wins: b.wins,
    losses: b.losses,
    draws: b.draws,
    config: resolveConfig(b.config),
  };
}

async function getOwnedBoard(
  supabase: SupabaseClient,
  streamerId: string,
  id: string,
): Promise<BoardRow | null> {
  const { data } = await botSchema(supabase)
    .from('wld_boards')
    .select('*')
    .eq('id', id)
    .eq('streamer_id', streamerId)
    .maybeSingle();
  return (data as BoardRow) ?? null;
}

async function saveAndBroadcast(
  supabase: SupabaseClient,
  env: IntegrationContext['env'],
  id: string,
  patch: Record<string, any>,
): Promise<BoardRow> {
  const { data } = await botSchema(supabase)
    .from('wld_boards')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  const board = data as BoardRow;
  await broadcast(env, `wld:${id}`, 'wld.update', mapBoard(board));
  return board;
}

// ============================================================================
// Owner (authenticated) routes
// ============================================================================
async function handleOwner(ctx: IntegrationContext): Promise<Response | null> {
  const { request, env, supabase, streamerId, segments, method } = ctx;
  const bot = botSchema(supabase);

  if (segments[0] !== 'boards') return null;
  const id = segments[1];
  const action = segments[2];

  // ---- /boards ----
  if (!id) {
    if (method === 'GET') {
      const { data } = await bot
        .from('wld_boards')
        .select('*')
        .eq('streamer_id', streamerId)
        .order('created_at', { ascending: false });
      return json({ boards: (data ?? []).map((b) => mapBoard(b as BoardRow)) }, request, env);
    }
    if (method === 'POST') {
      if (!ctx.enabled) return error('Win/Loss/Draw is not enabled', 403, request, env);
      const body = (await request.json().catch(() => ({}))) as any;
      const { data, error: dbErr } = await bot
        .from('wld_boards')
        .insert({
          streamer_id: streamerId,
          title: String(body.title ?? 'Scoreboard').slice(0, 80),
          config: typeof body.config === 'object' && body.config ? body.config : {},
        })
        .select('*')
        .single();
      if (dbErr) return error(dbErr.message, 500, request, env);
      return json({ board: mapBoard(data as BoardRow) }, request, env, { status: 201 });
    }
    return error('Method not allowed', 405, request, env);
  }

  // ---- /boards/:id ----
  const board = await getOwnedBoard(supabase, streamerId, id);
  if (!board) return error('Board not found', 404, request, env);

  if (!action) {
    if (method === 'GET') return json({ board: mapBoard(board) }, request, env);

    if (method === 'PATCH') {
      const body = (await request.json().catch(() => ({}))) as any;
      const patch: Record<string, any> = {};
      if (body.title !== undefined) patch.title = String(body.title).slice(0, 80);
      // Deep-merge the partial style config into what's stored (overrides only).
      if (body.config !== undefined) patch.config = deepMerge(board.config ?? {}, body.config);
      if (Object.keys(patch).length === 0) return json({ board: mapBoard(board) }, request, env);
      const updated = await saveAndBroadcast(supabase, env, id, patch);
      return json({ board: mapBoard(updated) }, request, env);
    }

    if (method === 'DELETE') {
      await bot.from('wld_boards').delete().eq('id', id);
      return json({ success: true }, request, env);
    }
    return error('Method not allowed', 405, request, env);
  }

  // ---- mutations (POST) ----
  if (method !== 'POST') return error('Method not allowed', 405, request, env);

  if (action === 'adjust') {
    const body = (await request.json().catch(() => ({}))) as { field?: string; delta?: number };
    if (!body.field || !COUNT_FIELDS.has(body.field)) return error('Invalid field', 400, request, env);
    const delta = Math.trunc(Number(body.delta ?? 0));
    const current = (board as any)[body.field] as number;
    const next = Math.max(0, current + delta);
    const updated = await saveAndBroadcast(supabase, env, id, { [body.field]: next });
    return json({ board: mapBoard(updated) }, request, env);
  }

  if (action === 'set') {
    const body = (await request.json().catch(() => ({}))) as any;
    const patch: Record<string, any> = {};
    for (const f of COUNT_FIELDS) {
      if (body[f] !== undefined) patch[f] = Math.max(0, Math.trunc(Number(body[f]) || 0));
    }
    if (Object.keys(patch).length === 0) return error('Nothing to set', 400, request, env);
    const updated = await saveAndBroadcast(supabase, env, id, patch);
    return json({ board: mapBoard(updated) }, request, env);
  }

  if (action === 'reset') {
    const updated = await saveAndBroadcast(supabase, env, id, { wins: 0, losses: 0, draws: 0 });
    return json({ board: mapBoard(updated) }, request, env);
  }

  return null;
}

// ============================================================================
// Public (overlay) route
// ============================================================================
async function handlePublic(ctx: PublicIntegrationContext): Promise<Response | null> {
  const { request, env, supabase, segments, method } = ctx;
  const [resource, id] = segments;

  if (resource === 'boards' && id && method === 'GET') {
    const { data } = await botSchema(supabase)
      .from('wld_boards')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!data) return error('Board not found', 404, request, env);
    return json({ board: mapBoard(data as BoardRow) }, request, env);
  }

  return null;
}

const winLossDraw: Integration = {
  manifest: {
    id: 'win-loss-draw',
    name: 'Win / Loss / Draw',
    description: 'A fully customizable session record overlay for OBS.',
    icon: 'Swords',
    category: 'utility',
    dashboardPath: '/dashboard/win-loss-draw',
    defaultConfig: {},
  },
  handle: handleOwner,
  handlePublic,
};

export default winLossDraw;
