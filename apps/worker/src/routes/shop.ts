import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema, getPublicOwner } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { error, json } from '../lib/response';

/**
 * The Royal Shop — creator API (loyalty store admin + fulfillment queue).
 *
 *   GET    /api/shop/items                    list rewards
 *   POST   /api/shop/items                    create a reward
 *   PATCH  /api/shop/items/:id                update
 *   PATCH  /api/shop/items/:id/toggle         enable/disable
 *   DELETE /api/shop/items/:id                delete
 *   GET    /api/shop/redemptions?status=      fulfillment queue
 *   POST   /api/shop/redemptions/:id/fulfill  mark fulfilled
 *   POST   /api/shop/redemptions/:id/refund   refund points (atomic RPC)
 *
 * Viewers redeem via chat (!shop / !buy) — see chat/shop.ts.
 */

interface ItemRow {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string | null;
  image_url: string | null;
  cost: number;
  stock: number | null;
  per_user_limit: number | null;
  enabled: boolean;
  sort: number;
}

function itemToApi(i: ItemRow) {
  return {
    id: i.id, code: i.code, name: i.name, description: i.description, icon: i.icon, imageUrl: i.image_url,
    cost: i.cost, stock: i.stock, perUserLimit: i.per_user_limit, enabled: i.enabled, sort: i.sort,
  };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
}

/** Map an API body to DB columns. Returns null on invalid input. */
function itemToDb(body: Record<string, any>, partial: boolean): Record<string, any> | null {
  const out: Record<string, any> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const nullableInt = (v: any, min: number) => {
    if (v === null || v === '' || v === undefined) return null;
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= min ? n : undefined;
  };

  if (has('name')) out.name = String(body.name).slice(0, 80);
  if (has('description')) out.description = String(body.description ?? '').slice(0, 300);
  if (has('icon')) out.icon = body.icon ? String(body.icon).slice(0, 32) : null;
  if (has('imageUrl')) out.image_url = body.imageUrl ? String(body.imageUrl).slice(0, 500) : null;
  if (has('code')) out.code = slug(String(body.code));
  if (has('cost')) {
    const c = Math.floor(Number(body.cost));
    if (!Number.isFinite(c) || c < 0) return null;
    out.cost = c;
  }
  if (has('stock')) { const s = nullableInt(body.stock, 0); if (s === undefined) return null; out.stock = s; }
  if (has('perUserLimit')) { const l = nullableInt(body.perUserLimit, 1); if (l === undefined) return null; out.per_user_limit = l; }
  if (has('enabled')) out.enabled = !!body.enabled;
  if (has('sort')) out.sort = Math.floor(Number(body.sort) || 0);

  if (!partial && (out.name === undefined || out.cost === undefined)) return null;
  return out;
}

