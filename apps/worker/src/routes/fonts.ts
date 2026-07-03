import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { json, error } from '../lib/response';
import { getUserFromSession } from '../lib/session';
import { uploadPublic, removeObject, safeExt } from '../lib/storage';

/**
 * Custom font management for a Castle account (bot.fonts + the bingo-assets
 * bucket). Up to 5 fonts per account; usable across apps (bingo card text today).
 *   GET    /api/fonts        list the creator's fonts
 *   POST   /api/fonts        multipart { file: .ttf/.otf/.woff, name }  (≤5)
 *   DELETE /api/fonts/:id    remove a font
 */
const MAX_FONTS = 5;
const ALLOWED = ['ttf', 'otf', 'woff', 'woff2'];

function slugFamily(name: string): string {
  const base = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'font';
  return `cc-${base}`.slice(0, 36);
}

export async function handleFonts(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response> {
  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const bot = botSchema(supabase);
  const id = path.replace(/^\/api\/fonts\/?/, '').split('/').filter(Boolean)[0];

  if (!id && method === 'GET') {
    const { data } = await bot
      .from('fonts')
      .select('id, name, family, url')
      .eq('streamer_id', user.id)
      .order('created_at', { ascending: true });
    return json({ fonts: data ?? [] }, request, env);
  }

  if (!id && method === 'POST') {
    const { count } = await bot.from('fonts').select('id', { count: 'exact', head: true }).eq('streamer_id', user.id);
    if ((count ?? 0) >= MAX_FONTS) return error(`You can store at most ${MAX_FONTS} fonts`, 409, request, env);

    const form = await request.formData().catch(() => null);
    const file = form?.get('file') as unknown;
    const name = String(form?.get('name') ?? '').trim() || 'Custom font';
    if (!(file instanceof File)) return error('file required', 400, request, env);
    const ext = safeExt(file.name, 'ttf');
    if (!ALLOWED.includes(ext)) return error('must be a .ttf, .otf or .woff font', 400, request, env);
    if (file.size > 2 * 1024 * 1024) return error('font must be under 2MB', 400, request, env);

    const family = `${slugFamily(name)}-${crypto.randomUUID().slice(0, 4)}`;
    const storagePath = `fonts/${user.id}/${crypto.randomUUID()}.${ext}`;
    const url = await uploadPublic(supabase, storagePath, file, file.type || 'font/ttf');
    if (!url) return error('Upload failed', 500, request, env);

    const { data, error: dbErr } = await bot
      .from('fonts')
      .insert({ streamer_id: user.id, name: name.slice(0, 60), family, url, storage_path: storagePath })
      .select('id, name, family, url')
      .single();
    if (dbErr) return error(dbErr.message, 500, request, env);
    return json({ font: data }, request, env, { status: 201 });
  }

  if (id && method === 'DELETE') {
    const { data: row } = await bot
      .from('fonts')
      .select('storage_path')
      .eq('id', id)
      .eq('streamer_id', user.id)
      .maybeSingle();
    if (row?.storage_path) await removeObject(supabase, row.storage_path);
    await bot.from('fonts').delete().eq('id', id).eq('streamer_id', user.id);
    return json({ ok: true }, request, env);
  }

  return error('Not found', 404, request, env);
}
