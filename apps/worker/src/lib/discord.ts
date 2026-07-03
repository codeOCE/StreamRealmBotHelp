import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from './supabase';
import { getAppAccessToken, getChannelInfo } from './twitch';

/**
 * Discord go-live announcements. When Twitch fires stream.online we POST the
 * streamer's configured Discord webhook with a rich embed. Config lives in
 * bot.tenants.settings.discord = { enabled, webhookUrl, message }.
 *
 * The message template supports {name} {title} {game} {url}.
 */

export interface DiscordSettings {
  enabled?: boolean;
  webhookUrl?: string;
  message?: string;
}

const DEFAULT_MESSAGE = '{name} is live on Twitch! {url}';

/** Discord webhook URL shape (also accepts ptb/canary hosts). */
export function isValidWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      /^((ptb|canary)\.)?discord(app)?\.com$/.test(u.hostname) &&
      /^\/api\/webhooks\/\d+\/[\w-]+$/.test(u.pathname)
    );
  } catch {
    return false;
  }
}

export function renderTemplate(
  template: string,
  vars: { name: string; title: string; game: string; url: string },
): string {
  return template
    .replace(/\{name\}/gi, vars.name)
    .replace(/\{title\}/gi, vars.title)
    .replace(/\{game\}/gi, vars.game)
    .replace(/\{url\}/gi, vars.url)
    .slice(0, 1900); // Discord content cap is 2000
}

/**
 * Handle a stream.online notification: resolve the streamer, dedupe restarts
 * within 10 minutes (via event_logs), and fire the Discord webhook.
 */
export async function announceGoLive(
  env: Env,
  supabase: SupabaseClient,
  event: Record<string, any>,
): Promise<void> {
  const broadcasterTwitchId = String(event.broadcaster_user_id ?? '');
  const login = String(event.broadcaster_user_login ?? '');
  const name = String(event.broadcaster_user_name ?? login ?? 'Streamer');
  if (!broadcasterTwitchId) return;

  const { data: streamer } = await supabase
    .from('streamers')
    .select('id')
    .eq('twitch_id', broadcasterTwitchId)
    .maybeSingle();
  if (!streamer) return;

  const bot = botSchema(supabase);
  const { data: tenant } = await bot.from('tenants').select('settings').eq('streamer_id', streamer.id).maybeSingle();
  const discord = ((tenant?.settings ?? {}) as Record<string, any>).discord as DiscordSettings | undefined;
  if (!discord?.enabled || !discord.webhookUrl || !isValidWebhookUrl(discord.webhookUrl)) return;

  // Dedupe: a stream blip re-fires stream.online; skip if we announced recently.
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: recent } = await bot
    .from('event_logs')
    .select('id')
    .eq('streamer_id', streamer.id)
    .eq('type', 'stream_online')
    .gte('timestamp', tenMinAgo)
    .limit(1);
  if (recent?.length) return;
  await bot.from('event_logs').insert({ streamer_id: streamer.id, type: 'stream_online', data: {} });

  const token = await getAppAccessToken(env);
  const chan = token ? await getChannelInfo(env, token, broadcasterTwitchId).catch(() => null) : null;
  const title = chan?.title || 'Live now!';
  const game = chan?.game_name || '';
  const url = `https://twitch.tv/${login}`;

  const content = renderTemplate(discord.message || DEFAULT_MESSAGE, { name, title, game, url });
  await fetch(discord.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      embeds: [
        {
          title: title.slice(0, 256),
          url,
          description: game ? `Playing **${game}**` : undefined,
          color: 0x3faaff,
          timestamp: new Date().toISOString(),
        },
      ],
      allowed_mentions: { parse: ['everyone', 'roles', 'users'] },
    }),
    signal: AbortSignal.timeout(5000),
  }).catch((e) => console.error('[discord] webhook failed:', e));
}
