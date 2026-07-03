import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from './supabase';
import { getCreatorCreds } from '../token-do';
import { getAppAccessToken, createEventSubSubscription, deleteEventSubSubscription } from './twitch';
import { eventsubSecret } from '../routes/eventsub';

/**
 * The Herald's EventSub subscriptions — follow / sub / resub / cheer / raid.
 * Created alongside the chat subscription when the bot joins a channel, so the
 * alertbox lights up without any extra creator action. Stored in
 * bot.eventsub_subscriptions next to the chat sub (distinguished by `type`).
 *
 * Scope notes: follow needs moderator:read:followers, sub/resub need
 * channel:read:subscriptions, cheer needs bits:read, raid needs none. All but
 * bits:read are already in the creator scope set; cheer fails gracefully until a
 * creator re-auths with bits:read (the others still work).
 */

interface AlertSubDef {
  type: string;
  version: string;
  condition: (broadcasterId: string) => Record<string, string>;
}

export const ALERT_SUB_DEFS: readonly AlertSubDef[] = [
  { type: 'channel.follow', version: '2', condition: (b) => ({ broadcaster_user_id: b, moderator_user_id: b }) },
  { type: 'channel.subscribe', version: '1', condition: (b) => ({ broadcaster_user_id: b }) },
  { type: 'channel.subscription.gift', version: '1', condition: (b) => ({ broadcaster_user_id: b }) },
  { type: 'channel.subscription.message', version: '1', condition: (b) => ({ broadcaster_user_id: b }) },
  { type: 'channel.cheer', version: '1', condition: (b) => ({ broadcaster_user_id: b }) },
  { type: 'channel.raid', version: '1', condition: (b) => ({ to_broadcaster_user_id: b }) },
  // Not an alertbox event — powers Discord go-live announcements (no scope needed).
  { type: 'stream.online', version: '1', condition: (b) => ({ broadcaster_user_id: b }) },
];

const ALERT_TYPE_SET = new Set(ALERT_SUB_DEFS.map((d) => d.type));

export interface AlertSubResult {
  created: string[];
  failed: string[];
}

/** Create (or recreate) all Herald subscriptions for a streamer. */
export async function ensureAlertSubscriptions(
  env: Env,
  supabase: SupabaseClient,
  streamerId: string,
  requestOrigin: string,
): Promise<AlertSubResult> {
  const creds = await getCreatorCreds(env, streamerId);
  const appToken = creds ? await getAppAccessToken(env) : null;
  if (!creds || !appToken) return { created: [], failed: ALERT_SUB_DEFS.map((d) => d.type) };

  await removeAlertSubscriptions(env, supabase, streamerId);

  const origin = env.PUBLIC_WORKER_URL || requestOrigin;
  const secret = eventsubSecret(env);
  const callback = `${origin}/api/eventsub/callback`;
  const bot = botSchema(supabase);

  const created: string[] = [];
  const failed: string[] = [];
  for (const def of ALERT_SUB_DEFS) {
    const subId = await createEventSubSubscription(env, appToken, {
      type: def.type,
      version: def.version,
      condition: def.condition(creds.broadcasterId),
      callback,
      secret,
    }).catch(() => null);
    await bot.from('eventsub_subscriptions').insert({
      streamer_id: streamerId,
      type: def.type,
      reward_id: null,
      twitch_sub_id: subId,
      secret,
      status: subId ? 'pending' : 'failed',
    });
    (subId ? created : failed).push(def.type);
  }
  return { created, failed };
}

/** Delete all Herald subscriptions for a streamer (Twitch + local). */
export async function removeAlertSubscriptions(env: Env, supabase: SupabaseClient, streamerId: string): Promise<void> {
  const bot = botSchema(supabase);
  const appToken = await getAppAccessToken(env);
  const { data: rows } = await bot
    .from('eventsub_subscriptions')
    .select('twitch_sub_id, type')
    .eq('streamer_id', streamerId)
    .in('type', [...ALERT_TYPE_SET]);
  for (const r of (rows ?? []) as { twitch_sub_id: string | null; type: string }[]) {
    if (appToken && r.twitch_sub_id) await deleteEventSubSubscription(env, appToken, r.twitch_sub_id);
  }
  await bot.from('eventsub_subscriptions').delete().eq('streamer_id', streamerId).in('type', [...ALERT_TYPE_SET]);
}
