import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { json, error } from '../lib/response';
import { broadcast } from '../realtime';
import { generateCells, normalizeTiles } from '../integrations/bingo/logic';
import { parseChatEvent, processChatMessage } from '../chat/pipeline';
import { EVENTSUB_TO_ALERT, processAlertNotification } from '../lib/alerts';
import { announceGoLive } from '../lib/discord';

/**
 * Twitch EventSub webhook receiver. Powers channel-point "buy an extra bingo
 * card" purchases: when a viewer redeems the streamer's bingo reward, Twitch
 * POSTs here and we record an entitlement grant so the viewer can create another
 * card. See migrations/006_bingo_v2.sql (bot.eventsub_subscriptions, grants).
 *
 *   POST /api/eventsub/callback   Twitch webhook (verify HMAC; challenge; notify)
 *   POST /api/eventsub/simulate   dev-only: fake a redemption (no public URL needed)
 *
 * NOTE: Twitch can't reach localhost, so in dev use /simulate (or a tunnel +
 * PUBLIC_WORKER_URL). All subscriptions are created with a single shared secret
 * (EVENTSUB_SECRET, falling back to SESSION_SECRET) used to verify signatures.
 */

const REDEMPTION_ADD = 'channel.channel_points_custom_reward_redemption.add';
const CHAT_MESSAGE = 'channel.chat.message';

export function eventsubSecret(env: Env): string {
  return env.EVENTSUB_SECRET || env.SESSION_SECRET;
}

/** HMAC-SHA256 hex of a message using the EventSub secret. */
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time-ish compare for hex signatures. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * Record a channel-point card grant for a viewer on the streamer's active bingo
 * game that uses `rewardId`. Idempotent on `redemptionId`. Shared by the real
 * webhook and the dev simulator. Returns the grant outcome for logging.
 */
async function grantChannelPointCard(
  supabase: SupabaseClient,
  env: Env,
  ev: { broadcasterTwitchId: string; rewardId: string; userTwitchId: string; userName?: string; redemptionId?: string },
): Promise<{ granted: boolean; reason?: string }> {
  // broadcaster (twitch id) -> streamer row
  const { data: streamer } = await supabase
    .from('streamers')
    .select('id')
    .eq('twitch_id', ev.broadcasterTwitchId)
    .maybeSingle();
  if (!streamer) return { granted: false, reason: 'no streamer' };

  const bot = botSchema(supabase);
  // Find the streamer's active game whose channel-point reward matches.
  const { data: games } = await bot
    .from('bingo_games')
    .select('id, streamer_id, status, entitlements')
    .eq('streamer_id', streamer.id)
    .eq('status', 'active');
  const game = (games ?? []).find(
    (g: any) => g.entitlements?.channelPoints?.enabled && g.entitlements?.channelPoints?.rewardId === ev.rewardId,
  ) as any;
  if (!game) return { granted: false, reason: 'no active game for reward' };

  const amount = Math.max(1, Number(game.entitlements?.channelPoints?.cardsPerRedemption ?? 1));
  const { error: insErr } = await bot.from('bingo_entitlement_grants').insert({
    game_id: game.id,
    streamer_id: streamer.id,
    user_twitch_id: ev.userTwitchId,
    source: 'channel_points',
    amount,
    redemption_id: ev.redemptionId ?? null,
  });
  // Unique violation on redemption_id => already processed; treat as success.
  if (insErr && !/duplicate key|unique/i.test(insErr.message)) {
    return { granted: false, reason: insErr.message };
  }
  await broadcast(env, `bingo:${game.id}`, 'bingo.grant', { userTwitchId: ev.userTwitchId, amount }).catch(() => undefined);
  return { granted: true };
}

/**
 * `!bingo` in chat → grant the chatter a card for the streamer's active game
 * (one per account; only while a game is active). The card is pre-bound to their
 * Twitch id so it appears when they open the play link and log in.
 */
