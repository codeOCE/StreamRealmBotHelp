import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { error, json, publicJson } from '../lib/response';
import { getAppAccessToken, getUserByLogin } from '../lib/twitch';
import { uploadPublic, removeObject, safeExt } from '../lib/storage';
import { SIZES, variantPath } from './emote-cdn';
import { buildEmoteMap, isValidEmoteCode, type EmoteRow, type PublicEmote } from '../chat/emotes';

/**
 * Custom chat emotes — the 7TV/BTTV-style emote platform. Creators upload emote
 * images with a text code; anyone typing the code in the channel sees the image
 * in real Twitch chat (browser extension) and in CreatorCastle overlays.
 *   See migrations/037_emotes.sql + chat/emotes.ts + apps/extension.
 *
 * Streamer-scoped (session required):
 *   GET    /api/emotes                 my channel's emote set (own + added)
 *   POST   /api/emotes                 create — multipart {file,code,width} OR json {code,imageUrl,width}
 *   PATCH  /api/emotes/:id             update (code, width, visibility → submit to directory)
 *   DELETE /api/emotes/:id             delete an own emote (+ storage)
 *   GET    /api/emotes/directory?q=    browse APPROVED public emotes from other channels
 *   POST   /api/emotes/:id/add         add a public emote to my channel
 *   DELETE /api/emotes/:id/add         remove an added emote from my channel
 *
 * Platform admin (PLATFORM_ADMIN_IDS — comma-separated Twitch ids):
 *   GET    /api/emotes/pending         emotes awaiting directory approval
 *   POST   /api/emotes/:id/approve
 *   POST   /api/emotes/:id/reject
 *
 * Public (NO auth — CORS open, cacheable):
 *   GET    /api/emotes/public/channel/:channel[?type=login|id]
 *          → { channel, emotes: { CODE: { url, w, animated } } }   (read by the extension)
 *   GET    /api/emotes/public/directory?q=&tag=&animated=&overlaying=&exact=&sort=&page=
 *          sort: new | name | top (most channels) | trending (most adds, 14d)
 *          → { emotes: [...], total, page }   (the emotes.creatorcastle.gg vault browse)
 *   GET    /api/emotes/public/emote/:id
 *          → { emote: {...}, related: [...] }   (an individual emote's SEO detail page)
 *   GET    /api/emotes/public/user/:name
 *          → { user: {...}, emotes: [...] }   (a creator's public vault profile)
 */

const MAX_OWN_EMOTES = 300;
/**
 * Branded emote CDN origin — the 7TV cdn.7tv.app equivalent. Overridable via
 * EMOTE_CDN_URL so the host can move to a dedicated subdomain later without
 * touching any code; rows written before the move keep resolving either way,
 * since the worker answers /emote/:id/:size on whatever host reaches it.
 */
const emoteCdn = (env: Env) => String(env.EMOTE_CDN_URL ?? env.PUBLIC_WORKER_URL ?? 'https://api.creatorcastle.gg');
const ALLOWED_IMG = ['png', 'gif', 'webp', 'apng', 'jpg', 'jpeg', 'avif'];

function isPlatformAdmin(env: Env, twitchId: string): boolean {
  const ids = String(env.PLATFORM_ADMIN_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(twitchId);
}

/** Drop an emote's original file and every size variant beside it. */
async function removeEmoteObjects(supabase: SupabaseClient, storagePath: string): Promise<void> {
  await Promise.all([
    removeObject(supabase, storagePath),
    ...SIZES.map((s) => removeObject(supabase, variantPath(storagePath, s))),
  ]);
}

const cleanLogin = (s: unknown): string => String(s ?? '').trim().replace(/^@/, '').toLowerCase();

/** DB row → dashboard shape (the owner's own emote). */
function emoteToApi(e: any) {
  return {
    id: e.id,
    code: e.code,
    imageUrl: e.image_url,
    width: e.width,
    animated: e.animated,
    zeroWidth: !!e.zero_width,
    tags: Array.isArray(e.tags) ? e.tags : [],
    visibility: e.visibility,
    status: e.status,
    owned: true,
  };
}

/** Normalize free-form tag input (array or comma string) to ≤10 clean tags. */
function cleanTags(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : String(v ?? '').split(',');
  const seen = new Set<string>();
  for (const t of raw) {
    const s = String(t).trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20);
    if (s) seen.add(s);
    if (seen.size >= 10) break;
  }
  return [...seen];
}

