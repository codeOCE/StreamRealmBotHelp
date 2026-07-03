import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from './supabase';
import { broadcast } from '../realtime';

/**
 * Real Twitch alerts → the overlay alert widget.
 *
 * The overlay editor already has a fully-featured Alert widget (sandboxed
 * HTML/CSS/JS, per-event enable/duration/min-amount, live preview — see
 * apps/web/lib/alert-renderer.ts + AlertEditorModal). It only lacked REAL events;
 * before this it could only be fired by the dashboard test button. This module
 * turns Twitch EventSub follow/sub/resub/cheer/raid notifications into the same
 * `{ type, username, message, amount, tier }` shape the widget consumes and
 * broadcasts them on `overlay:<id>` (the channel the public overlay listens on),
 * for every overlay the streamer owns. Filtering + styling stay in the widget.
 */

/** EventSub subscription type → canonical overlay alert `type` (alert-renderer.ts AlertData). */
export const EVENTSUB_TO_ALERT: Record<string, 'follow' | 'subscribe' | 'cheer' | 'raid' | 'gift'> = {
  'channel.follow': 'follow',
  'channel.subscribe': 'subscribe',
  'channel.subscription.gift': 'gift',
  'channel.subscription.message': 'subscribe', // resub — same widget event, carries a message
  'channel.cheer': 'cheer',
  'channel.raid': 'raid',
};

/** Matches apps/web/lib/alert-renderer.ts `AlertData`. */
export interface OverlayAlert {
  type: 'follow' | 'subscribe' | 'cheer' | 'raid' | 'gift';
  username: string;
  message: string;
  amount: number; // bits (cheer), raiders (raid), cumulative months (resub), subs gifted (gift)
  tier: string; // '1000' | '2000' | '3000' for subs, else ''
}

/** Normalize a raw EventSub `event` payload into the overlay alert shape. */
export function buildAlert(subType: string, e: Record<string, any>): OverlayAlert | null {
  switch (subType) {
    case 'channel.follow':
      return { type: 'follow', username: e.user_name ?? e.user_login ?? 'Someone', message: '', amount: 0, tier: '' };
    case 'channel.subscribe':
      // Gift recipients also fire channel.subscribe (is_gift) — the gifter's
      // single channel.subscription.gift event is the alert; skip these so a
      // 20-sub bomb doesn't fire 20 extra alerts.
      if (e.is_gift) return null;
      return { type: 'subscribe', username: e.user_name ?? e.user_login ?? 'Someone', message: '', amount: 0, tier: String(e.tier ?? '1000') };
    case 'channel.subscription.gift':
      return {
        type: 'gift',
        username: e.is_anonymous ? 'Anonymous' : e.user_name ?? e.user_login ?? 'Someone',
        message: '',
        amount: Number(e.total ?? 1),
        tier: String(e.tier ?? '1000'),
      };
    case 'channel.subscription.message':
      return {
        type: 'subscribe',
        username: e.user_name ?? e.user_login ?? 'Someone',
        message: String(e.message?.text ?? '').slice(0, 200),
        amount: Number(e.cumulative_months ?? e.duration_months ?? 1),
        tier: String(e.tier ?? '1000'),
      };
    case 'channel.cheer':
      return {
        type: 'cheer',
        username: e.is_anonymous ? 'Anonymous' : e.user_name ?? e.user_login ?? 'Someone',
        message: String(e.message ?? '').slice(0, 200),
        amount: Number(e.bits ?? 0),
        tier: '',
      };
    case 'channel.raid':
      return {
        type: 'raid',
        username: e.from_broadcaster_user_name ?? e.from_broadcaster_user_login ?? 'Someone',
        message: '',
        amount: Number(e.viewers ?? 0),
        tier: '',
      };
    default:
      return null;
  }
}

/**
 * Handle a raw EventSub alert notification: resolve the streamer from the
 * broadcaster id (raids use the raid TARGET), normalize, and broadcast to every
 * overlay the streamer owns on `overlay:<id>`. The widget filters by its own
 * per-event config, so we forward all events and let the overlay decide.
 */
export async function processAlertNotification(
  env: Env,
  supabase: SupabaseClient,
  subType: string,
  event: Record<string, any>,
): Promise<void> {
  const alert = buildAlert(subType, event);
  if (!alert) return;

  const broadcasterTwitchId = String(
    subType === 'channel.raid' ? event.to_broadcaster_user_id ?? '' : event.broadcaster_user_id ?? '',
  );
  if (!broadcasterTwitchId) return;

  const { data: streamer } = await supabase
    .from('streamers')
    .select('id')
    .eq('twitch_id', broadcasterTwitchId)
    .maybeSingle();
  if (!streamer) return;

  const { data: overlays } = await botSchema(supabase)
    .from('overlays')
    .select('id')
    .eq('streamer_id', streamer.id);
  if (!overlays?.length) return;

  await Promise.allSettled([
    ...overlays.map((o: { id: string }) => broadcast(env, `overlay:${o.id}`, 'alert', alert)),
    botSchema(supabase)
      .from('event_logs')
      .insert({
        streamer_id: streamer.id,
        type: alert.type,
        data: {
          username: alert.username,
          message: alert.message,
          amount: alert.amount,
          tier: alert.tier,
        },
      }),
  ]);
}