async function grantChatCard(
  supabase: SupabaseClient,
  env: Env,
  ev: { broadcasterTwitchId: string; userTwitchId: string; userName?: string },
): Promise<{ granted: boolean; reason?: string }> {
  const { data: streamer } = await supabase
    .from('streamers')
    .select('id')
    .eq('twitch_id', ev.broadcasterTwitchId)
    .maybeSingle();
  if (!streamer) return { granted: false, reason: 'no streamer' };

  const bot = botSchema(supabase);
  const { data: game } = await bot
    .from('bingo_games')
    .select('id, size, free_space, tiles, status')
    .eq('streamer_id', streamer.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!game) return { granted: false, reason: 'no active game' };

  const existing = await bot
    .from('bingo_cards')
    .select('id')
    .eq('game_id', game.id)
    .eq('user_twitch_id', ev.userTwitchId)
    .maybeSingle();
  if (existing.data) return { granted: false, reason: 'already has a card' };

  let cells: string[];
  try {
    cells = generateCells(normalizeTiles(game.tiles), game.size, game.free_space);
  } catch {
    return { granted: false, reason: 'not enough tiles' };
  }
  await bot.from('bingo_cards').insert({
    game_id: game.id,
    user_twitch_id: ev.userTwitchId,
    player_id: ev.userTwitchId,
    name: ev.userName || 'Player',
    cells,
    card_number: 1,
    marks: {},
  });
  await broadcast(env, `bingo:${game.id}`, 'bingo.joined', {}).catch(() => undefined);
  return { granted: true };
}

/**
 * Clean up after Twitch revokes a subscription (token expired, scope removed,
 * permission lost). Remove our dead record; if the chat sub died, mark the
 * tenant disconnected so the dashboard prompts a reconnect instead of silently
 * going dark.
 */
async function handleRevocation(supabase: SupabaseClient, sub: Record<string, any> | undefined): Promise<void> {
  const subId = String(sub?.id ?? '');
  const type = String(sub?.type ?? '');
  if (!subId) return;
  const bot = botSchema(supabase);
  const { data: row } = await bot
    .from('eventsub_subscriptions')
    .select('streamer_id')
    .eq('twitch_sub_id', subId)
    .maybeSingle();
  await bot.from('eventsub_subscriptions').delete().eq('twitch_sub_id', subId);
  if (row?.streamer_id && type === 'channel.chat.message') {
    await bot
      .from('tenants')
      .update({ is_connected: false, updated_at: new Date().toISOString() })
      .eq('streamer_id', row.streamer_id);
  }
}

