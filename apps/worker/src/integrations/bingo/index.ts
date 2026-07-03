import type { SupabaseClient } from '@supabase/supabase-js';
import type { Integration, IntegrationContext, PublicIntegrationContext } from '../types';
import type { Env } from '../../env';
import { botSchema } from '../../lib/supabase';
import { json, error } from '../../lib/response';
import { broadcast } from '../../realtime';
import { getViewerFromSession } from '../../lib/session';
import { encryptSensitive, decryptSensitive, encryptionKeySecret } from '../../lib/crypto';
import {
  createCustomReward,
  createEventSubSubscription,
  deleteCustomReward,
  deleteEventSubSubscription,
  getAppAccessToken,
  getUserSubTier,
  refreshUserToken,
} from '../../lib/twitch';
import { eventsubSecret } from '../../routes/eventsub';
import {
  chatSubscriptionActive,
  ensureChatSubscription,
  removeChatSubscription,
} from '../../lib/chat-subscription';
import { uploadPublic, safeExt } from '../../lib/storage';
import {
  generateCells,
  validateClaim,
  hasBingoFromMarks,
  normalizeTiles,
  tileCount,
  tilesNeeded,
  WIN_PATTERNS,
  type WinCondition,
  type Tile,
  type MarkMap,
  type CalledMap,
} from './logic';

/** Coerce arbitrary input to a valid win pattern, defaulting to 'line'. */
function asPattern(input: unknown): WinCondition {
  const id = String(input ?? '');
  return (WIN_PATTERNS.find((p) => p.id === id)?.id as WinCondition) ?? 'line';
}

/** `called` is an ordered array of tile ids (repeats allowed for multi-call);
 * count = number of occurrences. Keeps call ORDER (overlay ticker) + COUNTS. */
function countMap(called: string[]): CalledMap {
  const m: CalledMap = {};
  for (const id of called ?? []) m[id] = (m[id] ?? 0) + 1;
  return m;
}

/** Tolerate legacy number[] marks; new shape is { [cellIndex]: timesChecked }. */
function normalizeMarks(marks: any): MarkMap {
  if (Array.isArray(marks)) {
    const m: MarkMap = {};
    for (const i of marks) m[String(i)] = 1;
    return m;
  }
  return (marks ?? {}) as MarkMap;
}

/**
 * Bingo v2 — viewer-owned, self-marked cards with creator-validated wins.
 *
 * The creator defines a tile pool and "calls" tiles as events happen; calling no
 * longer marks cards — it is the VALIDATION GROUND TRUTH. Each viewer logs in
 * with Twitch, generates a card, marks their own cells, and presses BINGO. A
 * claim is accepted only if the marked cells complete the win condition AND every
 * marked tile has been called. Card count per viewer is 1 by default; the creator
 * can grant more via sub tiers (Helix) and channel-point purchases (EventSub).
 *
 * Owner routes (auth, /api/integrations/bingo):
 *   GET/POST /games, GET/PATCH/DELETE /games/:id
 *   POST /games/:id/{start,call,uncall,reset,end}
 *   PATCH /games/:id            (also accepts { entitlements })
 *   POST /games/:id/channel-points/{enable,disable}
 *
 * Viewer routes (Twitch viewer session required, /api/integrations/bingo/public):
 *   GET  /games/:id             public game state (no auth — render login prompt)
 *   GET  /games/:id/entitlement how many cards the viewer may have/has
 *   POST /games/:id/join        create the viewer's next card (entitlement-gated)
 *   GET  /cards/:id             card incl. the viewer's marks + called set
 *   POST /cards/:id/mark        { index, marked } toggle a self-mark
 *   POST /cards/:id/claim       validate a BINGO against the called set
 */

const MIN_SIZE = 3;
const MAX_SIZE = 7;
const REDEMPTION_ADD = 'channel.channel_points_custom_reward_redemption.add';

interface ChannelPointsConfig {
  enabled: boolean;
  rewardId: string | null;
  cost: number;
  cardsPerRedemption: number;
  maxPerUser: number;
}
interface Entitlements {
  base: number;
  allowMultiple: boolean;
  subTierCards: Record<string, number>; // { '1000', '2000', '3000' }
  channelPoints: ChannelPointsConfig;
}

const DEFAULT_ENTITLEMENTS: Entitlements = {
  base: 1,
  allowMultiple: false,
  subTierCards: { '1000': 0, '2000': 0, '3000': 0 },
  channelPoints: { enabled: false, rewardId: null, cost: 500, cardsPerRedemption: 1, maxPerUser: 5 },
};

function mergeEntitlements(stored: any): Entitlements {
  const s = stored ?? {};
  return {
    base: Number(s.base ?? DEFAULT_ENTITLEMENTS.base),
    allowMultiple: Boolean(s.allowMultiple ?? DEFAULT_ENTITLEMENTS.allowMultiple),
    subTierCards: { ...DEFAULT_ENTITLEMENTS.subTierCards, ...(s.subTierCards ?? {}) },
    channelPoints: { ...DEFAULT_ENTITLEMENTS.channelPoints, ...(s.channelPoints ?? {}) },
  };
}

type GameRow = {
  id: string;
  streamer_id: string;
  title: string;
  size: number;
  free_space: boolean;
  win_condition: string;
  tiles: any[];
  called: string[];
  status: string;
  entitlements: any;
  round: number;
  reward: string | null;
  review_mode: string;
  card_style: any;
  short_code: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  ended_at: string | null;
};

function asReviewMode(input: unknown): 'auto' | 'manual' {
  return input === 'manual' ? 'manual' : 'auto';
}

