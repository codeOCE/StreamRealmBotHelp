import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { error, json } from '../lib/response';
import {
  chatSubscriptionActive,
  ensureChatSubscription,
  removeChatSubscription,
} from '../lib/chat-subscription';
import { ensureAlertSubscriptions, removeAlertSubscriptions } from '../lib/alert-subscription';
import { getPlatformBotStatus } from '../lib/platform-bot';

/**
 * Bot lifecycle — the "connect the bot to my channel" actions the integrations
 * page calls. In the serverless model there is no IRC process to start: joining
 * a channel = creating the channel.chat.message EventSub subscription that
 * feeds the chat pipeline (see chat/pipeline.ts), leaving = deleting it.
 *
 * Routes (under /api/integrations/bot — path kept for web compat):
 *   GET  /status   { connected }
 *   POST /join     subscribe chat + mark tenant connected
 *   POST /leave    unsubscribe + mark disconnected
 *   POST /unlink   leave + forget the dedicated bot-account tokens
 */
export async function handleBot(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response | null> {
  const seg = path.slice('/api/integrations/bot'.length).replace(/^\//, '').split('/').filter(Boolean);
  const action = seg[0];
  if (!['status', 'join', 'leave', 'unlink'].includes(action ?? '')) return null;

  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const streamerId = user.id;
  const bot = botSchema(supabase);

  if (method === 'GET' && action === 'status') {
    const [connected, platformBot, subs] = await Promise.all([
      chatSubscriptionActive(supabase, streamerId),
      getPlatformBotStatus(supabase),
      bot.from('eventsub_subscriptions').select('type, status').eq('streamer_id', streamerId),
    ]);
    const subscriptions = (subs.data ?? []) as { type: string; status: string }[];
    return json(
      {
        connected,
        // Which event subscriptions exist and their Twitch status (control panel).
        subscriptions,
        // The dedicated bot account ("CreatorCastleBot") that posts to chat.
        platformBot,
      },
      request,
      env,
    );
  }
  if (method !== 'POST') return error('Method not allowed', 405, request, env);

  if (action === 'join') {
    const origin = new URL(request.url).origin;
    const result = await ensureChatSubscription(env, supabase, streamerId, origin);
    if (!result.ok) return error(result.reason ?? 'Could not connect the bot', 400, request, env);
    await bot
      .from('tenants')
      .update({ is_connected: true, updated_at: new Date().toISOString() })
      .eq('streamer_id', streamerId);
    await bot
      .from('onboarding')
      .upsert({ streamer_id: streamerId, has_linked_bot: true }, { onConflict: 'streamer_id' });
    // The Herald: subscribe to follow/sub/cheer/raid so the alertbox lights up.
    await ensureAlertSubscriptions(env, supabase, streamerId, origin).catch(() => undefined);
    return json({ message: 'Bot connected — it now sees and responds to your chat.' }, request, env);
  }

  if (action === 'leave') {
    await removeChatSubscription(env, supabase, streamerId);
    await removeAlertSubscriptions(env, supabase, streamerId).catch(() => undefined);
    await bot
      .from('tenants')
      .update({ is_connected: false, updated_at: new Date().toISOString() })
      .eq('streamer_id', streamerId);
    return json({ message: 'Bot disconnected from your channel.' }, request, env);
  }

  if (action === 'unlink') {
    await removeChatSubscription(env, supabase, streamerId);
    await removeAlertSubscriptions(env, supabase, streamerId).catch(() => undefined);
    await bot
      .from('tenants')
      .update({
        is_connected: false,
        encrypted_bot_access_token: null,
        encrypted_bot_refresh_token: null,
        bot_username: null,
        updated_at: new Date().toISOString(),
      })
      .eq('streamer_id', streamerId);
    return json({ message: 'Bot account unlinked.' }, request, env);
  }

  return error('Method not allowed', 405, request, env);
}