export async function handleEventSub(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
  ctx?: ExecutionContext,
): Promise<Response | null> {
  // --- Real Twitch webhook ---
  if (path === '/api/eventsub/callback' && method === 'POST') {
    const raw = await request.text();
    const id = request.headers.get('Twitch-Eventsub-Message-Id') ?? '';
    const ts = request.headers.get('Twitch-Eventsub-Message-Timestamp') ?? '';
    const sig = request.headers.get('Twitch-Eventsub-Message-Signature') ?? '';
    const msgType = request.headers.get('Twitch-Eventsub-Message-Type') ?? '';

    const expected = 'sha256=' + (await hmacHex(eventsubSecret(env), id + ts + raw));
    if (!sig || !safeEqual(sig, expected)) {
      return new Response('invalid signature', { status: 403 });
    }

    const body = JSON.parse(raw || '{}');

    if (msgType === 'webhook_callback_verification') {
      return new Response(body.challenge ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    if (msgType === 'revocation') {
      console.warn('[EventSub] subscription revoked:', body.subscription?.type, body.subscription?.status);
      const work = handleRevocation(supabase, body.subscription).catch((e) =>
        console.error('[EventSub] revocation cleanup error:', e),
      );
      if (ctx) ctx.waitUntil(work);
      else await work;
      return new Response('', { status: 204 });
    }
    if (msgType === 'notification' && body.subscription?.type === REDEMPTION_ADD) {
      const e = body.event ?? {};
      const work = grantChannelPointCard(supabase, env, {
        broadcasterTwitchId: String(e.broadcaster_user_id ?? ''),
        rewardId: String(e.reward?.id ?? ''),
        userTwitchId: String(e.user_id ?? ''),
        userName: e.user_name,
        redemptionId: String(e.id ?? ''),
      });
      if (ctx) ctx.waitUntil(work.then(() => undefined));
      else await work;
    } else if (msgType === 'notification' && body.subscription?.type === CHAT_MESSAGE) {
      const e = body.event ?? {};
      const text = String(e.message?.text ?? '').trim();
      const jobs: Promise<unknown>[] = [];
      if (/^!bingo\b/i.test(text)) {
        jobs.push(
          grantChatCard(supabase, env, {
            broadcasterTwitchId: String(e.broadcaster_user_id ?? ''),
            userTwitchId: String(e.chatter_user_id ?? ''),
            userName: e.chatter_user_name,
          }),
        );
      }
      // Full chat pipeline (commands / moderation / loyalty / timer counter).
      const ev = parseChatEvent(e);
      if (ev) {
        jobs.push(processChatMessage(env, ev).catch((err) => console.error('[chat] pipeline error:', err)));
      }
      // ACK to Twitch immediately; processing continues past the response.
      // (Twitch retries on slow/failed ACKs, which would double-run commands.)
      const all = Promise.allSettled(jobs).then(() => undefined);
      if (ctx) ctx.waitUntil(all);
      else await all;
    } else if (msgType === 'notification' && body.subscription?.type === 'stream.online') {
      const work = announceGoLive(env, supabase, body.event ?? {}).catch((err) =>
        console.error('[discord] go-live error:', err),
      );
      if (ctx) ctx.waitUntil(work);
      else await work;
    } else if (msgType === 'notification' && EVENTSUB_TO_ALERT[body.subscription?.type]) {
      // The Herald: follow / sub / resub / cheer / raid → alertbox + event feed.
      const work = processAlertNotification(env, supabase, body.subscription.type, body.event ?? {}).catch(
        (err) => console.error('[alerts] notification error:', err),
      );
      if (ctx) ctx.waitUntil(work);
      else await work;
    }
    return new Response('', { status: 204 });
  }

  // --- Dev simulator (no public URL needed) ---
  if (path === '/api/eventsub/simulate' && method === 'POST') {
    if (env.ENVIRONMENT !== 'development') return error('Not found', 404, request, env);
    const b = (await request.json().catch(() => ({}))) as any;
    if (!b.broadcasterTwitchId || !b.rewardId || !b.userTwitchId) {
      return error('broadcasterTwitchId, rewardId, userTwitchId required', 400, request, env);
    }
    const result = await grantChannelPointCard(supabase, env, {
      broadcasterTwitchId: String(b.broadcasterTwitchId),
      rewardId: String(b.rewardId),
      userTwitchId: String(b.userTwitchId),
      userName: b.userName,
      redemptionId: b.redemptionId ?? `sim-${crypto.randomUUID()}`,
    });
    return json(result, request, env);
  }

  // --- Dev simulator for the !bingo chat command (no public URL needed) ---
  if (path === '/api/eventsub/simulate-chat' && method === 'POST') {
    if (env.ENVIRONMENT !== 'development') return error('Not found', 404, request, env);
    const b = (await request.json().catch(() => ({}))) as any;
    if (!b.broadcasterTwitchId || !b.userTwitchId) {
      return error('broadcasterTwitchId, userTwitchId required', 400, request, env);
    }
    const text = String(b.text ?? '!bingo').trim();
    if (/^!bingo\b/i.test(text)) {
      const result = await grantChatCard(supabase, env, {
        broadcasterTwitchId: String(b.broadcasterTwitchId),
        userTwitchId: String(b.userTwitchId),
        userName: b.userName,
      });
      return json(result, request, env);
    }
    // Any other message runs the full chat pipeline (commands/moderation/XP).
    const ev = parseChatEvent({
      broadcaster_user_id: b.broadcasterTwitchId,
      broadcaster_user_login: b.broadcasterLogin ?? '',
      chatter_user_id: b.userTwitchId,
      chatter_user_login: (b.userName ?? 'tester').toLowerCase(),
      chatter_user_name: b.userName ?? 'tester',
      message_id: `sim-${crypto.randomUUID()}`,
      message: { text },
      badges: Array.isArray(b.badges) ? b.badges.map((s: string) => ({ set_id: s })) : [],
    });
    if (!ev) return error('invalid message', 400, request, env);
    await processChatMessage(env, ev);
    return json({ processed: true }, request, env);
  }

  return null;
}