/** Owner view of a game (full tiles + config). */
function mapGame(g: GameRow) {
  const tiles = normalizeTiles(g.tiles);
  return {
    id: g.id,
    title: g.title,
    size: g.size,
    freeSpace: g.free_space,
    winCondition: g.win_condition,
    tiles,
    called: g.called ?? [], // ordered call log (tile ids, repeats for multi-call)
    calledCounts: countMap(g.called ?? []),
    status: g.status,
    entitlements: mergeEntitlements(g.entitlements),
    round: g.round ?? 1,
    reward: g.reward ?? null,
    reviewMode: asReviewMode(g.review_mode),
    cardStyle: g.card_style ?? {},
    shortCode: g.short_code ?? null,
    createdAt: g.created_at,
    startedAt: g.started_at,
    endedAt: g.ended_at,
  };
}

// ── Scoring: points on a viewer's first confirmed win per game ───────────────
const RANK_POINTS = [100, 60, 40]; // 1st, 2nd, 3rd; everyone after = 20
const PATTERN_BONUS: Record<string, number> = { line: 0, double_line: 20, four_corners: 20, x: 20, full: 50 };
function pointsFor(rank: number, pattern: string): number {
  return (RANK_POINTS[rank - 1] ?? 20) + (PATTERN_BONUS[pattern] ?? 0);
}

/** Read-modify-write a viewer's cumulative score row (small scale; no contention). */
async function bumpScore(
  bot: ReturnType<typeof botSchema>,
  streamerId: string,
  userTwitchId: string,
  username: string,
  dPoints: number,
  dWins: number,
  dPlays: number,
): Promise<void> {
  const { data: row } = await bot
    .from('bingo_scores')
    .select('points, wins, plays')
    .eq('streamer_id', streamerId)
    .eq('user_twitch_id', userTwitchId)
    .maybeSingle();
  await bot.from('bingo_scores').upsert(
    {
      streamer_id: streamerId,
      user_twitch_id: userTwitchId,
      username,
      points: ((row as any)?.points ?? 0) + dPoints,
      wins: ((row as any)?.wins ?? 0) + dWins,
      plays: ((row as any)?.plays ?? 0) + dPlays,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'streamer_id,user_twitch_id' },
  );
}

async function leaderboard(bot: ReturnType<typeof botSchema>, streamerId: string, limit = 10) {
  const { data } = await bot
    .from('bingo_scores')
    .select('user_twitch_id, username, points, wins, plays')
    .eq('streamer_id', streamerId)
    .order('points', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: any, i: number) => ({
    rank: i + 1,
    name: r.username,
    points: r.points,
    wins: r.wins,
    plays: r.plays,
  }));
}

/**
 * Confirm a winning card: mark it confirmed, award points once per viewer per
 * game (finish rank + pattern bonus), and broadcast the winner. Shared by the
 * auto-validate claim path and the manual review "approve" action.
 */
async function confirmWin(
  bot: ReturnType<typeof botSchema>,
  env: Env,
  game: { id: string; streamer_id: string; win_condition: string },
  card: { id: string; name: string; user_twitch_id: string },
): Promise<{ rank: number; points: number }> {
  const { data: confirmed } = await bot
    .from('bingo_cards')
    .select('user_twitch_id')
    .eq('game_id', game.id)
    .eq('claim_status', 'confirmed');
  const winnerSet = new Set((confirmed ?? []).map((c: any) => c.user_twitch_id));
  const alreadyWon = winnerSet.has(card.user_twitch_id);
  const rank = winnerSet.size + 1;

  await bot
    .from('bingo_cards')
    .update({ has_bingo: true, bingo_at: new Date().toISOString(), claim_status: 'confirmed' })
    .eq('id', card.id);

  let points = 0;
  if (!alreadyWon) {
    points = pointsFor(rank, game.win_condition);
    await bumpScore(bot, game.streamer_id, card.user_twitch_id, card.name, points, 1, 0).catch(() => undefined);
  }
  await broadcast(env, `bingo:${game.id}`, 'bingo.winner', { cardId: card.id, name: card.name, rank, points });
  return { rank, points };
}

async function getOwnedGame(
  supabase: SupabaseClient,
  streamerId: string,
  id: string,
): Promise<GameRow | null> {
  const { data } = await botSchema(supabase)
    .from('bingo_games')
    .select('*')
    .eq('id', id)
    .eq('streamer_id', streamerId)
    .maybeSingle();
  return (data as GameRow) ?? null;
}

/**
 * Return a valid (decrypted, refreshed-if-needed) creator access token + the
 * creator's Twitch broadcaster id. Used for Helix calls (sub tier, rewards).
 */
