import type { Env } from '../env';

/**
 * Twitch OAuth + Helix helpers, adapted from the reference (TCG/mulistreamer-tcg).
 * CreatorCastle is a creator/streamer dashboard with its OWN Twitch app (separate
 * from the TCG), so it requests the bot/moderation scopes the product needs.
 */

/**
 * Scopes requested at login. Carried over from the NestJS app
 * (apps/api/src/auth/twitch.strategy.ts) — chat, moderation, EventSub, bot.
 */
export const TWITCH_SCOPES = [
  'user:read:email',
  'chat:read',
  'chat:edit',
  'channel:read:subscriptions',
  'channel:manage:broadcast',
  'channel:read:redemptions',
  // Manage custom channel-point rewards (bingo "extra card" reward) and read
  // their redemptions via EventSub. Adding this requires creators to re-auth.
  'channel:manage:redemptions',
  // Read chat via EventSub (channel.chat.message) to power the !bingo command.
  'user:read:chat',
  'moderator:manage:banned_users',
  // Delete single messages (moderation DELETE action) and read follower info
  // ($(followage) / !followage). Adding these requires creators to re-auth.
  'moderator:manage:chat_messages',
  'moderator:read:followers',
  // Create clips from chat (!clip built-in).
  'clips:edit',
  // Read cheers (bits) to power the Herald's cheer alert. Requires re-auth.
  'bits:read',
  'user:write:chat',
  'user:bot',
  'channel:bot',
];

/**
 * Scopes for a VIEWER login (playing bingo, claiming cards). Viewers only need
 * to prove identity, so we request none — Helix /users works with a bare user
 * token — keeping the consent screen minimal vs. the creator scope set.
 */
export const VIEWER_SCOPES: string[] = [];

/**
 * Scopes for the dedicated platform bot account ("CreatorCastleBot"). It only
 * needs to SEND chat as itself: `user:write:chat` to post via Helix and
 * `user:bot` so it can act as a bot in channels that granted `channel:bot`.
 */
export const BOT_SCOPES: string[] = ['user:read:email', 'user:write:chat', 'user:bot'];

export interface TwitchTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string[] | string;
  token_type?: string;
}

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  email?: string;
  profile_image_url?: string;
  /** Account creation time (ISO). Helix /users returns it; used by Shield Mode. */
  created_at?: string;
}

/** Build the Twitch authorize URL. `state` is an opaque CSRF nonce. */
export function buildAuthorizeUrl(
  env: Env,
  redirectUri: string,
  state: string,
  forceVerify = false,
  scopes: string[] = TWITCH_SCOPES,
): string {
  const params = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
  });
  if (forceVerify) params.set('force_verify', 'true');
  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

