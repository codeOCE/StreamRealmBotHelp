import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from './supabase';
import { encryptSensitive, decryptSensitive, encryptionKeySecret } from './crypto';
import { refreshUserToken, type TwitchTokenResponse } from './twitch';

/**
 * The dedicated platform bot account ("CreatorCastleBot").
 *
 * One shared bot posts to every connected channel (Nightbot/StreamElements
 * model). Its user token lives in the singleton `bot.platform_bot` row. Sending
 * uses Helix POST /chat/messages with sender_id = the bot and broadcaster_id =
 * the channel, which works because creators grant `channel:bot` at login.
 *
 * Token is refreshed on read (single global token; refresh races are rare and
 * Twitch tolerates them).
 */

export interface BotCreds {
  token: string;
  botUserId: string;
  username: string;
}

/** Persist the bot account's token (called from the /auth/bot callback). */
export async function storePlatformBot(
  env: Env,
  supabase: SupabaseClient,
  botUser: { id: string; display_name: string },
  tokenData: TwitchTokenResponse,
  scope: string | null,
): Promise<void> {
  const key = encryptionKeySecret(env);
  const encAccess = await encryptSensitive(tokenData.access_token!, key);
  const encRefresh = tokenData.refresh_token ? await encryptSensitive(tokenData.refresh_token, key) : null;
  const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null;

  await botSchema(supabase).from('platform_bot').upsert(
    {
      id: true,
      bot_user_id: botUser.id,
      bot_username: botUser.display_name,
      encrypted_access_token: encAccess,
      encrypted_refresh_token: encRefresh,
      token_scope: scope,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  botCredsCache = null; // new token on record — drop any cached creds for the old one
}

// Warm-isolate cache: one shared bot account posts for every channel, and
// `say()` calls this on every single chat reply. Without a cache that's a
// Supabase round trip + AES decrypt per message just to find out who's
// sending — mirrors the appTokenCache pattern in lib/twitch.ts.
let botCredsCache: { creds: BotCreds; expiresAt: number } | null = null;

/**
 * Get the bot's valid (decrypted, refreshed-if-needed) credentials, or null when
 * no bot account is connected. Callers fall back to posting as the broadcaster.
 */
export async function getPlatformBotCreds(env: Env, supabase: SupabaseClient): Promise<BotCreds | null> {
  if (botCredsCache && botCredsCache.expiresAt > Date.now() + 60_000) {
    return botCredsCache.creds;
  }

  const { data } = await botSchema(supabase)
    .from('platform_bot')
    .select('bot_user_id, bot_username, encrypted_access_token, encrypted_refresh_token, token_expires_at')
    .eq('id', true)
    .maybeSingle();
  if (!data?.encrypted_access_token) {
    botCredsCache = null;
    return null;
  }

  const key = encryptionKeySecret(env);
  let token = await decryptSensitive(data.encrypted_access_token, key);
  let expiresAt = data.token_expires_at ? new Date(data.token_expires_at).getTime() : 0;

  if (expiresAt && expiresAt < Date.now() + 60_000 && data.encrypted_refresh_token) {
    const refreshTok = await decryptSensitive(data.encrypted_refresh_token, key);
    const refreshed = await refreshUserToken(env, refreshTok);
    if (refreshed?.access_token) {
      token = refreshed.access_token;
      const encAccess = await encryptSensitive(refreshed.access_token, key);
      const encRefresh = refreshed.refresh_token
        ? await encryptSensitive(refreshed.refresh_token, key)
        : data.encrypted_refresh_token;
      expiresAt = refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : 0;
      await botSchema(supabase)
        .from('platform_bot')
        .update({
          encrypted_access_token: encAccess,
          encrypted_refresh_token: encRefresh,
          token_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', true);
    }
  }

  const creds: BotCreds = { token, botUserId: data.bot_user_id, username: data.bot_username };
  // No reliable expiry on record (shouldn't happen) — cache briefly rather
  // than not at all, and re-check rather than caching forever.
  botCredsCache = { creds, expiresAt: expiresAt || Date.now() + 5 * 60_000 };
  return creds;
}

/** Lightweight status for the dashboard (no token material). */
export async function getPlatformBotStatus(supabase: SupabaseClient): Promise<{ connected: boolean; username: string | null }> {
  const { data } = await botSchema(supabase)
    .from('platform_bot')
    .select('bot_username')
    .eq('id', true)
    .maybeSingle();
  return { connected: !!data, username: data?.bot_username ?? null };
}
