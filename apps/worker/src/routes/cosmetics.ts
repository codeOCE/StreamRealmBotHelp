import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { error, json, publicJson } from '../lib/response';
import { getAppAccessToken, getUserByLogin } from '../lib/twitch';

/**
 * Chat cosmetics — badges + "paints" for the CreatorCastle browser extension
 * (a 7TV-style overlay on Twitch chat). See migrations/018_cosmetics.sql.
 *
 * Streamer-scoped admin (session required):
 *   GET    /api/cosmetics                       list this channel's definitions (+ castle-wide)
 *   POST   /api/cosmetics                        create a badge/paint
 *   PATCH  /api/cosmetics/:id                    update
 *   PATCH  /api/cosmetics/:id/toggle             enable/disable
 *   DELETE /api/cosmetics/:id                    delete
 *   GET    /api/cosmetics/assignments            list manual grants
 *   POST   /api/cosmetics/assignments            grant { cosmeticId, viewerLogin }
 *   DELETE /api/cosmetics/assignments/:id        revoke a grant
 *
 * Public (NO auth — read by the extension on twitch.tv, CORS open):
 *   GET    /api/cosmetics/public/channel/:channel[?type=login|id]
 *          → { channel, cosmetics, users } for the channel. `:channel` is a
 *            Twitch login by default (resolved to the streamer via Helix), or a
 *            numeric Twitch id when type=id.
 */

const RARITY_RANK: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
const RARITIES = Object.keys(RARITY_RANK);
const SOURCES = ['manual', 'loyalty', 'tcg'];

interface CosmeticRow {
  id: string;
  streamer_id: string | null;
  kind: string;
  name: string;
  description: string;
  rarity: string;
  source: string;
  image_url: string | null;
  paint: Record<string, any>;
  requirement: Record<string, any>;
  enabled: boolean;
  sort: number;
}

/** Full shape for the dashboard (admin). */
function cosmeticToApi(c: CosmeticRow, global = false) {
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    description: c.description,
    rarity: c.rarity,
    source: c.source,
    imageUrl: c.image_url,
    paint: c.paint ?? {},
    requirement: c.requirement ?? {},
    enabled: c.enabled,
    sort: c.sort,
    global, // castle-wide (read-only for the streamer)
  };
}

/** Trimmed shape the extension renders from. */
function cosmeticToPublic(c: CosmeticRow) {
  return c.kind === 'badge'
    ? { id: c.id, kind: 'badge', name: c.name, rarity: c.rarity, imageUrl: c.image_url }
    : { id: c.id, kind: 'paint', name: c.name, rarity: c.rarity, paint: c.paint ?? {} };
}

/** Map a request body to DB columns. partial=false requires the core fields. */
function cosmeticToDb(body: Record<string, any>, partial: boolean): Record<string, any> | null {
  const out: Record<string, any> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  if (has('kind')) {
    if (body.kind !== 'badge' && body.kind !== 'paint') return null;
    out.kind = body.kind;
  }
  if (has('name')) out.name = String(body.name).slice(0, 60);
  if (has('description')) out.description = String(body.description ?? '').slice(0, 240);
  if (has('rarity')) out.rarity = RARITIES.includes(body.rarity) ? body.rarity : 'common';
  if (has('source')) out.source = SOURCES.includes(body.source) ? body.source : 'manual';
  if (has('imageUrl')) out.image_url = body.imageUrl ? String(body.imageUrl).slice(0, 500) : null;
  if (has('paint')) out.paint = typeof body.paint === 'object' && body.paint ? body.paint : {};
  if (has('requirement')) out.requirement = typeof body.requirement === 'object' && body.requirement ? body.requirement : {};
  if (has('enabled')) out.enabled = !!body.enabled;
  if (has('sort')) out.sort = Math.floor(Number(body.sort) || 0);

  if (!partial && (out.kind === undefined || !out.name)) return null;
  return out;
}

const cleanLogin = (s: unknown): string =>
  String(s ?? '').trim().replace(/^@/, '').toLowerCase();