export async function handleShop(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response> {
  const seg = path.slice('/api/shop'.length).replace(/^\//, '').split('/').filter(Boolean);

  // ── Public store catalog (no auth) — GET /api/shop/public/:streamerId ──────
  // Powers the viewer-facing store page. Redemption still happens in chat
  // (!buy <code>), so this is read-only: enabled, in-stock rewards only.
  if (seg[0] === 'public') {
    const sid = seg[1];
    if (!sid || method !== 'GET') return error('Not found', 404, request, env);
    const bot = botSchema(supabase);
    const { data: items } = await bot
      .from('shop_items')
      .select('code, name, description, icon, image_url, cost, stock, per_user_limit')
      .eq('streamer_id', sid)
      .eq('enabled', true)
      .order('sort', { ascending: true })
      .limit(100);
    const owner = await getPublicOwner(supabase, sid);
    const visible = (items ?? [])
      .filter((i: any) => i.stock === null || i.stock > 0)
      .map((i: any) => ({
        code: i.code, name: i.name, description: i.description, icon: i.icon,
        imageUrl: i.image_url, cost: i.cost, stock: i.stock, perUserLimit: i.per_user_limit,
      }));
    return json({ owner, items: visible }, request, env);
  }

  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const streamerId = user.id;
  const bot = botSchema(supabase);

  // ── Items ──────────────────────────────────────────────────────────────
  if (seg[0] === 'items') {
    const id = seg[1];

    if (!id && method === 'GET') {
      const { data } = await bot.from('shop_items').select('*').eq('streamer_id', streamerId).order('sort', { ascending: true });
      return json({ items: (data ?? []).map((i) => itemToApi(i as ItemRow)) }, request, env);
    }
    if (!id && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as Record<string, any>;
      const row = itemToDb(body, false);
      if (!row) return error('Invalid item', 400, request, env);
      row.streamer_id = streamerId;
      if (!row.code) row.code = slug(row.name) || `item-${Date.now() % 100000}`;
      const { data, error: insErr } = await bot.from('shop_items').insert(row).select('*').single();
      if (insErr) {
        return error(/duplicate key|unique/i.test(insErr.message) ? 'That code is already used' : 'Could not create item', 400, request, env);
      }
      return json({ item: itemToApi(data as ItemRow) }, request, env, { status: 201 });
    }
    if (id && method === 'PATCH' && seg[2] === 'toggle') {
      const { data: cur } = await bot.from('shop_items').select('enabled').eq('streamer_id', streamerId).eq('id', id).maybeSingle();
      if (!cur) return error('Item not found', 404, request, env);
      const { data } = await bot.from('shop_items').update({ enabled: !cur.enabled, updated_at: new Date().toISOString() }).eq('streamer_id', streamerId).eq('id', id).select('*').single();
      return json({ item: itemToApi(data as ItemRow) }, request, env);
    }
    if (id && method === 'PATCH') {
      const body = (await request.json().catch(() => ({}))) as Record<string, any>;
      const row = itemToDb(body, true);
      if (!row || !Object.keys(row).length) return error('Invalid item', 400, request, env);
      row.updated_at = new Date().toISOString();
      const { data, error: updErr } = await bot.from('shop_items').update(row).eq('streamer_id', streamerId).eq('id', id).select('*').maybeSingle();
      if (updErr) return error(/duplicate key|unique/i.test(updErr.message) ? 'That code is already used' : 'Could not update item', 400, request, env);
      if (!data) return error('Item not found', 404, request, env);
      return json({ item: itemToApi(data as ItemRow) }, request, env);
    }
    if (id && method === 'DELETE') {
      const { data } = await bot.from('shop_items').delete().eq('streamer_id', streamerId).eq('id', id).select('id');
      if (!data?.length) return error('Item not found', 404, request, env);
      return json({ ok: true }, request, env);
    }
    return error('Method not allowed', 405, request, env);
  }

  // ── Redemptions (fulfillment queue) ──────────────────────────────────────
  if (seg[0] === 'redemptions') {
    const id = seg[1];
    const action = seg[2];

    if (!id && method === 'GET') {
      const status = new URL(request.url).searchParams.get('status');
      let qb = bot
        .from('shop_redemptions')
        .select('id, item_name, viewer_name, viewer_twitch_id, cost, status, note, created_at, resolved_at')
        .eq('streamer_id', streamerId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (status) qb = qb.eq('status', status);
      const { data } = await qb;
      const redemptions = (data ?? []).map((r: any) => ({
        id: r.id, itemName: r.item_name, viewerName: r.viewer_name, viewerTwitchId: r.viewer_twitch_id,
        cost: r.cost, status: r.status, note: r.note, createdAt: r.created_at, resolvedAt: r.resolved_at,
      }));
      return json({ redemptions }, request, env);
    }

    if (id && method === 'POST' && action === 'fulfill') {
      const { data } = await bot
        .from('shop_redemptions')
        .update({ status: 'fulfilled', resolved_at: new Date().toISOString() })
        .eq('streamer_id', streamerId).eq('id', id).eq('status', 'pending')
        .select('id');
      if (!data?.length) return error('Redemption not found or already resolved', 404, request, env);
      return json({ ok: true }, request, env);
    }

    if (id && method === 'POST' && action === 'refund') {
      const { data, error: rpcErr } = await bot.rpc('refund_shop_redemption', { p_streamer_id: streamerId, p_redemption_id: id });
      if (rpcErr || data !== true) return error('Could not refund (already refunded?)', 400, request, env);
      return json({ ok: true }, request, env);
    }
    return error('Method not allowed', 405, request, env);
  }

  return error('Not found', 404, request, env);
}