async function getCreatorToken(
  supabase: SupabaseClient,
  env: Env,
  streamerId: string,
): Promise<{ token: string; broadcasterId: string } | null> {
  const { data: streamer } = await supabase
    .from('streamers')
    .select('twitch_id')
    .eq('id', streamerId)
    .maybeSingle();
  const { data: tenant } = await botSchema(supabase)
    .from('tenants')
    .select('encrypted_creator_access_token, encrypted_creator_refresh_token, creator_token_expires_at')
    .eq('streamer_id', streamerId)
    .maybeSingle();
  if (!streamer?.twitch_id || !tenant?.encrypted_creator_access_token) return null;

  const key = encryptionKeySecret(env);
  let token = await decryptSensitive(tenant.encrypted_creator_access_token, key);

  const exp = tenant.creator_token_expires_at ? new Date(tenant.creator_token_expires_at).getTime() : 0;
  if (exp && exp < Date.now() + 60_000 && tenant.encrypted_creator_refresh_token) {
    const refreshTok = await decryptSensitive(tenant.encrypted_creator_refresh_token, key);
    const refreshed = await refreshUserToken(env, refreshTok);
    if (refreshed?.access_token) {
      token = refreshed.access_token;
      const encAccess = await encryptSensitive(refreshed.access_token, key);
      const encRefresh = refreshed.refresh_token
        ? await encryptSensitive(refreshed.refresh_token, key)
        : tenant.encrypted_creator_refresh_token;
      const expiresAt = refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        : null;
      await botSchema(supabase)
        .from('tenants')
        .update({
          encrypted_creator_access_token: encAccess,
          encrypted_creator_refresh_token: encRefresh,
          creator_token_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('streamer_id', streamerId);
    }
  }
  return { token, broadcasterId: streamer.twitch_id };
}

interface EntitlementSummary {
  base: number;
  allowed: number;
  current: number;
  subTier: string | null;
  allowMultiple: boolean;
  channelPoints: ChannelPointsConfig;
}

/** Compute how many cards a viewer may hold for a game, and how many they have. */
async function computeEntitlement(
  supabase: SupabaseClient,
  env: Env,
  game: GameRow,
  viewerTwitchId: string,
): Promise<EntitlementSummary> {
  const ent = mergeEntitlements(game.entitlements);
  const bot = botSchema(supabase);

  const { count } = await bot
    .from('bingo_cards')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', game.id)
    .eq('user_twitch_id', viewerTwitchId);
  const current = count ?? 0;

  let subTier: string | null = null;
  let allowed = ent.base;

  if (ent.allowMultiple) {
    let subBonus = 0;
    const creds = await getCreatorToken(supabase, env, game.streamer_id);
    if (creds) {
      subTier = await getUserSubTier(env, creds.token, creds.broadcasterId, viewerTwitchId).catch(() => null);
      if (subTier) subBonus = Number(ent.subTierCards?.[subTier] ?? 0);
    }
    const { data: grants } = await bot
      .from('bingo_entitlement_grants')
      .select('amount')
      .eq('game_id', game.id)
      .eq('user_twitch_id', viewerTwitchId);
    const grantSum = (grants ?? []).reduce((s: number, g: any) => s + Number(g.amount || 0), 0);

    allowed = ent.base + subBonus + grantSum;
    const max = Number(ent.channelPoints?.maxPerUser ?? 0);
    if (max > 0) allowed = Math.min(allowed, max);
  }

  return { base: ent.base, allowed, current, subTier, allowMultiple: ent.allowMultiple, channelPoints: ent.channelPoints };
}

// ============================================================================
// Owner (authenticated) routes
// ============================================================================
async function handleOwner(ctx: IntegrationContext): Promise<Response | null> {
  const { request, env, supabase, streamerId, segments, method } = ctx;
  const bot = botSchema(supabase);

  // ---- /leaderboard (season standings) ----
  if (segments[0] === 'leaderboard') {
    if (method === 'GET') {
      return json({ leaderboard: await leaderboard(bot, streamerId, 25) }, request, env);
    }
    if (method === 'POST' && segments[1] === 'reset') {
      await bot.from('bingo_scores').delete().eq('streamer_id', streamerId);
      return json({ ok: true }, request, env);
    }
    return error('Method not allowed', 405, request, env);
  }

  // ---- /upload/image — store a tile image, return its public URL ----
  if (segments[0] === 'upload' && segments[1] === 'image' && method === 'POST') {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file') as unknown;
    if (!(file instanceof File)) return error('file required', 400, request, env);
    if (!file.type.startsWith('image/')) return error('must be an image', 400, request, env);
    if (file.size > 3 * 1024 * 1024) return error('image must be under 3MB', 400, request, env);
    const path = `images/${streamerId}/${crypto.randomUUID()}.${safeExt(file.name, 'png')}`;
    const url = await uploadPublic(supabase, path, file, file.type);
    if (!url) return error('Upload failed', 500, request, env);
    return json({ url }, request, env, { status: 201 });
  }

  // ---- /templates (saved, reusable tile pools + styling) ----
  if (segments[0] === 'templates') {
    const tplId = segments[1];
    if (!tplId && method === 'GET') {
      const { data } = await bot
        .from('bingo_templates')
        .select('*')
        .eq('streamer_id', streamerId)
        .order('created_at', { ascending: false });
      return json(
        {
          templates: (data ?? []).map((t: any) => ({
            id: t.id,
            name: t.name,
            size: t.size,
            freeSpace: t.free_space,
            winCondition: t.win_condition,
            tiles: normalizeTiles(t.tiles),
            cardStyle: t.card_style ?? {},
          })),
        },
        request,
        env,
      );
    }
    if (!tplId && method === 'POST') {
      const b = (await request.json().catch(() => ({}))) as any;
      const { data, error: dbErr } = await bot
        .from('bingo_templates')
        .insert({
          streamer_id: streamerId,
          name: String(b.name ?? 'Template').slice(0, 80),
          size: Math.min(MAX_SIZE, Math.max(MIN_SIZE, Number(b.size ?? 5))),
          free_space: b.freeSpace !== false,
          win_condition: asPattern(b.winCondition),
          tiles: normalizeTiles(b.tiles),
          card_style: b.cardStyle && typeof b.cardStyle === 'object' ? b.cardStyle : {},
        })
        .select('id')
        .single();
      if (dbErr) return error(dbErr.message, 500, request, env);
      return json({ id: data.id }, request, env, { status: 201 });
    }
    if (tplId && method === 'DELETE') {
      await bot.from('bingo_templates').delete().eq('id', tplId).eq('streamer_id', streamerId);
      return json({ ok: true }, request, env);
    }
    return error('Method not allowed', 405, request, env);
  }

  // ---- /chat-command (account-level !bingo via EventSub chat) ----
  // Shares the streamer's single channel.chat.message subscription with the
  // bot pipeline (lib/chat-subscription.ts) — enabling either turns it on.
  if (segments[0] === 'chat-command') {
    const sub = segments[1];
    if (method === 'GET') {
      return json({ enabled: await chatSubscriptionActive(supabase, streamerId) }, request, env);
    }
    if (method === 'POST' && sub === 'enable') {
      const result = await ensureChatSubscription(env, supabase, streamerId, new URL(request.url).origin);
      if (!result.ok && result.reason === 'Reconnect Twitch first') return error(result.reason, 400, request, env);
      return json({ enabled: true, eventSubActive: result.ok }, request, env);
    }
    if (method === 'POST' && sub === 'disable') {
      await removeChatSubscription(env, supabase, streamerId);
      return json({ enabled: false }, request, env);
    }
    return error('Method not allowed', 405, request, env);
  }

  // ---- /history (recent confirmed winners across all of this streamer's games) ----
  if (segments[0] === 'history') {
    if (method !== 'GET') return error('Method not allowed', 405, request, env);
    const { data: games } = await bot.from('bingo_games').select('id, title').eq('streamer_id', streamerId);
    const titles = new Map((games ?? []).map((g: any) => [g.id, g.title]));
    const ids = [...titles.keys()];
    if (ids.length === 0) return json({ history: [] }, request, env);
    const { data: wins } = await bot
      .from('bingo_cards')
      .select('id, name, game_id, bingo_at')
      .in('game_id', ids)
      .eq('claim_status', 'confirmed')
      .order('bingo_at', { ascending: false })
      .limit(50);
    return json(
      { history: (wins ?? []).map((w: any) => ({ id: w.id, name: w.name, game: titles.get(w.game_id) ?? 'Bingo', at: w.bingo_at })) },
      request,
      env,
    );
  }

  if (segments[0] !== 'games') return null;
  const id = segments[1];
  const action = segments[2];

  // ---- /games ----
  if (!id) {
    if (method === 'GET') {
      const { data } = await bot
        .from('bingo_games')
        .select('*')
        .eq('streamer_id', streamerId)
        .order('created_at', { ascending: false });
      return json({ games: (data ?? []).map((g) => mapGame(g as GameRow)) }, request, env);
    }
    if (method === 'POST') {
      if (!ctx.enabled) return error('Bingo is not enabled', 403, request, env);
      const body = (await request.json().catch(() => ({}))) as any;
      const size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Number(body.size ?? 5)));
      const winCondition = asPattern(body.winCondition);
      const tiles = normalizeTiles(body.tiles);
      const { data, error: dbErr } = await bot
        .from('bingo_games')
        .insert({
          streamer_id: streamerId,
          title: String(body.title ?? 'Stream Bingo').slice(0, 120),
          size,
          free_space: body.freeSpace !== false,
          win_condition: winCondition,
          tiles,
          called: [],
          status: 'draft',
          entitlements: DEFAULT_ENTITLEMENTS,
          reward: body.reward ? String(body.reward).slice(0, 280) : null,
          review_mode: asReviewMode(body.reviewMode),
          card_style: body.cardStyle && typeof body.cardStyle === 'object' ? body.cardStyle : {},
        })
        .select('*')
        .single();
      if (dbErr) return error(dbErr.message, 500, request, env);
      return json({ game: mapGame(data as GameRow) }, request, env, { status: 201 });
    }
    return error('Method not allowed', 405, request, env);
  }

  // ---- /games/:id ----
  const game = await getOwnedGame(supabase, streamerId, id);
  if (!game) return error('Game not found', 404, request, env);

  if (!action) {
    if (method === 'GET') {
      const { count } = await bot
        .from('bingo_cards')
        .select('id', { count: 'exact', head: true })
        .eq('game_id', id);
      const { data: winners } = await bot
        .from('bingo_cards')
        .select('id, name, user_twitch_id, bingo_at')
        .eq('game_id', id)
        .eq('claim_status', 'confirmed')
        .order('bingo_at', { ascending: true });
      return json(
        { game: mapGame(game), cardCount: count ?? 0, winners: winners ?? [] },
        request,
        env,
      );
    }
    if (method === 'PATCH') {
      const body = (await request.json().catch(() => ({}))) as any;
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (body.title !== undefined) patch.title = String(body.title).slice(0, 120);
      if (body.winCondition !== undefined) patch.win_condition = asPattern(body.winCondition);
      if (body.reward !== undefined) patch.reward = body.reward ? String(body.reward).slice(0, 280) : null;
      if (body.reviewMode !== undefined) patch.review_mode = asReviewMode(body.reviewMode);
      if (body.cardStyle !== undefined && typeof body.cardStyle === 'object') {
        patch.card_style = { ...(game.card_style ?? {}), ...body.cardStyle };
      }
      if (body.entitlements !== undefined) {
        patch.entitlements = mergeEntitlements({ ...mergeEntitlements(game.entitlements), ...body.entitlements });
      }
      if (body.tiles !== undefined || body.size !== undefined || body.freeSpace !== undefined) {
        if (game.status !== 'draft') {
          return error('Cannot edit tiles or board size after the game has started', 409, request, env);
        }
        if (body.size !== undefined) patch.size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Number(body.size)));
        if (body.freeSpace !== undefined) patch.free_space = body.freeSpace !== false;
        if (body.tiles !== undefined) patch.tiles = normalizeTiles(body.tiles);
      }
      const { data, error: dbErr } = await bot
        .from('bingo_games')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (dbErr) return error(dbErr.message, 500, request, env);
      return json({ game: mapGame(data as GameRow) }, request, env);
    }
    if (method === 'DELETE') {
      await bot.from('bingo_games').delete().eq('id', id);
      return json({ success: true }, request, env);
    }
    return error('Method not allowed', 405, request, env);
  }

  // ---- /games/:id/claims (manual review queue) — GET queue + POST approve/deny ----
  if (action === 'claims') {
    const cardId = segments[3];
    const sub = segments[4];

    if (!cardId && method === 'GET') {
      const { data } = await bot
        .from('bingo_cards')
        .select('id, name, cells, marks, card_number, bingo_at')
        .eq('game_id', id)
        .eq('claim_status', 'pending')
        .order('bingo_at', { ascending: true });
      return json(
        {
          claims: (data ?? []).map((c: any) => ({
            id: c.id,
            name: c.name,
            cells: c.cells,
            marks: normalizeMarks(c.marks),
            cardNumber: c.card_number,
            submittedAt: c.bingo_at,
          })),
        },
        request,
        env,
      );
    }

    if (cardId && (sub === 'approve' || sub === 'deny') && method === 'POST') {
      const card = (await bot
        .from('bingo_cards')
        .select('id, name, user_twitch_id, claim_status')
        .eq('id', cardId)
        .eq('game_id', id)
        .maybeSingle()).data as any;
      if (!card) return error('Card not found', 404, request, env);

      if (sub === 'deny') {
        await bot.from('bingo_cards').update({ claim_status: 'denied' }).eq('id', card.id);
        await broadcast(env, `bingo:${id}`, 'bingo.denied', { cardId: card.id });
        return json({ ok: true }, request, env);
      }
      const res = await confirmWin(
        bot,
        env,
        { id: game.id, streamer_id: game.streamer_id, win_condition: game.win_condition },
        card,
      );
      return json({ ok: true, ...res }, request, env);
    }
    return error('Not found', 404, request, env);
  }

  // ---- /games/:id/<action> (POST) ----
  if (method !== 'POST') return error('Method not allowed', 405, request, env);

  if (action === 'start') {
    const need = tilesNeeded(game.size, game.free_space);
    if ((game.tiles ?? []).length < need) {
      return error(`Need at least ${need} tiles to start, have ${(game.tiles ?? []).length}`, 400, request, env);
    }
    await bot
      .from('bingo_games')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('streamer_id', streamerId)
      .eq('status', 'active')
      .neq('id', id);
    const { data, error: dbErr } = await bot
      .from('bingo_games')
      .update({ status: 'active', started_at: new Date().toISOString(), ended_at: null })
      .eq('id', id)
      .select('*')
      .single();
    if (dbErr) return error(dbErr.message, 500, request, env);
    await broadcast(env, `bingo:${id}`, 'bingo.started', { gameId: id });
    return json({ game: mapGame(data as GameRow) }, request, env);
  }

  // Calling a tile is the validation ground truth — it no longer marks cards.
  // `called` is an ordered log of tile ids; calling a multi-check tile again
  // appends another occurrence (count = occurrences). Body: { tileId } (or `tile`).
  if (action === 'call' || action === 'uncall') {
    if (game.status !== 'active') return error('Game is not active', 409, request, env);
    const tiles = normalizeTiles(game.tiles);
    const body = (await request.json().catch(() => ({}))) as { tileId?: string; tile?: string };
    const tileId = String(body.tileId ?? body.tile ?? '').trim();
    if (!tileId) return error('tileId is required', 400, request, env);
    if (action === 'call' && !tiles.some((t) => t.id === tileId)) {
      return error('That tile is not in this game', 400, request, env);
    }
    const called = [...(game.called ?? [])];
    if (action === 'call') {
      called.push(tileId);
    } else {
      const last = called.lastIndexOf(tileId);
      if (last >= 0) called.splice(last, 1);
    }
    const { data, error: dbErr } = await bot
      .from('bingo_games')
      .update({ called, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (dbErr) return error(dbErr.message, 500, request, env);
    await broadcast(env, `bingo:${id}`, 'bingo.called', { tileId, called, action });
    return json({ game: mapGame(data as GameRow) }, request, env);
  }

  if (action === 'reset') {
    const { data, error: dbErr } = await bot
      .from('bingo_games')
      .update({ called: [], updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (dbErr) return error(dbErr.message, 500, request, env);
    await broadcast(env, `bingo:${id}`, 'bingo.reset', { gameId: id });
    return json({ game: mapGame(data as GameRow) }, request, env);
  }

  if (action === 'end') {
    const { data, error: dbErr } = await bot
      .from('bingo_games')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (dbErr) return error(dbErr.message, 500, request, env);
    await broadcast(env, `bingo:${id}`, 'bingo.ended', { gameId: id });
    return json({ game: mapGame(data as GameRow) }, request, env);
  }

  // Next round: keep every player seated, re-deal fresh cards, clear marks +
  // calls, bump the round counter. Leaderboard points carry over across rounds.
  if (action === 'next-round') {
    const need = tilesNeeded(game.size, game.free_space);
    if ((game.tiles ?? []).length < need) {
      return error(`Need at least ${need} tiles, have ${(game.tiles ?? []).length}`, 400, request, env);
    }
    const tiles = normalizeTiles(game.tiles);
    // Re-deal every card in ONE upsert. Per-card update in a loop didn't scale:
    // a popular game has hundreds of cards → hundreds of round-trips → timeout
    // mid-stream. Full rows are needed so the upsert's insert path satisfies
    // NOT NULL columns (these ids all exist, so it resolves to UPDATE).
    const { data: cards } = await bot.from('bingo_cards').select('*').eq('game_id', id);
    const reset = [];
    for (const c of (cards ?? []) as any[]) {
      try {
        reset.push({ ...c, cells: generateCells(tiles, game.size, game.free_space), marks: {}, claim_status: 'none', has_bingo: false, bingo_at: null });
      } catch {
        // ponytail: shouldn't happen — tile count is validated above; skip the odd card.
      }
    }
    if (reset.length > 0) await bot.from('bingo_cards').upsert(reset, { onConflict: 'id' });
    const { data, error: dbErr } = await bot
      .from('bingo_games')
      .update({
        called: [],
        round: (game.round ?? 1) + 1,
        status: 'active',
        started_at: new Date().toISOString(),
        ended_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (dbErr) return error(dbErr.message, 500, request, env);
    await broadcast(env, `bingo:${id}`, 'bingo.round', { round: (data as GameRow).round });
    return json({ game: mapGame(data as GameRow) }, request, env);
  }

  // ---- /games/:id/channel-points/<enable|disable> ----
  if (action === 'channel-points') {
    const sub = segments[3];
    const ent = mergeEntitlements(game.entitlements);

    if (sub === 'enable') {
      const body = (await request.json().catch(() => ({}))) as any;
      const cost = Math.max(1, Number(body.cost ?? ent.channelPoints.cost));
      const cardsPerRedemption = Math.max(1, Number(body.cardsPerRedemption ?? ent.channelPoints.cardsPerRedemption));
      const maxPerUser = Math.max(1, Number(body.maxPerUser ?? ent.channelPoints.maxPerUser));

      const creds = await getCreatorToken(supabase, env, streamerId);
      if (!creds) return error('Creator Twitch token unavailable; reconnect Twitch', 400, request, env);
      const appToken = await getAppAccessToken(env);
      if (!appToken) return error('Could not obtain Twitch app token', 502, request, env);

      const rewardId = await createCustomReward(env, creds.token, creds.broadcasterId, {
        title: `Extra Bingo Card — ${game.title}`.slice(0, 45),
        cost,
        prompt: 'Redeem to get another bingo card for the current game.',
      });
      if (!rewardId) return error('Could not create the channel-point reward (need channel:manage:redemptions; re-auth Twitch)', 502, request, env);

      const origin = env.PUBLIC_WORKER_URL || new URL(request.url).origin;
      const secret = eventsubSecret(env);
      const twitchSubId = await createEventSubSubscription(env, appToken, {
        type: REDEMPTION_ADD,
        condition: { broadcaster_user_id: creds.broadcasterId, reward_id: rewardId },
        callback: `${origin}/api/eventsub/callback`,
        secret,
      });

      await bot.from('eventsub_subscriptions').upsert(
        {
          streamer_id: streamerId,
          type: REDEMPTION_ADD,
          reward_id: rewardId,
          twitch_sub_id: twitchSubId,
          secret,
          status: twitchSubId ? 'pending' : 'failed',
        },
        { onConflict: 'streamer_id,type,reward_id' },
      );

      const entitlements = mergeEntitlements({
        ...ent,
        allowMultiple: true,
        channelPoints: { enabled: true, rewardId, cost, cardsPerRedemption, maxPerUser },
      });
      const { data, error: dbErr } = await bot
        .from('bingo_games')
        .update({ entitlements, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (dbErr) return error(dbErr.message, 500, request, env);
      return json(
        { game: mapGame(data as GameRow), eventSubActive: Boolean(twitchSubId) },
        request,
        env,
      );
    }

    if (sub === 'disable') {
      const rewardId = ent.channelPoints.rewardId;
      if (rewardId) {
        const creds = await getCreatorToken(supabase, env, streamerId);
        const appToken = await getAppAccessToken(env);
        const { data: subRow } = await bot
          .from('eventsub_subscriptions')
          .select('twitch_sub_id')
          .eq('streamer_id', streamerId)
          .eq('reward_id', rewardId)
          .maybeSingle();
        if (appToken && subRow?.twitch_sub_id) await deleteEventSubSubscription(env, appToken, subRow.twitch_sub_id);
        if (creds) await deleteCustomReward(env, creds.token, creds.broadcasterId, rewardId);
        await bot.from('eventsub_subscriptions').delete().eq('streamer_id', streamerId).eq('reward_id', rewardId);
      }
      const entitlements = mergeEntitlements({
        ...ent,
        channelPoints: { ...ent.channelPoints, enabled: false, rewardId: null },
      });
      const { data, error: dbErr } = await bot
        .from('bingo_games')
        .update({ entitlements, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (dbErr) return error(dbErr.message, 500, request, env);
      return json({ game: mapGame(data as GameRow) }, request, env);
    }

    return error('Unknown channel-points action', 404, request, env);
  }

  return null;
}

// ============================================================================
// Viewer (public) routes — Twitch viewer session required for join/mark/claim
// ============================================================================
async function handlePublic(ctx: PublicIntegrationContext): Promise<Response | null> {
  const { request, env, supabase, segments, method } = ctx;
  const bot = botSchema(supabase);
  const [resource, resourceId, action] = segments;

  // ---- /resolve/:code — short share-link lookup (app .../b/<code>) ----
  if (resource === 'resolve' && resourceId && method === 'GET') {
    const { data } = await bot
      .from('bingo_games')
      .select('id')
      .eq('short_code', resourceId.toLowerCase())
      .maybeSingle();
    if (!data) return error('Not found', 404, request, env);
    return json({ gameId: (data as { id: string }).id }, request, env);
  }

  // Player-facing game state. Tiles (labels/images) + card style are sent so the
  // card can render; `called` is intentionally NOT included — viewers daub their
  // own card and don't see the mod's calls.
  const publicGame = (g: GameRow) => ({
    id: g.id,
    title: g.title,
    size: g.size,
    freeSpace: g.free_space,
    winCondition: g.win_condition,
    status: g.status,
    round: g.round ?? 1,
    reward: g.reward ?? null,
    reviewMode: asReviewMode(g.review_mode),
    cardStyle: g.card_style ?? {},
    tiles: normalizeTiles(g.tiles),
  });

  const playerCount = async (gameId: string): Promise<number> => {
    const { data } = await bot.from('bingo_cards').select('user_twitch_id').eq('game_id', gameId);
    return new Set((data ?? []).map((c: any) => c.user_twitch_id)).size;
  };
  const recentWinners = async (gameId: string) => {
    const { data } = await bot
      .from('bingo_cards')
      .select('id, name, bingo_at')
      .eq('game_id', gameId)
      .eq('claim_status', 'confirmed')
      .order('bingo_at', { ascending: true })
      .limit(25);
    return (data ?? []).map((w: any) => ({ id: w.id, name: w.name, bingoAt: w.bingo_at }));
  };

  // GET /public/games/:id — basic game state (no auth, so the page can prompt login).
  if (resource === 'games' && resourceId && !action && method === 'GET') {
    const { data } = await bot.from('bingo_games').select('*').eq('id', resourceId).maybeSingle();
    if (!data) return error('Game not found', 404, request, env);
    return json(
      { game: publicGame(data as GameRow), players: await playerCount(resourceId), winners: await recentWinners(resourceId) },
      request,
      env,
    );
  }

  // GET /public/games/:id/board — full broadcast state for the OBS overlay (calls
  // ARE shown here: it's the streamer's own overlay, not a player's card).
  if (resource === 'games' && resourceId && action === 'board' && method === 'GET') {
    const { data } = await bot.from('bingo_games').select('*').eq('id', resourceId).maybeSingle();
    if (!data) return error('Game not found', 404, request, env);
    const g = data as GameRow;
    const tiles = normalizeTiles(g.tiles);
    const byId = new Map(tiles.map((t) => [t.id, t]));
    const recentCalls = [...(g.called ?? [])].slice(-8).reverse().map((cid) => {
      const t = byId.get(cid);
      return { id: cid, label: t?.label ?? cid, image: t?.image ?? null };
    });
    return json(
      {
        game: publicGame(g),
        reward: g.reward ?? null,
        calls: (g.called ?? []).length,
        players: await playerCount(resourceId),
        winners: await recentWinners(resourceId),
        recentCalls,
        leaderboard: await leaderboard(bot, g.streamer_id, 5),
      },
      request,
      env,
    );
  }

  // GET /public/games/:id/leaderboard — season standings for this game's channel.
  if (resource === 'games' && resourceId && action === 'leaderboard' && method === 'GET') {
    const { data } = await bot.from('bingo_games').select('streamer_id').eq('id', resourceId).maybeSingle();
    if (!data) return error('Game not found', 404, request, env);
    return json({ leaderboard: await leaderboard(bot, (data as any).streamer_id, 25) }, request, env);
  }

  // GET /public/games/:id/entitlement — viewer's allowance (requires login).
  if (resource === 'games' && resourceId && action === 'entitlement' && method === 'GET') {
    const viewer = await getViewerFromSession(request, env, supabase);
    if (!viewer) return error('Log in with Twitch to play', 401, request, env);
    const { data } = await bot.from('bingo_games').select('*').eq('id', resourceId).maybeSingle();
    if (!data) return error('Game not found', 404, request, env);
    const ent = await computeEntitlement(supabase, env, data as GameRow, viewer.twitch_id);
    return json({ entitlement: ent }, request, env);
  }

  // GET /public/games/:id/cards — the viewer's own cards for this game.
  if (resource === 'games' && resourceId && action === 'cards' && method === 'GET') {
    const viewer = await getViewerFromSession(request, env, supabase);
    if (!viewer) return error('Log in with Twitch to play', 401, request, env);
    const { data } = await bot
      .from('bingo_cards')
      .select('id, cells, marks, card_number, has_bingo, claim_status')
      .eq('game_id', resourceId)
      .eq('user_twitch_id', viewer.twitch_id)
      .order('card_number', { ascending: true });
    return json(
      {
        cards: (data ?? []).map((c: any) => ({
          id: c.id,
          cells: c.cells,
          marks: normalizeMarks(c.marks),
          cardNumber: c.card_number,
          hasBingo: c.has_bingo,
          claimStatus: c.claim_status,
        })),
      },
      request,
      env,
    );
  }

  // POST /public/games/:id/join — create the viewer's next card (entitlement-gated).
  if (resource === 'games' && resourceId && action === 'join' && method === 'POST') {
    const viewer = await getViewerFromSession(request, env, supabase);
    if (!viewer) return error('Log in with Twitch to play', 401, request, env);

    const game = (await bot.from('bingo_games').select('*').eq('id', resourceId).maybeSingle()).data as GameRow | null;
    if (!game) return error('Game not found', 404, request, env);
    if (game.status !== 'active') return error('This game is not accepting players right now', 409, request, env);

    const ent = await computeEntitlement(supabase, env, game, viewer.twitch_id);
    if (ent.current >= ent.allowed) {
      return error(
        ent.allowMultiple
          ? `You already have your ${ent.current} card(s). Redeem the channel-point reward or sub for more.`
          : 'You already have a card for this game.',
        409,
        request,
        env,
      );
    }

    let cells: string[];
    try {
      cells = generateCells(normalizeTiles(game.tiles), game.size, game.free_space);
    } catch (e) {
      return error((e as Error).message, 400, request, env);
    }
    const cardNumber = ent.current + 1;
    const { data: card, error: dbErr } = await bot
      .from('bingo_cards')
      .insert({
        game_id: game.id,
        user_twitch_id: viewer.twitch_id,
        player_id: viewer.twitch_id, // legacy column kept populated
        name: viewer.username,
        cells,
        card_number: cardNumber,
        marks: {},
      })
      .select('*')
      .single();
    if (dbErr) return error(dbErr.message, 500, request, env);

    // First card in this game = a "play" for the leaderboard.
    if (ent.current === 0) {
      await bumpScore(bot, game.streamer_id, viewer.twitch_id, viewer.username, 0, 0, 1).catch(() => undefined);
    }
    await broadcast(env, `bingo:${game.id}`, 'bingo.joined', { players: await playerCount(game.id) }).catch(() => undefined);

    return json(
      {
        card: { id: card.id, name: card.name, cells: card.cells, marks: card.marks ?? [], cardNumber, claimStatus: card.claim_status },
        game: publicGame(game),
        entitlement: { ...ent, current: ent.current + 1 },
      },
      request,
      env,
    );
  }

  // GET /public/cards/:id — a card with the viewer's marks + the called set.
  if (resource === 'cards' && resourceId && !action && method === 'GET') {
    const viewer = await getViewerFromSession(request, env, supabase);
    if (!viewer) return error('Log in with Twitch to play', 401, request, env);
    const card = (await bot.from('bingo_cards').select('*').eq('id', resourceId).maybeSingle()).data as any;
    if (!card || card.user_twitch_id !== viewer.twitch_id) return error('Card not found', 404, request, env);
    const game = (await bot
      .from('bingo_games')
      .select('status')
      .eq('id', card.game_id)
      .maybeSingle()).data as any;
    return json(
      {
        card: {
          id: card.id,
          name: card.name,
          cells: card.cells,
          marks: normalizeMarks(card.marks),
          cardNumber: card.card_number,
          hasBingo: card.has_bingo,
          claimStatus: card.claim_status,
        },
        status: game?.status ?? 'ended',
      },
      request,
      env,
    );
  }

  // POST /public/cards/:id/mark — daub a cell on the viewer's own card. A tap
  // increments the cell's check count; for a multi-check tile it cycles
  // 0→1→…→count→0. `clear:true` resets a cell to 0.
  if (resource === 'cards' && resourceId && action === 'mark' && method === 'POST') {
    const viewer = await getViewerFromSession(request, env, supabase);
    if (!viewer) return error('Log in with Twitch to play', 401, request, env);
    const card = (await bot.from('bingo_cards').select('*').eq('id', resourceId).maybeSingle()).data as any;
    if (!card || card.user_twitch_id !== viewer.twitch_id) return error('Card not found', 404, request, env);

    const body = (await request.json().catch(() => ({}))) as { index?: number; clear?: boolean };
    const index = Number(body.index);
    const cells: string[] = card.cells ?? [];
    if (!Number.isInteger(index) || index < 0 || index >= cells.length) {
      return error('invalid cell index', 400, request, env);
    }
    const marks = normalizeMarks(card.marks);
    if (cells[index] === 'FREE') return json({ marks }, request, env); // FREE is always complete

    const game = (await bot.from('bingo_games').select('tiles').eq('id', card.game_id).maybeSingle()).data as any;
    const need = tileCount(normalizeTiles(game?.tiles), cells[index]);
    const current = Number(marks[String(index)] ?? 0);
    const next = body.clear ? 0 : current + 1 > need ? 0 : current + 1;
    if (next <= 0) delete marks[String(index)];
    else marks[String(index)] = next;

    const { error: dbErr } = await bot.from('bingo_cards').update({ marks }).eq('id', card.id);
    if (dbErr) return error(dbErr.message, 500, request, env);
    return json({ marks }, request, env);
  }

  // POST /public/cards/:id/claim — validate a BINGO against the called set.
  if (resource === 'cards' && resourceId && action === 'claim' && method === 'POST') {
    const viewer = await getViewerFromSession(request, env, supabase);
    if (!viewer) return error('Log in with Twitch to play', 401, request, env);
    const card = (await bot.from('bingo_cards').select('*').eq('id', resourceId).maybeSingle()).data as any;
    if (!card || card.user_twitch_id !== viewer.twitch_id) return error('Card not found', 404, request, env);

    const game = (await bot
      .from('bingo_games')
      .select('id, streamer_id, tiles, called, win_condition, status, review_mode')
      .eq('id', card.game_id)
      .maybeSingle()).data as any;
    if (!game) return error('Game not found', 404, request, env);

    const tiles = normalizeTiles(game.tiles);
    const cells = card.cells ?? [];
    const marks = normalizeMarks(card.marks);
    const pattern = game.win_condition as WinCondition;

    // Manual review: the player's own marks must form the pattern; the streamer is
    // the validator (no called-count check). Goes into the review queue.
    if (asReviewMode(game.review_mode) === 'manual') {
      if (!hasBingoFromMarks(cells, tiles, marks, pattern)) {
        return json({ valid: false, reason: `You haven't completed the pattern yet` }, request, env);
      }
      await bot
        .from('bingo_cards')
        .update({ claim_status: 'pending', bingo_at: new Date().toISOString() })
        .eq('id', card.id);
      await broadcast(env, `bingo:${game.id}`, 'bingo.submitted', { cardId: card.id, name: card.name });
      return json({ submitted: true }, request, env);
    }

    // Auto-validate: marks form the pattern AND every completed tile was called enough.
    const result = validateClaim(cells, tiles, marks, countMap(game.called ?? []), pattern);
    if (!result.valid) {
      // "verifying" = the pattern is complete but the streamer hasn't called those
      // tiles yet. Leave the card untouched so the player can re-claim once they're
      // called; only a genuinely-incomplete pattern is marked invalid.
      if (!result.verifying) {
        await bot.from('bingo_cards').update({ claim_status: 'invalid' }).eq('id', card.id);
      }
      return json({ valid: false, verifying: result.verifying ?? false, reason: result.reason }, request, env);
    }
    const res = await confirmWin(
      bot,
      env,
      { id: game.id, streamer_id: game.streamer_id, win_condition: game.win_condition },
      { id: card.id, name: card.name, user_twitch_id: viewer.twitch_id },
    );
    return json({ valid: true, ...res }, request, env);
  }

  return null;
}

const bingo: Integration = {
  manifest: {
    id: 'bingo',
    name: 'Bingo',
    description: 'Viewers log in, mark their own cards, and press BINGO — wins are validated against the tiles you call.',
    icon: 'Grid3x3',
    category: 'game',
    dashboardPath: '/dashboard/bingo',
    defaultConfig: {},
  },
  handle: handleOwner,
  handlePublic,
};

export default bingo;
