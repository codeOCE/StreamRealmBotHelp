import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { getCreatorToken } from '../lib/creator-chat';
import { error, json } from '../lib/response';

/**
 * Dashboard overview — period stats, activity feed, chart series.
 *
 *   GET /api/dashboard/overview?since=<ISO8601>
 *
 * Analytics retention: 12 months of event/tip history (rolling).
 */

/** Rolling window of stored analytics (months, including the current month). */
export const ANALYTICS_RETENTION_MONTHS = 12;

function earliestAnalyticsDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - (ANALYTICS_RETENTION_MONTHS - 1));
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseSince(raw: string | null): Date {
  const floor = earliestAnalyticsDate();
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d < floor ? floor : d;
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function emptyDailyMap(since: Date): Map<string, { tips: number; tipCount: number; follow: number; subscribe: number; cheer: number; raid: number; bits: number }> {
  const map = new Map<string, { tips: number; tipCount: number; follow: number; subscribe: number; cheer: number; raid: number; bits: number }>();
  const cursor = new Date(since);
  const end = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    map.set(dayKey(cursor.toISOString()), { tips: 0, tipCount: 0, follow: 0, subscribe: 0, cheer: 0, raid: 0, bits: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return map;
}

function formatActivity(type: string, data: Record<string, unknown>): { user: string; action: string } {
  switch (type) {
    case 'follow':
      return { user: String(data.username ?? 'Someone'), action: 'followed' };
    case 'subscribe':
      return { user: String(data.username ?? 'Someone'), action: 'subscribed' };
    case 'cheer':
      return { user: String(data.username ?? 'Someone'), action: `cheered ${Number(data.amount ?? 0)} bits` };
    case 'raid':
      return { user: String(data.username ?? 'Someone'), action: `raided with ${Number(data.amount ?? 0)} viewers` };
    case 'gift':
      return { user: String(data.username ?? 'Someone'), action: `gifted ${Number(data.amount ?? 1)} sub${Number(data.amount ?? 1) === 1 ? '' : 's'}` };
    case 'donation':
      return {
        user: String(data.donor ?? 'Anonymous'),
        action: `tipped ${((Number(data.amountCents ?? 0) / 100)).toFixed(2)} ${String(data.currency ?? 'USD')}`,
      };
    case 'stream_online':
      return { user: 'Stream', action: 'went live' };
    default:
      return { user: 'System', action: type };
  }
}

export async function handleDashboard(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response | null> {
  if (method === 'GET' && path === '/api/dashboard/stats') return handleStats(request, env, supabase);
  if (method === 'GET' && path === '/api/dashboard/categories') return handleCategories(request, env, supabase);
  if (method === 'PATCH' && path === '/api/dashboard/channel') return handleChannel(request, env, supabase);
  if (path !== '/api/dashboard/overview' || method !== 'GET') return null;

  try {
    const user = await getUserFromSession(request, env, supabase);
    if (!user) return error('Not authenticated', 401, request, env);

    const streamerId = user.id;
    const bot = botSchema(supabase);
    const url = new URL(request.url);
    const since = parseSince(url.searchParams.get('since'));
    const sinceIso = since.toISOString();

    const [{ data: tips }, { data: events }, totalRes] = await Promise.all([
    bot
      .from('tips')
      .select('amount_cents, created_at')
      .eq('streamer_id', streamerId)
      .eq('status', 'completed')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true }),
    bot
      .from('event_logs')
      .select('type, data, timestamp')
      .eq('streamer_id', streamerId)
      .gte('timestamp', sinceIso)
      .order('timestamp', { ascending: false })
      .limit(200),
    bot.rpc('tip_total', { p_streamer_id: streamerId, p_since: sinceIso }),
  ]);

  const daily = emptyDailyMap(since);
  let tipTotalCents = 0;
  let tipCount = 0;

  for (const tip of tips ?? []) {
    const cents = Number(tip.amount_cents) || 0;
    tipTotalCents += cents;
    tipCount += 1;
    const key = dayKey(tip.created_at);
    const row = daily.get(key);
    if (row) {
      row.tips += cents;
      row.tipCount += 1;
    }
  }

  const periodEvents = { follow: 0, subscribe: 0, cheer: 0, raid: 0, donation: 0 };
  let bitsTotal = 0;
  let raidViewers = 0;

  for (const ev of events ?? []) {
    const type = String(ev.type);
    if (type in periodEvents) periodEvents[type as keyof typeof periodEvents] += 1;

    const data = (ev.data ?? {}) as Record<string, unknown>;
    if (type === 'cheer') bitsTotal += Number(data.amount ?? 0);
    if (type === 'raid') raidViewers += Number(data.amount ?? 0);

    const key = dayKey(ev.timestamp);
    const row = daily.get(key);
    if (row && (type === 'follow' || type === 'subscribe' || type === 'cheer' || type === 'raid')) {
      row[type] += 1;
      if (type === 'cheer') row.bits += Number(data.amount ?? 0);
    }
  }

  const activity = (events ?? []).slice(0, 25).map((ev) => {
    const data = (ev.data ?? {}) as Record<string, unknown>;
    const { user: username, action } = formatActivity(String(ev.type), data);
    return {
      type: String(ev.type),
      user: username,
      action,
      at: ev.timestamp,
    };
  });

  const dailySeries = [...daily.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, row]) => ({
      date,
      tipsCents: row.tips,
      tipCount: row.tipCount,
      follows: row.follow,
      subs: row.subscribe,
      bits: row.bits,
      raids: row.raid,
    }));

  return json(
    {
      retentionMonths: ANALYTICS_RETENTION_MONTHS,
      oldestAvailable: earliestAnalyticsDate().toISOString(),
      tipTotalCents: Number(Array.isArray(totalRes.data) ? totalRes.data[0] : totalRes.data) || tipTotalCents,
      tipCount,
      periodEvents,
      bitsTotal,
      raidViewers,
      activity,
      dailySeries,
    },
    request,
    env,
  );
  } catch (e) {
    console.error('[Dashboard] overview failed:', e);
    return json(
      {
        retentionMonths: ANALYTICS_RETENTION_MONTHS,
        oldestAvailable: earliestAnalyticsDate().toISOString(),
        tipTotalCents: 0,
        tipCount: 0,
        periodEvents: { follow: 0, subscribe: 0, cheer: 0, raid: 0, donation: 0 },
        bitsTotal: 0,
        raidViewers: 0,
        activity: [],
        dailySeries: [],
        error: 'Overview unavailable',
      },
      request,
      env,
      { status: 200 },
    );
  }
}

