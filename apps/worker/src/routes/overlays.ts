import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { error, json } from '../lib/response';
import { broadcast } from '../realtime';
import { uploadPublic, safeExt } from '../lib/storage';

/**
 * Overlays + widgets — ported from the NestJS OverlayController/OverlayService/
 * OverlayWidgetService (apps/api/src/overlay/*). Rows live in bot.overlays and
 * bot.overlay_widgets, scoped by streamer. config/styles are JSONB (returned as
 * objects). Live test-alert/test-chat push is bot/realtime and deferred.
 *
 * Routes (under /api/overlays):
 *   GET    /                      list
 *   POST   /                      create
 *   GET    /public/:slug          public render data (no auth)
 *   GET    /:id                   get one
 *   PATCH  /:id                   update
 *   DELETE /:id                   delete
 *   GET    /:id/browser-source-url
 *   POST   /:id/widgets           add widget
 *   POST   /:id/widgets/reorder   reorder (z-index)
 *   POST   /:id/sync              bulk upsert/delete widgets
 *   PATCH  /widgets/:widgetId     update widget
 *   DELETE /widgets/:widgetId     delete widget
 */

function randomSlug(len = 10): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function widgetToApi(w: Record<string, any>) {
  return {
    id: w.id,
    type: w.type,
    x: w.x,
    y: w.y,
    width: w.width,
    height: w.height,
    rotation: w.rotation,
    zIndex: w.z_index,
    config: w.config ?? {},
    styles: w.styles ?? {},
  };
}

function overlayToApi(o: Record<string, any>) {
  return {
    id: o.id,
    name: o.name,
    description: o.description,
    width: o.width,
    height: o.height,
    config: o.config ?? {},
    isPublic: o.is_public,
    urlSlug: o.url_slug,
    createdAt: o.created_at,
    widgets: (o.overlay_widgets ?? []).map(widgetToApi),
  };
}

const OVERLAY_SELECT = '*, overlay_widgets(*)';

