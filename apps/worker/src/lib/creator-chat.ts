import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from './supabase';
import { encryptSensitive, decryptSensitive, encryptionKeySecret } from './crypto';
import { refreshUserToken } from './twitch';

/**
 * Return a valid (decrypted, refreshed-if-needed) creator access token + the
 * creator's Twitch broadcaster id, or null when the creator hasn't connected.
 * Shared by integrations that need to act as the creator on Helix (sub tier,
 * rewards, sending chat). Refreshes + re-persists the token when near expiry.
 */
export async function getCreatorToken(
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

/**
 * Send a chat message to a channel via Helix. By default posts as the
 * broadcaster (sender_id = broadcasterId); pass `senderId` to post as a
 * different account — e.g. the dedicated platform bot, which works when the
 * broadcaster granted `channel:bot`. Best-effort: returns success, never throws.
 */
export async function sendChatMessage(
  env: Env,
  creds: { token: string; broadcasterId: string; senderId?: string },
  message: string,
  replyParentMessageId?: string,
): Promise<boolean> {
  const text = message.trim().slice(0, 500);
  if (!text) return false;
  try {
    const resp = await fetch('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Client-Id': env.TWITCH_CLIENT_ID || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        broadcaster_id: creds.broadcasterId,
        sender_id: creds.senderId ?? creds.broadcasterId,
        message: text,
        ...(replyParentMessageId ? { reply_parent_message_id: replyParentMessageId } : {}),
      }),
    });
    if (!resp.ok) {
      console.error('[creator-chat] send failed:', resp.status, await resp.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[creator-chat] send error:', e);
    return false;
  }
}
