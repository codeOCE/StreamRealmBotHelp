import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema, getPublicOwner } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { error, json } from '../lib/response';

/**
 * Link-in-bio page — creator API.
 *
 *   GET    /api/links                  list this creator's links
 *   POST   /api/links                  create a link
 *   PATCH  /api/links/:id              update
 *   PATCH  /api/links/:id/toggle       enable/disable
 *   DELETE /api/links/:id              delete
 *   POST   /api/links/reorder          { order: string[] } — sets sort by array position
 *   GET    /api/links/settings         page style (accent/buttonStyle/shape)
 *   PUT    /api/links/settings         update page style
 *   GET    /api/links/public/:streamerId  public, enabled links + style (no auth)
 */

interface LinkRow {
  id: string;
  label: string;
  url: string;
  icon: string | null;
  enabled: boolean;
  sort: number;
}

function linkToApi(l: LinkRow) {
  return { id: l.id, label: l.label, url: l.url, icon: l.icon, enabled: l.enabled, sort: l.sort };
}

/** Map an API body to DB columns. Returns null on invalid input. */
function linkToDb(body: Record<string, any>, partial: boolean): Record<string, any> | null {
  const out: Record<string, any> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  if (has('label')) out.label = String(body.label).slice(0, 80);
  if (has('icon')) out.icon = body.icon ? String(body.icon).slice(0, 32) : null;
  if (has('enabled')) out.enabled = !!body.enabled;
  if (has('url')) {
    const url = String(body.url).trim();
    if (!/^https?:\/\//i.test(url)) return null;
    out.url = url.slice(0, 500);
  }

  if (!partial && (out.label === undefined || out.url === undefined)) return null;
  return out;
}

const BUTTON_STYLES = ['glass', 'solid', 'outline'] as const;
const SHAPES = ['rounded', 'pill', 'sharp'] as const;

function settingsToApi(row: { accent?: string | null; button_style?: string; shape?: string } | null) {
  return {
    accent: row?.accent ?? null,
    buttonStyle: row?.button_style ?? 'glass',
    shape: row?.shape ?? 'rounded',
  };
}

export async function handleLinks(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response> {
  const seg = path.slice('/api/links'.length).replace(/^\//, '').split('/').filter(Boolean);

  // ── Public link page (no auth) — GET /api/links/public/:streamerId ──────
  if (seg[0] === 'public') {
    const sid = seg[1];
    if (!sid || method !== 'GET') return error('Not found', 404, request, env);
    const bot = botSchema(supabase);
    const { data: links } = await bot
      .from('profile_links')
      .select('label, url, icon')
      .eq('streamer_id', sid)
      .eq('enabled', true)
      .order('sort', { ascending: true })
      .limit(100);
    const owner = await getPublicOwner(supabase, sid);
    const { data: style } = await bot.from('links_pages').select('accent, button_style, shape').eq('streamer_id', sid).maybeSingle();
    return json({ owner, links: links ?? [], settings: settingsToApi(style) }, request, env);
  }

  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const streamerId = user.id;
  const bot = botSchema(supabase);

  if (seg[0] === 'settings') {
    if (method === 'GET') {
      const { data } = await bot.from('links_pages').select('accent, button_style, shape').eq('streamer_id', streamerId).maybeSingle();
      return json({ settings: settingsToApi(data) }, request, env);
    }
    if (method === 'PUT') {
      const body = (await request.json().catch(() => ({}))) as Record<string, any>;
      const accent = body.accent ? String(body.accent) : null;
      if (accent && !/^#[0-9a-fA-F]{6}$/.test(accent)) return error('Invalid accent color', 400, request, env);
      const row = {
        streamer_id: streamerId,
        accent,
        button_style: BUTTON_STYLES.includes(body.buttonStyle) ? body.buttonStyle : 'glass',
        shape: SHAPES.includes(body.shape) ? body.shape : 'rounded',
        updated_at: new Date().toISOString(),
      };
      const { error: upErr } = await bot.from('links_pages').upsert(row);
      if (upErr) return error('Could not save style', 400, request, env);
      return json({ ok: true }, request, env);
    }
    return error('Method not allowed', 405, request, env);
  }

  if (seg[0] === 'reorder' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { order?: string[] };
    let i = 0;
    for (const id of body.order ?? []) {
      await bot.from('profile_links').update({ sort: i++ }).eq('streamer_id', streamerId).eq('id', id);
    }
    return json({ ok: true }, request, env);
  }

  const id = seg[0];

  if (!id && method === 'GET') {
    const { data } = await bot.from('profile_links').select('*').eq('streamer_id', streamerId).order('sort', { ascending: true });
    return json({ links: (data ?? []).map((l) => linkToApi(l as LinkRow)) }, request, env);
  }
  if (!id && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const row = linkToDb(body, false);
    if (!row) return error('Invalid link', 400, request, env);
    row.streamer_id = streamerId;
    const { count } = await bot.from('profile_links').select('id', { count: 'exact', head: true }).eq('streamer_id', streamerId);
    row.sort = count ?? 0;
    const { data, error: insErr } = await bot.from('profile_links').insert(row).select('*').single();
    if (insErr) return error('Could not create link', 400, request, env);
    return json({ link: linkToApi(data as LinkRow) }, request, env, { status: 201 });
  }
  if (id && method === 'PATCH' && seg[1] === 'toggle') {
    const { data: cur } = await bot.from('profile_links').select('enabled').eq('streamer_id', streamerId).eq('id', id).maybeSingle();
    if (!cur) return error('Link not found', 404, request, env);
    const { data } = await bot.from('profile_links').update({ enabled: !cur.enabled, updated_at: new Date().toISOString() }).eq('streamer_id', streamerId).eq('id', id).select('*').single();
    return json({ link: linkToApi(data as LinkRow) }, request, env);
  }
  if (id && method === 'PATCH') {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const row = linkToDb(body, true);
    if (!row || !Object.keys(row).length) return error('Invalid link', 400, request, env);
    row.updated_at = new Date().toISOString();
    const { data, error: updErr } = await bot.from('profile_links').update(row).eq('streamer_id', streamerId).eq('id', id).select('*').maybeSingle();
    if (updErr) return error('Could not update link', 400, request, env);
    if (!data) return error('Link not found', 404, request, env);
    return json({ link: linkToApi(data as LinkRow) }, request, env);
  }
  if (id && method === 'DELETE') {
    const { data } = await bot.from('profile_links').delete().eq('streamer_id', streamerId).eq('id', id).select('id');
    if (!data?.length) return error('Link not found', 404, request, env);
    return json({ ok: true }, request, env);
  }

  return error('Not found', 404, request, env);
}
