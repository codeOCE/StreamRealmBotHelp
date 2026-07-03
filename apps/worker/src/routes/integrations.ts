import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { getCreatorToken } from '../lib/creator-chat';
import { getAppAccessToken, getUsersByLogin } from '../lib/twitch';
import { isValidWebhookUrl } from '../lib/discord';
import { SPOTIFY_SCOPES } from '../lib/spotify';
import { encryptSensitive, decryptSensitive, encryptionKeySecret } from '../lib/crypto';
import { getCookie, isSecureRequest, serializeCookie } from '../lib/cookies';
import { error, json } from '../lib/response';

/**
 * External-bot integrations (Nightbot / StreamElements command import) — ported
 * from the NestJS IntegrationsController + ExternalBotService. Provider tokens
 * are stored encrypted under bot.tenants.settings.{nightbot,streamelements}.
 * The bot-connect (join/leave chat) actions are bot-runtime and remain on NestJS.
 *
 * Routes:
 *   GET  /api/integrations                       connection status { settings }
 *   POST /api/integrations/streamelements/connect    { jwtToken }
 *   GET  /api/integrations/streamelements/import     -> { commands }
 *   POST /api/integrations/streamelements/disconnect
 *   GET  /api/integrations/nightbot/import           -> { commands }
 *   GET  /api/auth/nightbot                       OAuth start (popup)
 *   GET  /api/auth/nightbot/callback              OAuth callback (stores token)
 *   POST /api/auth/nightbot/disconnect
 */

const NB_STATE_COOKIE = 'nightbot_oauth_state';
const SP_STATE_COOKIE = 'spotify_oauth_state';

async function getSettings(bot: ReturnType<typeof botSchema>, streamerId: string): Promise<Record<string, any>> {
  const { data } = await bot.from('tenants').select('settings').eq('streamer_id', streamerId).maybeSingle();
  return (data?.settings ?? {}) as Record<string, any>;
}
async function saveSettings(bot: ReturnType<typeof botSchema>, streamerId: string, settings: Record<string, any>) {
  await bot.from('tenants').update({ settings, updated_at: new Date().toISOString() }).eq('streamer_id', streamerId);
}

function mapNightbotLevel(level: string): string {
  return (level || '').toLowerCase() === 'everyone' ? 'viewer' : (level || 'viewer');
}
function mapSeLevel(accessLevel: number): string {
  if (accessLevel >= 1000) return 'broadcaster';
  if (accessLevel >= 500) return 'moderator';
  if (accessLevel >= 100) return 'subscriber';
  return 'viewer';
}

/**
 * Backfill follower-growth history from Twitch into event_logs for the 12-month
 * window. Reused by the manual import route and the auto-import on login.
 * Idempotent via data.source ('twitch-backfill'). Returns rows written.
 */