/** Exchange an authorization code for tokens. */
export async function exchangeCodeForToken(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<TwitchTokenResponse> {
  const resp = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID || '',
      client_secret: env.TWITCH_CLIENT_SECRET || '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const data = (await resp.json()) as TwitchTokenResponse;
  if (!resp.ok || !data.access_token) {
    console.error('[twitch] token exchange failed', resp.status, JSON.stringify(data), 'redirect_uri=', redirectUri, 'client_id=', (env.TWITCH_CLIENT_ID || '').slice(0, 6) + '…');
  }
  return data;
}

/** Fetch the authenticated user from Helix using their access token. */
export async function fetchTwitchUser(env: Env, accessToken: string): Promise<TwitchUser | null> {
  const resp = await fetch('https://api.twitch.tv/helix/users', {
    headers: { 'Client-ID': env.TWITCH_CLIENT_ID || '', Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { data?: TwitchUser[] };
  return body.data?.[0] ?? null;
}

/** Normalize a Twitch scope field to a space-delimited string for storage. */
export function scopeToString(scope: TwitchTokenResponse['scope']): string | null {
  if (Array.isArray(scope)) return scope.join(' ');
  return scope || null;
}

/**
 * Build a streamers.username slug from a display name that satisfies the shared
 * table's CHECK constraint: ^[a-zA-Z0-9_]{3,25}$.
 */
export function buildStreamerSlug(displayName: string, twitchId: string): string {
  let slug = (displayName || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (slug.length < 3) slug = `twitch${twitchId}`.replace(/[^a-z0-9_]/g, '');
  return slug.slice(0, 25);
}

/** Refresh an expired user token. Returns the new token response or null. */
export async function refreshUserToken(
  env: Env,
  refreshToken: string,
): Promise<TwitchTokenResponse | null> {
  const resp = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID || '',
      client_secret: env.TWITCH_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!resp.ok) return null;
  return (await resp.json()) as TwitchTokenResponse;
}

// ── App access token (client_credentials) — required to create EventSub subs ──
let appTokenCache: { token: string; expiresAt: number } | null = null;

/** Get (and isolate-cache) an app access token via the client_credentials grant. */
export async function getAppAccessToken(env: Env): Promise<string | null> {
  if (appTokenCache && appTokenCache.expiresAt > Date.now() + 60_000) {
    return appTokenCache.token;
  }
  const resp = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID || '',
      client_secret: env.TWITCH_CLIENT_SECRET || '',
      grant_type: 'client_credentials',
    }),
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) return null;
  appTokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return body.access_token;
}

/**
 * Look up a viewer's subscription tier to a broadcaster. Uses the broadcaster's
 * (creator's) user token, which carries channel:read:subscriptions. Returns the
 * tier string ('1000' | '2000' | '3000') or null when not subscribed.
 */
export async function getUserSubTier(
  env: Env,
  broadcasterToken: string,
  broadcasterId: string,
  userId: string,
): Promise<string | null> {
  const url = `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${broadcasterId}&user_id=${userId}`;
  const resp = await fetch(url, {
    headers: { 'Client-ID': env.TWITCH_CLIENT_ID || '', Authorization: `Bearer ${broadcasterToken}` },
  });
  if (!resp.ok) return null; // 404 = not subscribed
  const body = (await resp.json()) as { data?: { tier?: string }[] };
  return body.data?.[0]?.tier ?? null;
}

/** Create a manageable custom channel-point reward. Returns its id or null. */
export async function createCustomReward(
  env: Env,
  broadcasterToken: string,
  broadcasterId: string,
  opts: { title: string; cost: number; prompt?: string },
): Promise<string | null> {
  const resp = await fetch(
    `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${broadcasterId}`,
    {
      method: 'POST',
      headers: {
        'Client-ID': env.TWITCH_CLIENT_ID || '',
        Authorization: `Bearer ${broadcasterToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: opts.title, cost: opts.cost, prompt: opts.prompt, is_enabled: true }),
    },
  );
  if (!resp.ok) return null;
  const body = (await resp.json()) as { data?: { id?: string }[] };
  return body.data?.[0]?.id ?? null;
}

/** Delete a custom reward created by this app (best-effort). */
export async function deleteCustomReward(
  env: Env,
  broadcasterToken: string,
  broadcasterId: string,
  rewardId: string,
): Promise<void> {
  await fetch(
    `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${broadcasterId}&id=${rewardId}`,
    { method: 'DELETE', headers: { 'Client-ID': env.TWITCH_CLIENT_ID || '', Authorization: `Bearer ${broadcasterToken}` } },
  ).catch(() => undefined);
}

/**
 * Create an EventSub subscription (webhook transport). Uses an app access token.
 * Returns the subscription id or null. `secret` is used to sign webhook payloads.
 */
export async function createEventSubSubscription(
  env: Env,
  appToken: string,
  opts: { type: string; version?: string; condition: Record<string, string>; callback: string; secret: string },
): Promise<string | null> {
  const resp = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      'Client-ID': env.TWITCH_CLIENT_ID || '',
      Authorization: `Bearer ${appToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: opts.type,
      version: opts.version ?? '1',
      condition: opts.condition,
      transport: { method: 'webhook', callback: opts.callback, secret: opts.secret },
    }),
  });
  if (!resp.ok) {
    console.error('[EventSub] create failed:', resp.status, await resp.text().catch(() => ''));
    return null;
  }
  const body = (await resp.json()) as { data?: { id?: string }[] };
  return body.data?.[0]?.id ?? null;
}

/** Delete an EventSub subscription (best-effort). */
export async function deleteEventSubSubscription(env: Env, appToken: string, subId: string): Promise<void> {
  await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${subId}`, {
    method: 'DELETE',
    headers: { 'Client-ID': env.TWITCH_CLIENT_ID || '', Authorization: `Bearer ${appToken}` },
  }).catch(() => undefined);
}

// ── Helix lookups + moderation actions for the chat pipeline ─────────────────

function helixHeaders(env: Env, token: string): Record<string, string> {
  return { 'Client-ID': env.TWITCH_CLIENT_ID || '', Authorization: `Bearer ${token}` };
}

/** Channel category/title. Works with an app access token (public data). */
export async function getChannelInfo(
  env: Env,
  token: string,
  broadcasterId: string,
): Promise<{ game_name?: string; title?: string } | null> {
  const resp = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, {
    headers: helixHeaders(env, token),
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { data?: { game_name?: string; title?: string }[] };
  return body.data?.[0] ?? null;
}

/** Live stream info; null when offline. Works with an app access token. */
export async function getStreamInfo(
  env: Env,
  token: string,
  userId: string,
): Promise<{ started_at: string } | null> {
  const resp = await fetch(`https://api.twitch.tv/helix/streams?user_id=${userId}`, {
    headers: helixHeaders(env, token),
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { data?: { started_at: string }[] };
  return body.data?.[0] ?? null;
}

/** Resolve a login to a Twitch user. Works with an app access token. */
export async function getUserByLogin(env: Env, token: string, login: string): Promise<TwitchUser | null> {
  const clean = login.replace('@', '').toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(clean)) return null;
  const resp = await fetch(`https://api.twitch.tv/helix/users?login=${clean}`, {
    headers: helixHeaders(env, token),
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { data?: TwitchUser[] };
  return body.data?.[0] ?? null;
}

/** Batch login → user lookup (Helix caps at 100 logins per call). */
export async function getUsersByLogin(env: Env, token: string, logins: string[]): Promise<TwitchUser[]> {
  const clean = [...new Set(logins.map((l) => l.replace('@', '').toLowerCase()))].filter((l) =>
    /^[a-z0-9_]{1,25}$/.test(l),
  );
  const out: TwitchUser[] = [];
  for (let i = 0; i < clean.length; i += 100) {
    const qs = clean.slice(i, i + 100).map((l) => `login=${l}`).join('&');
    const resp = await fetch(`https://api.twitch.tv/helix/users?${qs}`, { headers: helixHeaders(env, token) });
    if (!resp.ok) continue;
    const body = (await resp.json()) as { data?: TwitchUser[] };
    out.push(...(body.data ?? []));
  }
  return out;
}

/**
 * When a user followed the broadcaster (ISO timestamp), or null when not
 * following. Requires the broadcaster's token with moderator:read:followers.
 */
export async function getFollowedAt(
  env: Env,
  broadcasterToken: string,
  broadcasterId: string,
  userId: string,
): Promise<string | null> {
  const resp = await fetch(
    `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&user_id=${userId}`,
    { headers: helixHeaders(env, broadcasterToken) },
  );
  if (!resp.ok) return null;
  const body = (await resp.json()) as { data?: { followed_at?: string }[] };
  return body.data?.[0]?.followed_at ?? null;
}

/**
 * Ban (no duration) or time out (duration seconds) a user, acting as the
 * broadcaster. Requires moderator:manage:banned_users on the creator token.
 */
export async function banUser(
  env: Env,
  broadcasterToken: string,
  broadcasterId: string,
  targetUserId: string,
  durationSeconds: number | null,
  reason: string,
): Promise<boolean> {
  const resp = await fetch(
    `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}`,
    {
      method: 'POST',
      headers: { ...helixHeaders(env, broadcasterToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          user_id: targetUserId,
          ...(durationSeconds ? { duration: durationSeconds } : {}),
          reason: reason.slice(0, 500),
        },
      }),
    },
  );
  if (!resp.ok) console.error('[Helix] ban/timeout failed:', resp.status, await resp.text().catch(() => ''));
  return resp.ok;
}

/**
 * Create a clip of the broadcaster's live stream. Requires clips:edit on the
 * creator token; returns the public clip URL, or null (e.g. stream offline).
 */
export async function createClip(
  env: Env,
  broadcasterToken: string,
  broadcasterId: string,
): Promise<string | null> {
  const resp = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`, {
    method: 'POST',
    headers: helixHeaders(env, broadcasterToken),
  });
  if (!resp.ok) {
    console.error('[Helix] create clip failed:', resp.status, await resp.text().catch(() => ''));
    return null;
  }
  const body = (await resp.json()) as { data?: { id?: string }[] };
  const id = body.data?.[0]?.id;
  return id ? `https://clips.twitch.tv/${id}` : null;
}

/**
 * Delete a single chat message, acting as the broadcaster. Requires
 * moderator:manage:chat_messages (newer scope — tokens issued before it was
 * added will fail; callers should fall back to a short timeout).
 */
export async function deleteChatMessage(
  env: Env,
  broadcasterToken: string,
  broadcasterId: string,
  messageId: string,
): Promise<boolean> {
  const resp = await fetch(
    `https://api.twitch.tv/helix/moderation/chat?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}&message_id=${encodeURIComponent(messageId)}`,
    { method: 'DELETE', headers: helixHeaders(env, broadcasterToken) },
  );
  return resp.ok;
}