export async function handleCosmetics(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response> {
  const bot = botSchema(supabase);
  const seg = path.slice('/api/cosmetics'.length).replace(/^\//, '').split('/').filter(Boolean);

  // ── Public channel read (no auth) ────────────────────────────────────────
  if (seg[0] === 'public' && seg[1] === 'channel' && seg[2]) {
    if (method !== 'GET') return publicJson({ error: 'Method not allowed' }, { status: 405 });
    return publicChannelCosmetics(env, supabase, decodeURIComponent(seg[2]), new URL(request.url));
  }

  // Everything below is streamer-scoped.
  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const streamerId = user.id;

  // ── Assignments (manual grants) ──────────────────────────────────────────
  if (seg[0] === 'assignments') {
    const id = seg[1];

    if (!id && method === 'GET') {
      const { data } = await bot
        .from('user_cosmetics')
        .select('id, cosmetic_id, viewer_login, viewer_twitch_id, equipped, granted_by, created_at, cosmetics(name, kind, rarity)')
        .eq('streamer_id', streamerId)
        .order('created_at', { ascending: false })
        .limit(500);
      const assignments = (data ?? []).map((a: any) => ({
        id: a.id,
        cosmeticId: a.cosmetic_id,
        cosmeticName: a.cosmetics?.name ?? '(deleted)',
        cosmeticKind: a.cosmetics?.kind ?? null,
        rarity: a.cosmetics?.rarity ?? 'common',
        viewerLogin: a.viewer_login,
        equipped: a.equipped,
        grantedBy: a.granted_by,
        createdAt: a.created_at,
      }));
      return json({ assignments }, request, env);
    }

    if (!id && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as Record<string, any>;
      const login = cleanLogin(body.viewerLogin);
      if (!body.cosmeticId || !login) return error('cosmeticId and viewerLogin are required', 400, request, env);
      if (!/^[a-z0-9_]{1,25}$/.test(login)) return error('Invalid Twitch login', 400, request, env);

      // The cosmetic must be this streamer's own or a castle-wide one.
      const { data: cos } = await bot
        .from('cosmetics')
        .select('id, streamer_id')
        .eq('id', body.cosmeticId)
        .maybeSingle();
      if (!cos || (cos.streamer_id && cos.streamer_id !== streamerId)) {
        return error('Cosmetic not found', 404, request, env);
      }

      // Best-effort: resolve the login to a numeric Twitch id for future joins.
      let viewerTwitchId: string | null = null;
      const appToken = await getAppAccessToken(env).catch(() => null);
      if (appToken) {
        const tu = await getUserByLogin(env, appToken, login).catch(() => null);
        viewerTwitchId = tu?.id ?? null;
      }

      const { data, error: insErr } = await bot
        .from('user_cosmetics')
        .insert({
          streamer_id: streamerId,
          cosmetic_id: body.cosmeticId,
          viewer_login: login,
          viewer_twitch_id: viewerTwitchId,
          granted_by: 'manual',
        })
        .select('id')
        .single();
      if (insErr) {
        return error(/duplicate key|unique/i.test(insErr.message) ? 'That viewer already has this cosmetic' : 'Could not grant cosmetic', 400, request, env);
      }
      return json({ id: data.id }, request, env, { status: 201 });
    }

    if (id && method === 'DELETE') {
      const { data } = await bot.from('user_cosmetics').delete().eq('streamer_id', streamerId).eq('id', id).select('id');
      if (!data?.length) return error('Assignment not found', 404, request, env);
      return json({ ok: true }, request, env);
    }
    return error('Method not allowed', 405, request, env);
  }

  // ── Cosmetic definitions ─────────────────────────────────────────────────
  const id = seg[0];

  if (!id && method === 'GET') {
    // The streamer's own cosmetics + castle-wide (streamer_id IS NULL) ones.
    const { data } = await bot
      .from('cosmetics')
      .select('*')
      .or(`streamer_id.eq.${streamerId},streamer_id.is.null`)
      .order('sort', { ascending: true });
    const cosmetics = (data ?? []).map((c: any) => cosmeticToApi(c as CosmeticRow, c.streamer_id == null));
    return json({ cosmetics }, request, env);
  }

  if (!id && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const row = cosmeticToDb(body, false);
    if (!row) return error('A cosmetic needs a kind (badge|paint) and a name', 400, request, env);
    if (row.kind === 'badge' && !row.image_url) return error('A badge needs an image URL', 400, request, env);
    row.streamer_id = streamerId;
    const { data, error: insErr } = await bot.from('cosmetics').insert(row).select('*').single();
    if (insErr) return error('Could not create cosmetic', 400, request, env);
    return json({ cosmetic: cosmeticToApi(data as CosmeticRow) }, request, env, { status: 201 });
  }

  if (id && method === 'PATCH' && seg[1] === 'toggle') {
    const { data: cur } = await bot.from('cosmetics').select('enabled').eq('streamer_id', streamerId).eq('id', id).maybeSingle();
    if (!cur) return error('Cosmetic not found', 404, request, env);
    const { data } = await bot
      .from('cosmetics')
      .update({ enabled: !cur.enabled, updated_at: new Date().toISOString() })
      .eq('streamer_id', streamerId).eq('id', id)
      .select('*').single();
    return json({ cosmetic: cosmeticToApi(data as CosmeticRow) }, request, env);
  }

  if (id && method === 'PATCH') {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const row = cosmeticToDb(body, true);
    if (!row || !Object.keys(row).length) return error('Nothing to update', 400, request, env);
    row.updated_at = new Date().toISOString();
    const { data } = await bot
      .from('cosmetics')
      .update(row)
      .eq('streamer_id', streamerId).eq('id', id) // can't edit castle-wide cosmetics
      .select('*').maybeSingle();
    if (!data) return error('Cosmetic not found', 404, request, env);
    return json({ cosmetic: cosmeticToApi(data as CosmeticRow) }, request, env);
  }

  if (id && method === 'DELETE') {
    const { data } = await bot.from('cosmetics').delete().eq('streamer_id', streamerId).eq('id', id).select('id');
    if (!data?.length) return error('Cosmetic not found', 404, request, env);
    return json({ ok: true }, request, env);
  }

  return error('Not found', 404, request, env);
}

/**
 * Resolve a channel (login or numeric id) to the CreatorCastle streamer, then
 * build the public cosmetics payload the extension renders from: the channel's
 * enabled definitions (+ castle-wide ones) and a per-viewer equipped map keyed
 * by lowercased Twitch login (manual grants + loyalty-level auto-grants).
 */
async function publicChannelCosmetics(
  env: Env,
  supabase: SupabaseClient,
  channel: string,
  url: URL,
): Promise<Response> {
  const bot = botSchema(supabase);
  const asId = url.searchParams.get('type') === 'id' || /^\d+$/.test(channel);

  // 1) Resolve the channel → streamers row.
  let streamer: { id: string; twitch_id: string } | null = null;
  if (asId) {
    const { data } = await supabase.from('streamers').select('id, twitch_id').eq('twitch_id', channel).maybeSingle();
    streamer = data;
  } else {
    const login = cleanLogin(channel);
    // Login → numeric id via Helix (app token), then match the streamer.
    const appToken = await getAppAccessToken(env).catch(() => null);
    if (appToken) {
      const tu = await getUserByLogin(env, appToken, login).catch(() => null);
      if (tu?.id) {
        const { data } = await supabase.from('streamers').select('id, twitch_id').eq('twitch_id', tu.id).maybeSingle();
        streamer = data;
      }
    }
    // Fallback: the streamers.username slug sometimes equals the login.
    if (!streamer) {
      const { data } = await supabase.from('streamers').select('id, twitch_id').eq('username', login).maybeSingle();
      streamer = data;
    }
  }

  // Unknown channel → empty payload (the extension simply renders nothing).
  if (!streamer) {
    return publicJson({ channel: { login: cleanLogin(channel) }, cosmetics: {}, users: {} });
  }

  // 2) Enabled definitions: the channel's own + castle-wide.
  const { data: defs } = await bot
    .from('cosmetics')
    .select('*')
    .eq('enabled', true)
    .or(`streamer_id.eq.${streamer.id},streamer_id.is.null`)
    .order('sort', { ascending: true });
  const cosmetics = (defs ?? []) as CosmeticRow[];
  const byId = new Map(cosmetics.map((c) => [c.id, c]));

  const cosmeticsOut: Record<string, ReturnType<typeof cosmeticToPublic>> = {};
  for (const c of cosmetics) cosmeticsOut[c.id] = cosmeticToPublic(c);

  // login → set of cosmetic ids the viewer should display.
  const owned = new Map<string, Set<string>>();
  const add = (login: string, cosmeticId: string) => {
    const l = login.toLowerCase();
    if (!owned.has(l)) owned.set(l, new Set());
    owned.get(l)!.add(cosmeticId);
  };

  // 3) Manual grants (equipped only) for cosmetics that still exist + are enabled.
  const { data: grants } = await bot
    .from('user_cosmetics')
    .select('cosmetic_id, viewer_login, equipped')
    .eq('streamer_id', streamer.id)
    .eq('equipped', true)
    .limit(20000);
  for (const g of grants ?? []) {
    if (byId.has((g as any).cosmetic_id)) add((g as any).viewer_login, (g as any).cosmetic_id);
  }

  // 4) Loyalty auto-grants: viewers at/above a cosmetic's requirement.minLevel.
  const loyalty = cosmetics.filter((c) => c.source === 'loyalty' && Number((c.requirement as any)?.minLevel) > 0);
  if (loyalty.length) {
    const minNeeded = Math.min(...loyalty.map((c) => Number((c.requirement as any).minLevel)));
    const { data: profiles } = await bot
      .from('viewer_profiles')
      .select('username, level')
      .eq('streamer_id', streamer.id)
      .gte('level', minNeeded)
      .limit(20000);
    for (const p of profiles ?? []) {
      const login = String((p as any).username ?? '').toLowerCase();
      if (!login) continue;
      for (const c of loyalty) {
        if (Number((p as any).level) >= Number((c.requirement as any).minLevel)) add(login, c.id);
      }
    }
  }

  // 5) Collapse to { badges: [...], paint: id } per viewer. Show every badge;
  //    pick the single highest-rarity (then highest-sort) paint.
  const users: Record<string, { badges: string[]; paint: string | null }> = {};
  for (const [login, ids] of owned) {
    const badges: string[] = [];
    let paint: CosmeticRow | null = null;
    for (const cid of ids) {
      const c = byId.get(cid);
      if (!c) continue;
      if (c.kind === 'badge') {
        badges.push(c.id);
      } else if (
        !paint ||
        RARITY_RANK[c.rarity] > RARITY_RANK[paint.rarity] ||
        (RARITY_RANK[c.rarity] === RARITY_RANK[paint.rarity] && c.sort > paint.sort)
      ) {
        paint = c;
      }
    }
    users[login] = { badges, paint: paint?.id ?? null };
  }

  return publicJson({
    channel: { login: cleanLogin(channel), id: streamer.twitch_id, streamerId: streamer.id },
    cosmetics: cosmeticsOut,
    users,
  });
}