/** Helix GET with the creator's token. */
function helix(env: Env, token: string, p: string): Promise<Response> {
  return fetch(`https://api.twitch.tv/helix/${p}`, {
    headers: { 'Client-Id': env.TWITCH_CLIENT_ID || '', Authorization: `Bearer ${token}` },
  });
}

/**
 * GET /api/dashboard/stats — live channel stats pulled from Helix with the
 * creator's token (followers, subs, viewers, live status, title, category).
 */
async function handleStats(request: Request, env: Env, supabase: SupabaseClient): Promise<Response> {
  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);

  const creds = await getCreatorToken(supabase, env, user.id);
  if (!creds) {
    return json(
      { followers: 0, subscribers: null, viewers: 0, isLive: false, streamTitle: null, gameName: null, channelName: user.username },
      request, env,
    );
  }
  const { token, broadcasterId } = creds;

  const [streamRes, chanRes, followRes, subRes] = await Promise.all([
    helix(env, token, `streams?user_id=${broadcasterId}`),
    helix(env, token, `channels?broadcaster_id=${broadcasterId}`),
    helix(env, token, `channels/followers?broadcaster_id=${broadcasterId}`),
    helix(env, token, `subscriptions?broadcaster_id=${broadcasterId}&first=1`),
  ]);

  const stream = streamRes.ok ? (await streamRes.json() as any).data?.[0] : null;
  const chan = chanRes.ok ? (await chanRes.json() as any).data?.[0] : null;
  const follow = followRes.ok ? (await followRes.json() as any) : null;
  const sub = subRes.ok ? (await subRes.json() as any) : null; // 401 (no scope) => subscribers null

  return json(
    {
      followers: follow?.total ?? 0,
      subscribers: sub?.total ?? null,
      viewers: stream?.viewer_count ?? 0,
      isLive: !!stream,
      streamTitle: stream?.title ?? chan?.title ?? null,
      gameName: stream?.game_name ?? chan?.game_name ?? null,
      channelName: chan?.broadcaster_name ?? user.username,
    },
    request, env,
  );
}

/** GET /api/dashboard/categories?q= — Twitch category typeahead (id, name, box art). */
async function handleCategories(request: Request, env: Env, supabase: SupabaseClient): Promise<Response> {
  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (!q) return json({ categories: [] }, request, env);

  const creds = await getCreatorToken(supabase, env, user.id);
  if (!creds) return json({ categories: [] }, request, env);

  const res = await helix(env, creds.token, `search/categories?query=${encodeURIComponent(q)}&first=8`);
  if (!res.ok) return json({ categories: [] }, request, env);
  const data = (await res.json() as any).data ?? [];
  const categories = data.map((g: any) => ({
    id: g.id,
    name: g.name,
    // Helix returns a templated URL with {width}x{height} placeholders.
    boxArt: (g.box_art_url ?? '').replace('{width}', '52').replace('{height}', '72'),
  }));
  return json({ categories }, request, env);
}

/** PATCH /api/dashboard/channel — update stream title / category on Twitch. */
async function handleChannel(request: Request, env: Env, supabase: SupabaseClient): Promise<Response> {
  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);

  const creds = await getCreatorToken(supabase, env, user.id);
  if (!creds) return json({ success: false, error: 'Twitch not connected' }, request, env, { status: 400 });
  const { token, broadcasterId } = creds;

  const body = (await request.json().catch(() => ({}))) as { title?: string; game?: string };
  const payload: Record<string, string> = {};
  if (typeof body.title === 'string') payload.title = body.title.slice(0, 140);

  if (body.game && body.game.trim()) {
    const gRes = await helix(env, token, `games?name=${encodeURIComponent(body.game.trim())}`);
    const gId = gRes.ok ? (await gRes.json() as any).data?.[0]?.id : null;
    payload.game_id = gId ?? '0'; // '0' clears the category if not found
  }
  if (!Object.keys(payload).length) return json({ success: false, error: 'Nothing to update' }, request, env, { status: 400 });

  const res = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, {
    method: 'PATCH',
    headers: { 'Client-Id': env.TWITCH_CLIENT_ID || '', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok && res.status !== 204) {
    return json({ success: false, error: 'Twitch rejected the update' }, request, env, { status: 400 });
  }
  return json({ success: true }, request, env);
}