export async function handleEmotes(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response> {
  const bot = botSchema(supabase);
  const seg = path.slice('/api/emotes'.length).replace(/^\//, '').split('/').filter(Boolean);

  // ── Public channel read (no auth) ────────────────────────────────────────
  if (seg[0] === 'public' && seg[1] === 'channel' && seg[2]) {
    if (method !== 'GET') return publicJson({ error: 'Method not allowed' }, { status: 405 });
    return publicChannelEmotes(env, supabase, decodeURIComponent(seg[2]), new URL(request.url));
  }

  // ── Public vault directory + emote detail (no auth) ──────────────────────
  if (seg[0] === 'public' && seg[1] === 'directory') {
    if (method !== 'GET') return publicJson({ error: 'Method not allowed' }, { status: 405 });
    return publicDirectory(bot, supabase, new URL(request.url));
  }
  if (seg[0] === 'public' && seg[1] === 'emote' && seg[2]) {
    if (method !== 'GET') return publicJson({ error: 'Method not allowed' }, { status: 405 });
    return publicEmoteDetail(bot, supabase, seg[2]);
  }
  if (seg[0] === 'public' && seg[1] === 'user' && seg[2]) {
    if (method !== 'GET') return publicJson({ error: 'Method not allowed' }, { status: 405 });
    return publicUserProfile(bot, supabase, decodeURIComponent(seg[2]));
  }

  // Everything below is streamer-scoped.
  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const streamerId = user.id;

  // ── Platform admin: directory approvals ──────────────────────────────────
  if (seg[0] === 'pending') {
    if (!isPlatformAdmin(env, user.twitch_id)) return error('Forbidden', 403, request, env);
    if (method !== 'GET') return error('Method not allowed', 405, request, env);
    const { data } = await bot
      .from('emotes')
      .select('id, code, image_url, width, animated, owner_id, created_at')
      .eq('visibility', 'public')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(200);
    return json({ emotes: data ?? [] }, request, env);
  }

  // ── Which emotes this channel already has (vault marks them "in channel") ─
  if (seg[0] === 'mine' && seg[1] === 'ids') {
    if (method !== 'GET') return error('Method not allowed', 405, request, env);
    const { data } = await bot.from('channel_emotes').select('emote_id').eq('streamer_id', streamerId);
    return json({ ids: (data ?? []).map((r: any) => r.emote_id) }, request, env);
  }

  // ── Directory: browse approved public emotes from other channels ─────────
  if (seg[0] === 'directory') {
    if (method !== 'GET') return error('Method not allowed', 405, request, env);
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 40);
    const tag = (url.searchParams.get('tag') ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20);
    const exact = url.searchParams.get('exact') === 'true';
    const animated = url.searchParams.get('animated'); // 'true' | 'false' | null (any)
    const overlaying = url.searchParams.get('overlaying') === 'true';
    const sort = url.searchParams.get('sort') === 'name' ? 'name' : 'new';

    let query = bot
      .from('emotes')
      .select('id, code, image_url, width, animated, zero_width, tags, owner_id')
      .eq('visibility', 'public')
      .eq('status', 'approved')
      .neq('owner_id', streamerId) // your own emotes already live in "My Emotes"
      .limit(60);
    if (q) query = exact ? query.eq('code', q) : query.ilike('code', `%${q}%`);
    if (tag) query = query.contains('tags', [tag]);
    if (animated === 'true') query = query.eq('animated', true);
    else if (animated === 'false') query = query.eq('animated', false);
    if (overlaying) query = query.eq('zero_width', true);
    query = sort === 'name' ? query.order('code', { ascending: true }) : query.order('created_at', { ascending: false });

    const { data } = await query;
    const rows = data ?? [];

    // Which of these has this channel already added, and who uploaded each
    // (a separate public.streamers lookup — bot.* rows don't PostgREST-embed
    // across the schema boundary, same pattern as publicChannelEmotes below).
    const ownerIds = [...new Set(rows.map((e: any) => e.owner_id).filter(Boolean))];
    const [{ data: mine }, { data: owners }] = await Promise.all([
      bot.from('channel_emotes').select('emote_id').eq('streamer_id', streamerId),
      ownerIds.length ? supabase.from('streamers').select('id, username').in('id', ownerIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const added = new Set((mine ?? []).map((r: any) => r.emote_id));
    const ownerName = new Map((owners ?? []).map((o: any) => [o.id, o.username]));

    const emotes = rows.map((e: any) => ({
      id: e.id, code: e.code, imageUrl: e.image_url, width: e.width, animated: e.animated,
      zeroWidth: !!e.zero_width, tags: Array.isArray(e.tags) ? e.tags : [],
      owner: ownerName.get(e.owner_id) ?? null,
      owned: false, added: added.has(e.id),
    }));
    return json({ emotes }, request, env);
  }

  const id = seg[0];

  // ── List my set: own emotes + emotes I've added from the directory ───────
  if (!id && method === 'GET') {
    const [{ data: own }, { data: links }] = await Promise.all([
      bot.from('emotes').select('*').eq('owner_id', streamerId).order('created_at', { ascending: false }),
      bot.from('channel_emotes').select('emotes(*)').eq('streamer_id', streamerId),
    ]);
    const ownEmotes = (own ?? []).map(emoteToApi);
    const addedEmotes = (links ?? [])
      .map((r: any) => r.emotes)
      .filter(Boolean)
      .map((e: any) => ({ ...emoteToApi(e), owned: false }));
    return json({ emotes: ownEmotes, added: addedEmotes }, request, env);
  }

  // ── Create an emote (upload or URL) ──────────────────────────────────────
  if (!id && method === 'POST') {
    const { count } = await bot.from('emotes').select('id', { count: 'exact', head: true }).eq('owner_id', streamerId);
    if ((count ?? 0) >= MAX_OWN_EMOTES) return error(`You can store at most ${MAX_OWN_EMOTES} emotes`, 409, request, env);

    const ct = request.headers.get('Content-Type') || '';
    let code = '';
    let width = 28;
    let imageUrl: string | null = null;
    let storagePath: string | null = null;
    let animated = false;
    let tags: string[] = [];
    let zeroWidth = false;
    let share = false; // "Private" unchecked → submit to the vault
    let hasVariants = false;
    // Minted here, not by the DB, so the CDN URL can be built before insert.
    const emoteId = crypto.randomUUID();

    if (ct.includes('multipart/form-data')) {
      const form = await request.formData().catch(() => null);
      code = String(form?.get('code') ?? '').trim();
      width = clampWidth(form?.get('width'));
      tags = cleanTags(form?.get('tags'));
      zeroWidth = form?.get('zeroWidth') === 'true';
      share = form?.get('share') === 'true';
      const file = form?.get('file') as unknown;
      if (!(file instanceof File)) return error('file required', 400, request, env);
      const ext = safeExt(file.name, 'png');
      if (!ALLOWED_IMG.includes(ext)) return error('emote must be a png, gif or webp', 400, request, env);
      if (file.size > 1024 * 1024) return error('emote must be under 1MB', 400, request, env);
      animated = ext === 'gif' || ext === 'apng' || ext === 'webp';
      storagePath = `emotes/${streamerId}/${crypto.randomUUID()}.${ext}`;
      const stored = await uploadPublic(supabase, storagePath, file, file.type || 'image/png');
      if (!stored) return error('Upload failed', 500, request, env);

      // 7TV-style size variants. The browser resizes static images to webp and
      // posts them alongside the original (see the upload form); animated
      // emotes can't go through a canvas without losing their frames, so they
      // ship without variants and the CDN serves the original at every size.
      const variants = await Promise.all(
        SIZES.map(async (size) => {
          const v = form?.get(size) as unknown;
          if (!(v instanceof File) || v.size === 0 || v.size > 1024 * 1024) return false;
          return !!(await uploadPublic(supabase, variantPath(storagePath!, size), v, 'image/webp'));
        }),
      );
      hasVariants = variants.every(Boolean);

      // The row stores the branded CDN path, never the storage URL — that's
      // what keeps the storage backend swappable later. 2x is canonical.
      imageUrl = `${emoteCdn(env)}/emote/${emoteId}/2x.webp`;
    } else {
      const body = (await request.json().catch(() => ({}))) as Record<string, any>;
      code = String(body.code ?? '').trim();
      width = clampWidth(body.width);
      tags = cleanTags(body.tags);
      zeroWidth = !!body.zeroWidth;
      share = !!body.share || body.visibility === 'public';
      imageUrl = body.imageUrl ? String(body.imageUrl).slice(0, 500) : null;
      animated = /\.(gif|webp|apng)(\?|$)/i.test(imageUrl ?? '');
      if (!imageUrl) return error('An emote needs an image URL or file', 400, request, env);
    }

    if (!isValidEmoteCode(code)) {
      if (storagePath) await removeEmoteObjects(supabase, storagePath);
      return error('Code must be 2–30 letters, digits or underscores (starting with a letter/digit)', 400, request, env);
    }

    const { data, error: insErr } = await bot
      .from('emotes')
      .insert({
        id: emoteId,
        owner_id: streamerId, code, image_url: imageUrl, storage_path: storagePath, width, animated,
        tags, zero_width: zeroWidth, has_variants: hasVariants,
        // Shared emotes go into the vault as 'pending' for review; private stay 'channel'.
        visibility: share ? 'public' : 'channel',
        status: share ? 'pending' : 'approved',
      })
      .select('*')
      .single();
    if (insErr) {
      if (storagePath) await removeEmoteObjects(supabase, storagePath);
      return error(/duplicate key|unique/i.test(insErr.message) ? `You already have an emote called "${code}"` : 'Could not add emote', 400, request, env);
    }
    return json({ emote: emoteToApi(data) }, request, env, { status: 201 });
  }

  // ── Add / remove a public emote from another channel ─────────────────────
  if (id && seg[1] === 'add') {
    if (method === 'POST') {
      const { data: e } = await bot
        .from('emotes')
        .select('id, owner_id, visibility, status')
        .eq('id', id)
        .maybeSingle();
      if (!e || e.visibility !== 'public' || e.status !== 'approved') return error('Emote not found in the directory', 404, request, env);
      if (e.owner_id === streamerId) return error('That is your own emote', 400, request, env);
      const { error: insErr } = await bot.from('channel_emotes').insert({ streamer_id: streamerId, emote_id: id });
      if (insErr && !/duplicate key|unique/i.test(insErr.message)) return error('Could not add emote', 400, request, env);
      return json({ ok: true }, request, env, { status: 201 });
    }
    if (method === 'DELETE') {
      await bot.from('channel_emotes').delete().eq('streamer_id', streamerId).eq('emote_id', id);
      return json({ ok: true }, request, env);
    }
    return error('Method not allowed', 405, request, env);
  }

  // ── Platform admin: approve / reject a directory submission ───────────────
  if (id && (seg[1] === 'approve' || seg[1] === 'reject') && method === 'POST') {
    if (!isPlatformAdmin(env, user.twitch_id)) return error('Forbidden', 403, request, env);
    const status = seg[1] === 'approve' ? 'approved' : 'rejected';
    const { data } = await bot
      .from('emotes')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (!data) return error('Emote not found', 404, request, env);
    return json({ ok: true, status }, request, env);
  }

  // ── Update an own emote (code, width, submit to directory) ────────────────
  if (id && method === 'PATCH') {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.code !== undefined) {
      const code = String(body.code).trim();
      if (!isValidEmoteCode(code)) return error('Invalid code', 400, request, env);
      patch.code = code;
    }
    if (body.width !== undefined) patch.width = clampWidth(body.width);
    if (body.tags !== undefined) patch.tags = cleanTags(body.tags);
    if (body.zeroWidth !== undefined) patch.zero_width = !!body.zeroWidth;
    if (body.visibility !== undefined) {
      if (body.visibility !== 'channel' && body.visibility !== 'public') return error('Invalid visibility', 400, request, env);
      patch.visibility = body.visibility;
      // Submitting to the directory needs approval; pulling it back is instant.
      patch.status = body.visibility === 'public' ? 'pending' : 'approved';
    }
    const { data, error: upErr } = await bot
      .from('emotes')
      .update(patch)
      .eq('owner_id', streamerId)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (upErr) return error(/duplicate key|unique/i.test(upErr.message) ? 'You already have an emote with that code' : 'Could not update emote', 400, request, env);
    if (!data) return error('Emote not found', 404, request, env);
    return json({ emote: emoteToApi(data) }, request, env);
  }

  // ── Delete an own emote ──────────────────────────────────────────────────
  if (id && method === 'DELETE') {
    const { data } = await bot.from('emotes').select('storage_path').eq('owner_id', streamerId).eq('id', id).maybeSingle();
    if (!data) return error('Emote not found', 404, request, env);
    if (data.storage_path) await removeEmoteObjects(supabase, data.storage_path);
    await bot.from('emotes').delete().eq('owner_id', streamerId).eq('id', id);
    return json({ ok: true }, request, env);
  }

  return error('Not found', 404, request, env);
}

function clampWidth(v: unknown): number {
  const n = Math.floor(Number(v) || 28);
  return Math.max(16, Math.min(96, n));
}

/**
 * Resolve a channel (login or numeric id) to its CreatorCastle streamer and
 * return the merged emote map the extension/overlays render from: the channel's
 * own emotes + emotes it added from the directory (public + approved). Own codes
 * win collisions. Mirrors publicChannelCosmetics in routes/cosmetics.ts.
 */
async function publicChannelEmotes(env: Env, supabase: SupabaseClient, channel: string, url: URL): Promise<Response> {
  const bot = botSchema(supabase);
  const asId = url.searchParams.get('type') === 'id' || /^\d+$/.test(channel);

  let streamer: { id: string; twitch_id: string } | null = null;
  if (asId) {
    const { data } = await supabase.from('streamers').select('id, twitch_id').eq('twitch_id', channel).maybeSingle();
    streamer = data;
  } else {
    const login = cleanLogin(channel);
    const appToken = await getAppAccessToken(env).catch(() => null);
    if (appToken) {
      const tu = await getUserByLogin(env, appToken, login).catch(() => null);
      if (tu?.id) {
        const { data } = await supabase.from('streamers').select('id, twitch_id').eq('twitch_id', tu.id).maybeSingle();
        streamer = data;
      }
    }
    if (!streamer) {
      const { data } = await supabase.from('streamers').select('id, twitch_id').eq('username', login).maybeSingle();
      streamer = data;
    }
  }

  if (!streamer) return publicJson({ channel: { login: cleanLogin(channel) }, emotes: {} });

  const [{ data: own }, { data: links }] = await Promise.all([
    bot.from('emotes').select('id, code, image_url, width, animated, zero_width').eq('owner_id', streamer.id),
    bot.from('channel_emotes').select('emotes(id, code, image_url, width, animated, zero_width, visibility, status)').eq('streamer_id', streamer.id),
  ]);
  const added = (links ?? [])
    .map((r: any) => r.emotes)
    .filter((e: any) => e && e.visibility === 'public' && e.status === 'approved') as EmoteRow[];

  const emotes: Record<string, PublicEmote> = buildEmoteMap((own ?? []) as EmoteRow[], added);

  return publicJson({ channel: { login: cleanLogin(channel), id: streamer.twitch_id, streamerId: streamer.id }, emotes });
}

const DIRECTORY_PAGE_SIZE = 48;

/** DB row → public directory shape (no owner-specific "added" state — this is anonymous). */
function emoteToPublicApi(e: any, owner: { name: string; avatar: string | null } | null, channels = 0) {
  return {
    id: e.id, code: e.code, imageUrl: e.image_url, width: e.width, animated: e.animated,
    zeroWidth: !!e.zero_width, tags: Array.isArray(e.tags) ? e.tags : [],
    owner: owner?.name ?? null, ownerAvatar: owner?.avatar ?? null,
    channels, createdAt: e.created_at,
  };
}

/** Look up owner {name, avatar} + handle for a set of streamer ids. */
async function fetchOwners(supabase: SupabaseClient, ownerIds: string[]) {
  const { data } = ownerIds.length
    ? await supabase.from('streamers').select('id, username, display_name, avatar_url').in('id', ownerIds)
    : { data: [] as any[] };
  return new Map(
    (data ?? []).map((o: any) => [o.id, { name: o.display_name || o.username, avatar: o.avatar_url ?? null, handle: o.username }]),
  );
}

/**
 * Public, unauthenticated vault browse — powers emotes.creatorcastle.gg.
 * Popularity-aware (Top/Trending + "used in N channels") via the SQL function
 * from migration 039, with a plain-query fallback so a deploy that lands before
 * the migration still serves New/A–Z (counts just read 0).
 */
async function publicDirectory(bot: ReturnType<typeof botSchema>, supabase: SupabaseClient, url: URL): Promise<Response> {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 40);
  const tag = (url.searchParams.get('tag') ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20);
  const exact = url.searchParams.get('exact') === 'true';
  const animated = url.searchParams.get('animated'); // 'true' | 'false' | null (any)
  const overlaying = url.searchParams.get('overlaying') === 'true';
  const sortRaw = url.searchParams.get('sort') ?? 'new';
  const sort = ['name', 'top', 'trending'].includes(sortRaw) ? sortRaw : 'new';
  const page = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 1));
  const from = (page - 1) * DIRECTORY_PAGE_SIZE;

  const { data: rpcRows, error: rpcErr } = await bot.rpc('public_emote_directory', {
    p_q: q,
    p_tag: tag,
    p_exact: exact,
    p_animated: animated === 'true' ? 'true' : animated === 'false' ? 'false' : null,
    p_overlaying: overlaying,
    p_sort: sort,
    p_limit: DIRECTORY_PAGE_SIZE,
    p_offset: from,
  });

  let rows: any[];
  let total: number;
  if (!rpcErr && Array.isArray(rpcRows)) {
    rows = rpcRows;
    total = rows.length ? Number(rows[0].total_count) : 0;
  } else {
    // Fallback: no counts; Top/Trending degrade to New.
    let query = bot
      .from('emotes')
      .select('id, code, image_url, width, animated, zero_width, tags, owner_id, created_at', { count: 'exact' })
      .eq('visibility', 'public')
      .eq('status', 'approved')
      .range(from, from + DIRECTORY_PAGE_SIZE - 1);
    if (q) query = exact ? query.eq('code', q) : query.ilike('code', `%${q}%`);
    if (tag) query = query.contains('tags', [tag]);
    if (animated === 'true') query = query.eq('animated', true);
    else if (animated === 'false') query = query.eq('animated', false);
    if (overlaying) query = query.eq('zero_width', true);
    query = sort === 'name' ? query.order('code', { ascending: true }) : query.order('created_at', { ascending: false });
    const res = await query;
    rows = res.data ?? [];
    total = res.count ?? rows.length;
  }

  const owners = await fetchOwners(supabase, [...new Set(rows.map((e: any) => e.owner_id).filter(Boolean))]);
  const emotes = rows.map((e: any) => emoteToPublicApi(e, owners.get(e.owner_id) ?? null, Number(e.channel_count ?? 0)));
  return publicJson({ emotes, total, page });
}

