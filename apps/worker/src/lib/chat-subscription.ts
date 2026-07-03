import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from './supabase';
import { getCreatorCreds } from '../token-do';
import { getAppAccessToken, createEventSubSubscription, deleteEventSubSubscription } from './twitch';
import { eventsubSecret } from '../routes/eventsub';

/**
 * The per-streamer `channel.chat.message` EventSub subscription — the bot's
 * "join channel". One subscription feeds the whole chat pipeline (commands,
 * moderation, loyalty, !bingo), so bot connect and bingo's chat-command toggle
 * manage the SAME bot.eventsub_subscriptions row (type channel.chat.message).
 */

export const CHAT_MESSAGE_TYPE = 'channel.chat.message';

export interface ChatSubResult {
  ok: boolean;
  reason?: string;
}

/** Whether the streamer currently has a chat subscription registered. */
export async function chatSubscriptionActive(supabase: SupabaseClient, streamerId: string): Promise<boolean> {
  const { data } = await botSchema(supabase)
    .from('eventsub_subscriptions')
    .select('id')
    .eq('streamer_id', streamerId)
    .eq('type', CHAT_MESSAGE_TYPE)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Create (or recreate) the streamer's chat subscription. Replaces any existing
 * one so a stale/revoked sub can't shadow a fresh one.
 */
export async function ensureChatSubscription(
  env: Env,
  supabase: SupabaseClient,
  streamerId: string,
  requestOrigin: string,
): Promise<ChatSubResult> {
  const creds = await getCreatorCreds(env, streamerId);
  if (!creds) return { ok: false, reason: 'Reconnect Twitch first' };
  const appToken = await getAppAccessToken(env);
  if (!appToken) return { ok: false, reason: 'Could not obtain Twitch app token' };

  await removeChatSubscription(env, supabase, streamerId);

  const origin = env.PUBLIC_WORKER_URL || requestOrigin;
  const secret = eventsubSecret(env);
  const subId = await createEventSubSubscription(env, appToken, {
    type: CHAT_MESSAGE_TYPE,
    version: '1',
    // user_id = whose token authorizes reading the chat — the creator's own
    // account (scopes user:read:chat + channel:bot from login).
    condition: { broadcaster_user_id: creds.broadcasterId, user_id: creds.broadcasterId },
    callback: `${origin}/api/eventsub/callback`,
    secret,
  });
  const bot = botSchema(supabase);
  await bot.from('eventsub_subscriptions').insert({
    streamer_id: streamerId,
    type: CHAT_MESSAGE_TYPE,
    reward_id: null,
    twitch_sub_id: subId,
    secret,
    status: subId ? 'pending' : 'failed',
  });
  if (!subId) return { ok: false, reason: 'Twitch rejected the subscription' };
  return { ok: true };
}

/** Delete the streamer's chat subscription on Twitch and locally (best-effort). */
export async function removeChatSubscription(env: Env, supabase: SupabaseClient, streamerId: string): Promise<void> {
  const bot = botSchema(supabase);
  const appToken = await getAppAccessToken(env);
  const { data: rows } = await bot
    .from('eventsub_subscriptions')
    .select('twitch_sub_id')
    .eq('streamer_id', streamerId)
    .eq('type', CHAT_MESSAGE_TYPE);
  for (const r of (rows ?? []) as { twitch_sub_id: string | null }[]) {
    if (appToken && r.twitch_sub_id) await deleteEventSubSubscription(env, appToken, r.twitch_sub_id);
  }
  await bot.from('eventsub_subscriptions').delete().eq('streamer_id', streamerId).eq('type', CHAT_MESSAGE_TYPE);
}