export async function handleOverlays(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response> {
  const bot = botSchema(supabase);
  const sub = path.slice('/api/overlays'.length).replace(/^\//, '');
  const seg = sub.split('/').filter(Boolean);

  // --- Public tip stats for OBS widgets (no auth, keyed by overlay slug) ---
  // GET /api/overlays/public/:slug/tips → { totalCents, currency, leaderboard, recent }
  if (method === 'GET' && seg[0] === 'public' && seg[1] && seg[2] === 'tips') {
    const { data: ov } = await bot.from('overlays').select('streamer_id, is_public').eq('url_slug', seg[1]).maybeSingle();
    if (!ov || !ov.is_public) return json({ totalCents: 0, currency: 'USD', leaderboard: [], recent: [] }, request, env);
    const streamerId = ov.streamer_id;
    const [{ data: settings }, { data: total }, { data: board }, { data: recent }] = await Promise.all([
      bot.from('tip_settings').select('currency').eq('streamer_id', streamerId).maybeSingle(),
      bot.rpc('tip_total', { p_streamer_id: streamerId, p_since: null }),
      bot.rpc('tip_leaderboard', { p_streamer_id: streamerId, p_limit: 10 }),
      bot.from('tips').select('donor_name, amount_cents, message, completed_at').eq('streamer_id', streamerId).eq('status', 'completed').order('completed_at', { ascending: false }).limit(20),
    ]);
    return json(
      {
        totalCents: Number(Array.isArray(total) ? total[0] : total) || 0,
        currency: settings?.currency ?? 'USD',
        leaderboard: (Array.isArray(board) ? board : []).map((r: any) => ({ donorName: r.donor_name, totalCents: Number(r.total_cents) })),
        recent: (recent ?? []).map((t: any) => ({ donorName: t.donor_name, amountCents: t.amount_cents, message: t.message })),
      },
      request,
      env,
    );
  }

  // --- Public render data (no auth) ---
  if (method === 'GET' && seg[0] === 'public' && seg[1]) {
    const { data, error: e } = await bot
      .from('overlays')
      .select(OVERLAY_SELECT)
      .eq('url_slug', seg[1])
      .maybeSingle();
    if (e) return error(e.message, 500, request, env);
    if (!data) return error('Overlay not found', 404, request, env);
    if (!data.is_public) return error('This overlay is not public', 400, request, env);
    // Order widgets by z-index for deterministic stacking.
    data.overlay_widgets = (data.overlay_widgets ?? []).sort((a: any, b: any) => a.z_index - b.z_index);
    return json(overlayToApi(data), request, env);
  }

  // Everything below requires auth.
  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const streamerId = user.id;

  async function ownedOverlay(id: string) {
    const { data } = await bot.from('overlays').select('id').eq('id', id).eq('streamer_id', streamerId).maybeSingle();
    return !!data;
  }

  // POST /api/overlays/upload — store an alert sound / image asset, return its URL.
  if (method === 'POST' && seg[0] === 'upload') {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file') as unknown;
    if (!(file instanceof File)) return error('file required', 400, request, env);
    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');
    if (!isImage && !isAudio) return error('must be an image or audio file', 400, request, env);
    const limit = isAudio ? 2 * 1024 * 1024 : 3 * 1024 * 1024;
    if (file.size > limit) return error(`file must be under ${limit / (1024 * 1024)}MB`, 400, request, env);
    const kind = isAudio ? 'sounds' : 'images';
    const p = `overlay/${kind}/${streamerId}/${crypto.randomUUID()}.${safeExt(file.name, isAudio ? 'mp3' : 'png')}`;
    const url = await uploadPublic(supabase, p, file, file.type);
    if (!url) return error('Upload failed', 500, request, env);
    return json({ url }, request, env, { status: 201 });
  }

  // GET /api/overlays — list
  if (method === 'GET' && seg.length === 0) {
    const { data, error: e } = await bot
      .from('overlays')
      .select(OVERLAY_SELECT)
      .eq('streamer_id', streamerId)
      .order('created_at', { ascending: false });
    if (e) return error(e.message, 500, request, env);
    return json((data ?? []).map(overlayToApi), request, env);
  }

  // POST /api/overlays — create
  if (method === 'POST' && seg.length === 0) {
    const body = (await request.json()) as Record<string, any>;
    if (!body.name) return error('name is required', 400, request, env);
    const { data, error: e } = await bot
      .from('overlays')
      .insert({
        streamer_id: streamerId,
        name: body.name,
        description: body.description ?? null,
        width: body.width || 1920,
        height: body.height || 1080,
        url_slug: randomSlug(),
        config: {},
      })
      .select(OVERLAY_SELECT)
      .single();
    if (e) return error(e.message, 400, request, env);
    return json(overlayToApi(data), request, env, { status: 201 });
  }

  // --- Widget-by-id routes: /widgets/:widgetId ---
  if (seg[0] === 'widgets' && seg[1]) {
    const widgetId = seg[1];
    // Verify the widget belongs to an overlay owned by this streamer.
    const { data: w } = await bot.from('overlay_widgets').select('id, overlay_id').eq('id', widgetId).maybeSingle();
    if (!w || !(await ownedOverlay(w.overlay_id))) return error('Widget not found', 404, request, env);

    if (method === 'PATCH') {
      const body = (await request.json()) as Record<string, any>;
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      for (const k of ['x', 'y', 'width', 'height', 'rotation'] as const) if (body[k] !== undefined) patch[k] = body[k];
      if (body.zIndex !== undefined) patch.z_index = body.zIndex;
      if (body.config !== undefined) patch.config = body.config;
      if (body.styles !== undefined) patch.styles = body.styles;
      const { data, error: e } = await bot.from('overlay_widgets').update(patch).eq('id', widgetId).select('*').single();
      if (e) return error(e.message, 400, request, env);
      return json(widgetToApi(data), request, env);
    }
    if (method === 'DELETE') {
      const { error: e } = await bot.from('overlay_widgets').delete().eq('id', widgetId);
      if (e) return error(e.message, 500, request, env);
      return json({ success: true }, request, env);
    }
  }

  // --- Overlay-by-id routes: /:id[...] ---
  const id = seg[0];
  if (!id) return error('Not found', 404, request, env);

  // GET /:id/browser-source-url
  if (method === 'GET' && seg[1] === 'browser-source-url') {
    const { data } = await bot.from('overlays').select('url_slug').eq('id', id).eq('streamer_id', streamerId).maybeSingle();
    if (!data) return error('Overlay not found', 404, request, env);
    return json({ url: `${env.FRONTEND_URL}/overlay/${data.url_slug}` }, request, env);
  }

  // POST /:id/widgets/reorder
  if (method === 'POST' && seg[1] === 'widgets' && seg[2] === 'reorder') {
    if (!(await ownedOverlay(id))) return error('Overlay not found', 404, request, env);
    const body = (await request.json()) as { widgetOrder?: string[] };
    let i = 0;
    for (const wid of body.widgetOrder ?? []) {
      await bot.from('overlay_widgets').update({ z_index: i++ }).eq('id', wid).eq('overlay_id', id);
    }
    return json({ success: true }, request, env);
  }

  // POST /:id/widgets — add widget
  if (method === 'POST' && seg[1] === 'widgets' && seg.length === 2) {
    if (!(await ownedOverlay(id))) return error('Overlay not found', 404, request, env);
    const body = (await request.json()) as Record<string, any>;
    let zIndex = body.zIndex;
    if (zIndex === undefined) {
      const { data: top } = await bot
        .from('overlay_widgets')
        .select('z_index')
        .eq('overlay_id', id)
        .order('z_index', { ascending: false })
        .limit(1)
        .maybeSingle();
      zIndex = (top?.z_index ?? 0) + 1;
    }
    const { data, error: e } = await bot
      .from('overlay_widgets')
      .insert({
        overlay_id: id,
        type: body.type,
        x: body.x || 0,
        y: body.y || 0,
        width: body.width || 300,
        height: body.height || 200,
        rotation: body.rotation || 0,
        z_index: zIndex,
        config: body.config || {},
        styles: body.styles || {},
      })
      .select('*')
      .single();
    if (e) return error(e.message, 400, request, env);
    return json(widgetToApi(data), request, env, { status: 201 });
  }

  // POST /:id/sync — bulk upsert/delete widgets
  if (method === 'POST' && seg[1] === 'sync') {
    if (!(await ownedOverlay(id))) return error('Overlay not found', 404, request, env);
    const body = (await request.json()) as { widgets?: any[] };
    const widgets = body.widgets ?? [];
    const { data: existing } = await bot.from('overlay_widgets').select('id').eq('overlay_id', id);
    const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id));
    const isReal = (wid: unknown) => typeof wid === 'string' && !wid.includes('nanoid_');
    const incoming = new Set(widgets.map((w) => w.id).filter(isReal));
    // Delete removed widgets.
    const toDelete = [...existingIds].filter((eid) => !incoming.has(eid));
    if (toDelete.length) await bot.from('overlay_widgets').delete().in('id', toDelete);
    // Upsert the rest.
    const results: unknown[] = [];
    for (const [index, w] of widgets.entries()) {
      const row = {
        type: w.type,
        x: Math.round(w.x || 0),
        y: Math.round(w.y || 0),
        width: Math.round(w.width || 300),
        height: Math.round(w.height || 200),
        rotation: Math.round(w.rotation || 0),
        z_index: w.zIndex ?? index,
        config: w.config || {},
        styles: w.styles || {},
      };
      if (isReal(w.id) && existingIds.has(w.id)) {
        const { data } = await bot.from('overlay_widgets').update(row).eq('id', w.id).select('*').single();
        if (data) results.push(widgetToApi(data));
      } else {
        const { data } = await bot.from('overlay_widgets').insert({ ...row, overlay_id: id }).select('*').single();
        if (data) results.push(widgetToApi(data));
      }
    }
    await broadcast(env, `overlay:${id}`, 'overlay.updated', {});
    return json(results, request, env);
  }

  // POST /:id/test-alert  and  /:id/test-chat — push a sample event to the overlay.
  if (method === 'POST' && (seg[1] === 'test-alert' || seg[1] === 'test-chat')) {
    if (!(await ownedOverlay(id))) return error('Overlay not found', 404, request, env);
    if (seg[1] === 'test-alert') {
      // Body may override any sample field ({ type, username, message, amount,
      // tier }) so the editor can test amount-based variations and all 6 types.
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const SAMPLES: Record<string, Record<string, unknown>> = {
        follow: { type: 'follow', username: 'SirTestsalot', message: '', amount: 0, tier: '' },
        subscribe: { type: 'subscribe', username: 'LadyValiant', message: 'Love the stream!', amount: 6, tier: '1000' },
        cheer: { type: 'cheer', username: 'BaronBits', message: 'For the treasury!', amount: 100, tier: '' },
        raid: { type: 'raid', username: 'QueenRaidalot', message: '', amount: 25, tier: '' },
        donation: { type: 'donation', username: 'DukeOfCoin', message: 'Keep it up!', amount: 5, tier: '' },
        gift: { type: 'gift', username: 'GiftGiver', message: '', amount: 1, tier: '1000' },
      };
      const sample = SAMPLES[String(body.type ?? 'follow')] ?? SAMPLES.follow;
      const alert = {
        ...sample,
        username: String(body.username ?? sample.username).slice(0, 60),
        message: String(body.message ?? sample.message).slice(0, 200),
        amount: Number.isFinite(Number(body.amount)) ? Number(body.amount) : sample.amount,
        tier: String(body.tier ?? sample.tier).slice(0, 8),
      };
      await broadcast(env, `overlay:${id}`, 'alert', alert);
    } else {
      await broadcast(env, `overlay:${id}`, 'chat', { username: 'CreatorCastle', message: 'Test chat message for your overlay.', color: '#a855f7' });
    }
    return json({ success: true }, request, env);
  }

  // GET/PATCH/DELETE /:id
  if (seg.length === 1) {
    if (method === 'GET') {
      const { data, error: e } = await bot
        .from('overlays')
        .select(OVERLAY_SELECT)
        .eq('id', id)
        .eq('streamer_id', streamerId)
        .maybeSingle();
      if (e) return error(e.message, 500, request, env);
      if (!data) return error('Overlay not found', 404, request, env);
      data.overlay_widgets = (data.overlay_widgets ?? []).sort((a: any, b: any) => a.z_index - b.z_index);
      return json(overlayToApi(data), request, env);
    }
    if (method === 'PATCH') {
      const body = (await request.json()) as Record<string, any>;
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      for (const k of ['name', 'description', 'width', 'height'] as const) if (body[k] !== undefined) patch[k] = body[k];
      if (body.config !== undefined) patch.config = body.config;
      if (body.isPublic !== undefined) patch.is_public = body.isPublic;
      const { data, error: e } = await bot
        .from('overlays')
        .update(patch)
        .eq('id', id)
        .eq('streamer_id', streamerId)
        .select(OVERLAY_SELECT)
        .maybeSingle();
      if (e) return error(e.message, 400, request, env);
      if (!data) return error('Overlay not found', 404, request, env);
      return json(overlayToApi(data), request, env);
    }
    if (method === 'DELETE') {
      const { data, error: e } = await bot
        .from('overlays')
        .delete()
        .eq('id', id)
        .eq('streamer_id', streamerId)
        .select('id')
        .maybeSingle();
      if (e) return error(e.message, 500, request, env);
      if (!data) return error('Overlay not found', 404, request, env);
      return json({ success: true }, request, env);
    }
  }

  return error('Not found', 404, request, env);
}