/** Public, unauthenticated single-emote page — the thing that's actually SEO-indexable. */
async function publicEmoteDetail(bot: ReturnType<typeof botSchema>, supabase: SupabaseClient, id: string): Promise<Response> {
  const { data: e } = await bot
    .from('emotes')
    .select('id, code, image_url, width, animated, zero_width, tags, owner_id, created_at')
    .eq('id', id)
    .eq('visibility', 'public')
    .eq('status', 'approved')
    .maybeSingle();
  if (!e) return publicJson({ error: 'Not found' }, { status: 404 });

  const tags: string[] = Array.isArray(e.tags) ? e.tags : [];
  const [{ count: channels }, ownerRes, relatedRes] = await Promise.all([
    bot.from('channel_emotes').select('streamer_id', { count: 'exact', head: true }).eq('emote_id', e.id),
    e.owner_id
      ? supabase.from('streamers').select('username, display_name, avatar_url').eq('id', e.owner_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    tags.length
      ? bot
          .from('emotes')
          .select('id, code, image_url, width, animated, zero_width, tags, owner_id, created_at')
          .eq('visibility', 'public')
          .eq('status', 'approved')
          .neq('id', e.id)
          .overlaps('tags', tags)
          .limit(12)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const o = ownerRes.data;
  const owner = o ? { name: o.display_name || o.username, avatar: o.avatar_url ?? null, handle: o.username } : null;
  const related = (relatedRes.data ?? []).slice(0, 6).map((r: any) => emoteToPublicApi(r, null, 0));
  const emote = { ...emoteToPublicApi(e, owner, channels ?? 0), ownerHandle: owner?.handle ?? null };
  return publicJson({ emote, related });
}

/** Public creator profile — a streamer's shared vault emotes, by username/slug. */
async function publicUserProfile(bot: ReturnType<typeof botSchema>, supabase: SupabaseClient, name: string): Promise<Response> {
  const handle = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  if (!handle) return publicJson({ error: 'Not found' }, { status: 404 });
  const { data: s } = await supabase
    .from('streamers')
    .select('id, username, display_name, avatar_url')
    .ilike('username', handle)
    .maybeSingle();
  if (!s) return publicJson({ error: 'Not found' }, { status: 404 });

  const { data: rows } = await bot
    .from('emotes')
    .select('id, code, image_url, width, animated, zero_width, tags, owner_id, created_at')
    .eq('owner_id', s.id)
    .eq('visibility', 'public')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(200);

  const owner = { name: s.display_name || s.username, avatar: s.avatar_url ?? null };
  const emotes = (rows ?? []).map((e: any) => emoteToPublicApi(e, owner, 0));
  return publicJson({
    user: { name: owner.name, handle: s.username, avatar: owner.avatar, count: emotes.length },
    emotes,
  });
}