export async function importTwitchFollowers(
  bot: ReturnType<typeof botSchema>,
  env: Env,
  streamerId: string,
  token: string,
  broadcasterId: string,
): Promise<number> {
  const since = new Date();
  since.setMonth(since.getMonth() - 12);
  since.setHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const rows: Record<string, unknown>[] = [];
  let cursor = '';
  for (let i = 0; i < 300; i++) {
    const u = `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&first=100${cursor ? `&after=${cursor}` : ''}`;
    const r = await fetch(u, { headers: { 'Client-Id': env.TWITCH_CLIENT_ID || '', Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`followers ${r.status}`);
    const body = (await r.json()) as any;
    const data: any[] = body.data ?? [];
    let pastWindow = false;
    for (const f of data) {
      if (f.followed_at && new Date(f.followed_at) < since) { pastWindow = true; continue; }
      rows.push({
        streamer_id: streamerId,
        type: 'follow',
        timestamp: f.followed_at,
        data: { source: 'twitch-backfill', user_id: f.user_id, username: f.user_name },
      });
    }
    cursor = body.pagination?.cursor ?? '';
    if (!cursor || data.length === 0 || pastWindow) break; // desc order: stop once past the window
  }

  await bot.from('event_logs').delete().eq('streamer_id', streamerId).eq('data->>source', 'twitch-backfill').gte('timestamp', sinceIso);
  const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  for (const c of chunk(rows, 500)) if (c.length) await bot.from('event_logs').insert(c);
  return rows.length;
}

export async function handleIntegrations(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response> {
  const url = new URL(request.url);
  const bot = botSchema(supabase);
  const encKey = encryptionKeySecret(env);

  // ---- Nightbot OAuth callback (no body; uses state cookie + session) ----
  if (path === '/api/auth/nightbot/callback' && method === 'GET') {
    const user = await getUserFromSession(request, env, supabase);
    if (!user) return new Response('Not authenticated', { status: 401 });
    if (!env.NIGHTBOT_CLIENT_ID || !env.NIGHTBOT_CLIENT_SECRET) return new Response('Nightbot not configured', { status: 503 });

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookieState = getCookie(request, NB_STATE_COOKIE);
    if (!code || !state || state !== cookieState) return new Response('Invalid state', { status: 400 });

    const redirectUri = `${url.origin}/api/auth/nightbot/callback`;
    const tokenResp = await fetch('https://api.nightbot.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.NIGHTBOT_CLIENT_ID,
        client_secret: env.NIGHTBOT_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    const data = (await tokenResp.json()) as any;
    if (!data.access_token) return new Response('Nightbot auth failed', { status: 401 });

    const settings = await getSettings(bot, user.id);
    settings.nightbot = {
      accessToken: await encryptSensitive(data.access_token, encKey),
      refreshToken: data.refresh_token ? await encryptSensitive(data.refresh_token, encKey) : null,
      connectedAt: new Date().toISOString(),
    };
    await saveSettings(bot, user.id, settings);
    // Popup: close itself; the opener polls for close then re-checks status.
    return new Response('<!doctype html><script>window.close()</script>Connected. You can close this window.', {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // ---- Spotify OAuth callback (song requests) ----
  if (path === '/api/auth/spotify/callback' && method === 'GET') {
    const user = await getUserFromSession(request, env, supabase);
    if (!user) return new Response('Not authenticated', { status: 401 });
    if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return new Response('Spotify not configured', { status: 503 });

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookieState = getCookie(request, SP_STATE_COOKIE);
    if (!code || !state || state !== cookieState) return new Response('Invalid state', { status: 400 });

    const redirectUri = `${url.origin}/api/auth/spotify/callback`;
    const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`),
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    });
    const data = (await tokenResp.json()) as any;
    if (!data.access_token) return new Response('Spotify auth failed', { status: 401 });

    const settings = await getSettings(bot, user.id);
    settings.spotify = {
      ...(settings.spotify ?? {}),
      accessToken: await encryptSensitive(data.access_token, encKey),
      refreshToken: data.refresh_token ? await encryptSensitive(data.refresh_token, encKey) : settings.spotify?.refreshToken ?? null,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
      connectedAt: new Date().toISOString(),
    };
    await saveSettings(bot, user.id, settings);
    return new Response('<!doctype html><script>window.close()</script>Connected. You can close this window.', {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // ---- Spotify OAuth start ----
  if (path === '/api/auth/spotify' && method === 'GET') {
    const user = await getUserFromSession(request, env, supabase);
    if (!user) return new Response('Not authenticated', { status: 401 });
    if (!env.SPOTIFY_CLIENT_ID) return new Response('Spotify not configured', { status: 503 });

    const state = crypto.randomUUID();
    const redirectUri = `${url.origin}/api/auth/spotify/callback`;
    const authUrl =
      `https://accounts.spotify.com/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(env.SPOTIFY_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(SPOTIFY_SCOPES)}&state=${state}`;
    const headers = new Headers({ Location: authUrl });
    headers.append(
      'Set-Cookie',
      serializeCookie(SP_STATE_COOKIE, state, { path: '/', httpOnly: true, sameSite: 'Lax', secure: isSecureRequest(request), maxAge: 600 }),
    );
    return new Response(null, { status: 302, headers });
  }

  // ---- Nightbot OAuth start ----
  if (path === '/api/auth/nightbot' && method === 'GET') {
    const user = await getUserFromSession(request, env, supabase);
    if (!user) return new Response('Not authenticated', { status: 401 });
    if (!env.NIGHTBOT_CLIENT_ID) return new Response('Nightbot not configured', { status: 503 });

    const state = crypto.randomUUID();
    const redirectUri = `${url.origin}/api/auth/nightbot/callback`;
    const authUrl =
      `https://api.nightbot.tv/oauth2/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(env.NIGHTBOT_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent('commands timers')}&state=${state}`;
    const headers = new Headers({ Location: authUrl });
    headers.append(
      'Set-Cookie',
      serializeCookie(NB_STATE_COOKIE, state, { path: '/', httpOnly: true, sameSite: 'Lax', secure: isSecureRequest(request), maxAge: 600 }),
    );
    return new Response(null, { status: 302, headers });
  }

  // ---- Everything else requires auth (session-scoped) ----
  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const streamerId = user.id;

  // POST /api/auth/nightbot/disconnect
  if (path === '/api/auth/nightbot/disconnect' && method === 'POST') {
    const settings = await getSettings(bot, streamerId);
    delete settings.nightbot;
    await saveSettings(bot, streamerId, settings);
    return json({ success: true }, request, env);
  }

  // POST /api/auth/spotify/disconnect
  if (path === '/api/auth/spotify/disconnect' && method === 'POST') {
    const settings = await getSettings(bot, streamerId);
    delete settings.spotify;
    await saveSettings(bot, streamerId, settings);
    return json({ success: true }, request, env);
  }

  // POST /api/integrations/spotify { srEnabled?, srLevel? } — song request options
  if (path === '/api/integrations/spotify' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { srEnabled?: boolean; srLevel?: string };
    const settings = await getSettings(bot, streamerId);
    if (!settings.spotify?.accessToken) return json({ error: 'Spotify not connected.' }, request, env, { status: 400 });
    if (body.srEnabled !== undefined) settings.spotify.srEnabled = !!body.srEnabled;
    if (body.srLevel && ['VIEWER', 'SUBSCRIBER', 'VIP', 'MODERATOR'].includes(body.srLevel)) {
      settings.spotify.srLevel = body.srLevel;
    }
    await saveSettings(bot, streamerId, settings);
    return json({ success: true, srEnabled: settings.spotify.srEnabled !== false, srLevel: settings.spotify.srLevel ?? 'VIEWER' }, request, env);
  }

  // GET /api/integrations -> { settings } (masked tokens; page only checks presence)
  if (path === '/api/integrations' && method === 'GET') {
    const settings = await getSettings(bot, streamerId);
    const masked: Record<string, any> = {};
    if (settings.nightbot?.accessToken) masked.nightbot = { accessToken: '***', connectedAt: settings.nightbot.connectedAt };
    if (settings.streamelements?.jwtToken) masked.streamelements = { jwtToken: '***', channelId: settings.streamelements.channelId };
    if (settings.discord) masked.discord = settings.discord; // webhook URL isn't a secret to its owner
    if (settings.spotify?.accessToken) {
      masked.spotify = {
        connected: true,
        connectedAt: settings.spotify.connectedAt,
        srEnabled: settings.spotify.srEnabled !== false,
        srLevel: settings.spotify.srLevel ?? 'VIEWER',
      };
    }
    return json({ settings: masked }, request, env);
  }

  // POST /api/integrations/discord { enabled?, webhookUrl?, message? } — go-live announcements
  if (path === '/api/integrations/discord' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as {
      enabled?: boolean;
      webhookUrl?: string;
      message?: string;
    };
    const settings = await getSettings(bot, streamerId);
    const current = (settings.discord ?? {}) as Record<string, any>;
    const next = {
      enabled: body.enabled ?? current.enabled ?? false,
      webhookUrl: body.webhookUrl !== undefined ? body.webhookUrl.trim() : current.webhookUrl ?? '',
      message: body.message !== undefined ? body.message.slice(0, 500) : current.message ?? '',
    };
    if (next.enabled && !isValidWebhookUrl(next.webhookUrl)) {
      return json({ error: 'That does not look like a Discord webhook URL.' }, request, env, { status: 400 });
    }
    settings.discord = next;
    await saveSettings(bot, streamerId, settings);
    return json({ success: true, discord: next }, request, env);
  }

  // POST /api/integrations/discord/test — fire the webhook now to verify setup
  if (path === '/api/integrations/discord/test' && method === 'POST') {
    const settings = await getSettings(bot, streamerId);
    const d = (settings.discord ?? {}) as Record<string, any>;
    if (!d.webhookUrl || !isValidWebhookUrl(d.webhookUrl)) {
      return json({ error: 'Save a valid webhook URL first.' }, request, env, { status: 400 });
    }
    const res = await fetch(d.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '✅ CreatorCastle test — go-live announcements will post here.' }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    if (!res || (!res.ok && res.status !== 204)) {
      return json({ error: 'Discord rejected the webhook. Check the URL.' }, request, env, { status: 400 });
    }
    return json({ success: true }, request, env);
  }

  // POST /api/integrations/streamelements/connect { jwtToken }
  if (path === '/api/integrations/streamelements/connect' && method === 'POST') {
    const body = (await request.json()) as { jwtToken?: string };
    if (!body.jwtToken) return json({ error: 'jwtToken is required' }, request, env, { status: 400 });
    const verify = await fetch('https://api.streamelements.com/kappa/v2/channels/me', {
      headers: { Authorization: `Bearer ${body.jwtToken}` },
    });
    if (!verify.ok) return json({ error: 'Invalid StreamElements JWT token' }, request, env, { status: 400 });
    const channel = (await verify.json()) as any;
    const settings = await getSettings(bot, streamerId);
    settings.streamelements = {
      jwtToken: await encryptSensitive(body.jwtToken, encKey),
      channelId: channel._id,
      connectedAt: new Date().toISOString(),
    };
    await saveSettings(bot, streamerId, settings);
    return json({ success: true, channelId: channel._id }, request, env);
  }

  // POST /api/integrations/streamelements/disconnect
  if (path === '/api/integrations/streamelements/disconnect' && method === 'POST') {
    const settings = await getSettings(bot, streamerId);
    delete settings.streamelements;
    await saveSettings(bot, streamerId, settings);
    return json({ success: true }, request, env);
  }

  // GET /api/integrations/streamelements/import?type=commands|timers -> { commands }
  if (path === '/api/integrations/streamelements/import' && method === 'GET') {
    const settings = await getSettings(bot, streamerId);
    const se = settings.streamelements;
    if (!se?.jwtToken) return json({ error: 'StreamElements not connected. Please connect first.' }, request, env);
    const token = await decryptSensitive(se.jwtToken, encKey);
    const type = url.searchParams.get('type') || 'commands';

    if (type === 'timers') {
      const resp = await fetch(`https://api.streamelements.com/kappa/v2/bot/timers/${se.channelId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return json({ error: `StreamElements API error: ${resp.statusText}` }, request, env);
      const seTimers = (await resp.json()) as any;
      const intervalMinutes = (t: any) => t.online?.interval || t.offline?.interval || 15;
      // A SE timer can rotate multiple messages; we only support one message per
      // timer, so fan each message out into its own timer entry.
      const timers = (Array.isArray(seTimers) ? seTimers : []).flatMap((t: any) =>
        (t.messages || []).map((message: string, idx: number) => ({
          name: t.messages.length > 1 ? `${t.name} #${idx + 1}` : t.name,
          message,
          intervalSeconds: intervalMinutes(t) * 60,
          chatLines: t.chatLines || 0,
          enabled: t.enabled,
        })),
      );
      return json({ commands: timers }, request, env);
    }

    const resp = await fetch(`https://api.streamelements.com/kappa/v2/bot/commands/${se.channelId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return json({ error: `StreamElements API error: ${resp.statusText}` }, request, env);
    const raw = (await resp.json()) as any;
    const commands = Object.values(raw).map((cmd: any) => ({
      trigger: cmd.command,
      responses: [cmd.reply],
      responseType: 'SAY',
      userLevel: mapSeLevel(cmd.accessLevel),
      enabled: cmd.enabled,
      cooldown: cmd.cooldown?.global || 0,
      userCooldown: cmd.cooldown?.user || 0,
      description: 'Imported from StreamElements',
      source: 'StreamElements',
    }));
    return json({ commands }, request, env);
  }

  // GET /api/integrations/nightbot/import?type=commands|timers -> { commands }
  if (path === '/api/integrations/nightbot/import' && method === 'GET') {
    const settings = await getSettings(bot, streamerId);
    const nb = settings.nightbot;
    if (!nb?.accessToken) return json({ error: 'Nightbot not connected. Please connect first.' }, request, env);
    const token = await decryptSensitive(nb.accessToken, encKey);
    const type = url.searchParams.get('type') || 'commands';

    if (type === 'timers') {
      const resp = await fetch('https://api.nightbot.tv/1/timers', { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) return json({ error: `Nightbot API error: ${resp.statusText}` }, request, env);
      const data = (await resp.json()) as any;
      const timers = (data.timers || []).map((t: any) => ({
        name: t.name,
        message: t.message,
        intervalSeconds: (t.interval || 5) * 60,
        chatLines: t.lines || 0,
        enabled: t.enabled,
      }));
      return json({ commands: timers }, request, env);
    }

    const resp = await fetch('https://api.nightbot.tv/1/commands', { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return json({ error: `Nightbot API error: ${resp.statusText}` }, request, env);
    const data = (await resp.json()) as any;
    const commands = (data.commands || []).map((cmd: any) => ({
      trigger: cmd.name,
      responses: [cmd.message],
      responseType: 'SAY',
      userLevel: mapNightbotLevel(cmd.userLevel),
      enabled: cmd.enabled,
      cooldown: cmd.coolDown || 0,
      description: 'Imported from Nightbot',
      source: 'Nightbot',
    }));
    return json({ commands }, request, env);
  }

  // POST /api/integrations/streamelements/import-analytics
  // Backfills bot.event_logs (follow/subscribe/cheer/raid) + bot.tips from the
  // StreamElements activity feed for the dashboard's 12-month retention window.
  // Idempotent: clears only SE-sourced rows (data.source='streamelements' /
  // tips.provider='streamelements') in the window, then re-inserts — live
  // EventSub-recorded rows are never touched, and re-running can't duplicate.
  if (path === '/api/integrations/streamelements/import-analytics' && method === 'POST') {
    const settings = await getSettings(bot, streamerId);
    const se = settings.streamelements;
    if (!se?.jwtToken || !se.channelId) {
      return json({ error: 'StreamElements not connected. Connect first.' }, request, env, { status: 400 });
    }
    const token = await decryptSensitive(se.jwtToken, encKey);

    const since = new Date();
    since.setMonth(since.getMonth() - 12);
    since.setHours(0, 0, 0, 0);
    const sinceIso = since.toISOString();

    const sePage = async (kind: 'activities' | 'tips', offset: number): Promise<any[]> => {
      const u = `https://api.streamelements.com/kappa/v2/${kind}/${se.channelId}?limit=100&offset=${offset}`;
      const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`${kind} ${r.status}`);
      const body = (await r.json()) as any;
      return Array.isArray(body) ? body : (body?.docs ?? body?.data ?? []);
    };

    const TYPE_MAP: Record<string, 'follow' | 'subscribe' | 'cheer' | 'raid'> = {
      follow: 'follow', subscriber: 'subscribe', subgift: 'subscribe', cheer: 'cheer', raid: 'raid',
    };

    const eventRows: Record<string, unknown>[] = [];
    const tipRows: Record<string, unknown>[] = [];
    try {
      for (let offset = 0; offset < 10000; offset += 100) {
        const page = await sePage('activities', offset);
        for (const a of page) {
          if (a.createdAt && new Date(a.createdAt) < since) continue;
          const mapped = TYPE_MAP[String(a.type)];
          if (!mapped) continue;
          const d = a.data ?? {};
          eventRows.push({
            streamer_id: streamerId,
            type: mapped,
            timestamp: a.createdAt,
            data: { source: 'streamelements', se_id: a._id, username: d.displayName || d.username || 'Someone', amount: Number(d.amount ?? 0), tier: d.tier ?? null },
          });
        }
        const lastA = page[page.length - 1];
        if (page.length < 100 || (lastA?.createdAt && new Date(lastA.createdAt) < since)) break;
      }
      for (let offset = 0; offset < 10000; offset += 100) {
        const page = await sePage('tips', offset);
        for (const t of page) {
          if (t.createdAt && new Date(t.createdAt) < since) continue;
          const don = t.donation ?? {};
          tipRows.push({
            streamer_id: streamerId,
            donor_name: don.user?.username || don.username || 'Anonymous',
            amount_cents: Math.round(Number(don.amount ?? 0) * 100),
            currency: don.currency || 'USD',
            message: don.message || '',
            status: 'completed',
            provider: 'streamelements',
            provider_ref: t._id,
            created_at: t.createdAt,
            completed_at: t.createdAt,
          });
        }
        const lastT = page[page.length - 1];
        if (page.length < 100 || (lastT?.createdAt && new Date(lastT.createdAt) < since)) break;
      }
    } catch (e) {
      return json({ error: `StreamElements import failed: ${(e as Error).message}` }, request, env, { status: 502 });
    }

    // Idempotent replace of SE-sourced rows in the window.
    await bot.from('event_logs').delete().eq('streamer_id', streamerId).eq('data->>source', 'streamelements').gte('timestamp', sinceIso);
    await bot.from('tips').delete().eq('streamer_id', streamerId).eq('provider', 'streamelements').gte('created_at', sinceIso);

    const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
    for (const c of chunk(eventRows, 500)) if (c.length) await bot.from('event_logs').insert(c);
    for (const c of chunk(tipRows, 500)) if (c.length) await bot.from('tips').insert(c);

    return json({ success: true, events: eventRows.length, tips: tipRows.length, since: sinceIso }, request, env);
  }

  // POST /api/integrations/streamelements/import-points
  // Migrate viewers' StreamElements loyalty point balances into viewer_profiles
  // so a switching streamer's community doesn't start from zero. Points merge as
  // GREATEST(existing, imported) — idempotent, and never clobbers points already
  // earned here. Usernames are resolved to Twitch ids via batched Helix lookups.
  if (path === '/api/integrations/streamelements/import-points' && method === 'POST') {
    const settings = await getSettings(bot, streamerId);
    const se = settings.streamelements;
    if (!se?.jwtToken || !se.channelId) {
      return json({ error: 'StreamElements not connected. Connect first.' }, request, env, { status: 400 });
    }
    const token = await decryptSensitive(se.jwtToken, encKey);
    const appToken = await getAppAccessToken(env);
    if (!appToken) return json({ error: 'Twitch API unavailable. Try again.' }, request, env, { status: 502 });

    let imported = 0;
    let unresolved = 0;
    try {
      // SE points leaderboard, 100/page, capped at 10k viewers.
      for (let offset = 0; offset < 10000; offset += 100) {
        const r = await fetch(
          `https://api.streamelements.com/kappa/v2/points/${se.channelId}/top?limit=100&offset=${offset}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!r.ok) throw new Error(`points ${r.status}`);
        const body = (await r.json()) as any;
        const users: { username?: string; points?: number }[] = body?.users ?? [];
        const withPoints = users.filter((u) => u.username && Number(u.points ?? 0) > 0);
        if (!withPoints.length) break;

        const twitchUsers = await getUsersByLogin(env, appToken, withPoints.map((u) => u.username!));
        const byLogin = new Map(twitchUsers.map((u) => [u.login, u]));

        const resolved = withPoints
          .map((u) => ({ se: u, tw: byLogin.get(u.username!.toLowerCase()) }))
          .filter((x): x is { se: typeof x.se; tw: (typeof twitchUsers)[number] } => !!x.tw);
        unresolved += withPoints.length - resolved.length;

        if (resolved.length) {
          const { data: existing } = await bot
            .from('viewer_profiles')
            .select('twitch_user_id, points')
            .eq('streamer_id', streamerId)
            .in('twitch_user_id', resolved.map((x) => x.tw.id));
          const currentPoints = new Map((existing ?? []).map((p: any) => [String(p.twitch_user_id), Number(p.points ?? 0)]));

          const rows = resolved.map((x) => ({
            streamer_id: streamerId,
            twitch_user_id: x.tw.id,
            username: x.tw.display_name || x.se.username,
            points: Math.max(Number(x.se.points ?? 0), currentPoints.get(x.tw.id) ?? 0),
          }));
          const { error: upErr } = await bot
            .from('viewer_profiles')
            .upsert(rows, { onConflict: 'streamer_id,twitch_user_id' });
          if (upErr) throw new Error(upErr.message);
          imported += rows.length;
        }
        if (users.length < 100) break;
      }
    } catch (e) {
      return json({ error: `StreamElements points import failed: ${(e as Error).message}` }, request, env, { status: 502 });
    }
    return json({ success: true, imported, unresolved }, request, env);
  }

  // POST /api/integrations/twitch/import-followers
  // Backfill follower-growth history from Twitch: read each CURRENT follower's
  // followed_at (Helix /channels/followers, desc by date) and write them as
  // historical `follow` events for the 12-month window. Only retained followers
  // are recoverable (churned ones aren't listed). Idempotent via data.source.
  if (path === '/api/integrations/twitch/import-followers' && method === 'POST') {
    const creds = await getCreatorToken(supabase, env, streamerId);
    if (!creds) return json({ error: 'Twitch not connected. Log in again.' }, request, env, { status: 400 });
    try {
      const followers = await importTwitchFollowers(bot, env, streamerId, creds.token, creds.broadcasterId);
      return json({ success: true, followers }, request, env);
    } catch (e) {
      return json({ error: `Twitch follower import failed: ${(e as Error).message}` }, request, env, { status: 502 });
    }
  }

  return error('Not found', 404, request, env);
}
