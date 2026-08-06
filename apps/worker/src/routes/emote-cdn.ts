import type { Env } from '../env';
import { createSupabaseClient } from '../lib/supabase';
import { botSchema } from '../lib/supabase';

/**
 * The public emote CDN — /emote/:id/:size.webp on whatever host reaches us.
 *
 * Currently served from api.creatorcastle.gg. It is NOT on cdn.creatorcastle.gg:
 * that hostname is an R2 custom domain for the `assets` bucket shared with the
 * TCG, and as of 2026-07-19 it 404s even objects that demonstrably exist in the
 * bucket, so nothing here should be pointed at it until that's fixed.
 *
 * Mirrors 7TV's cdn.7tv.app/emote/<id>/<size>.webp. The point is that the DB
 * never again stores a storage-backend URL: rows hold this stable, branded
 * path, so Supabase Storage can be swapped for R2 later without rewriting a
 * single row or breaking extension clients that cached the URL.
 *
 * Resolution order for a given size:
 *   1. `<storage_path>/<size>.webp` — a real resized variant (canvas-generated
 *      at upload for static emotes)
 *   2. the original file — animated emotes, and every emote uploaded before
 *      variants existed. Same bytes at every size path, so links stay valid.
 *
 * Responses are immutable and edge-cached for a year: the id→path lookup only
 * costs a DB round trip on a cold cache.
 */

const SIZES = ['1x', '2x', '3x', '4x'] as const;
const ONE_YEAR = 31536000;

export async function handleEmoteCdn(request: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  // /emote/:id/:size.webp
  const m = /^\/emote\/([0-9a-f-]{36})\/(1x|2x|3x|4x)(?:\.[a-z]+)?$/i.exec(url.pathname);
  if (!m) return new Response('Not found', { status: 404 });
  const [, id, size] = m;

  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const supabase = createSupabaseClient(env);
  const bot = botSchema(supabase);
  const { data: emote } = await bot
    .from('emotes')
    .select('storage_path, image_url, has_variants')
    .eq('id', id)
    .maybeSingle();
  if (!emote) return new Response('Not found', { status: 404 });

  const origin = resolveOrigin(supabase, emote, size);
  if (!origin) return new Response('Not found', { status: 404 });

  const upstream = await fetch(origin, { cf: { cacheEverything: true, cacheTtl: ONE_YEAR } } as RequestInit);
  if (!upstream.ok) return new Response('Not found', { status: 404 });

  const res = new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'image/webp',
      // Immutable: an emote's bytes never change in place — an edit writes a
      // new storage path, so a stale year-long cache can't serve wrong pixels.
      'Cache-Control': `public, max-age=${ONE_YEAR}, immutable`,
      'Access-Control-Allow-Origin': '*',
      'X-Emote-Variant': emote.has_variants ? size : 'original',
    },
  });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

/**
 * Where the bytes for this size actually live.
 *
 * `storage_path` keeps pointing at the ORIGINAL file exactly as it always has —
 * variants are written beside it under a sibling folder named after the file.
 * That's what makes this migration-free: legacy rows simply have no variants
 * and fall through to the original.
 *
 *   emotes/<sid>/<uuid>.png        ← original (storage_path, unchanged)
 *   emotes/<sid>/<uuid>/2x.webp    ← variant
 */
export function variantPath(storagePath: string, size: string): string {
  return `${storagePath.replace(/\.[a-z0-9]+$/i, '')}/${size}.webp`;
}

function resolveOrigin(supabase: any, emote: any, size: string): string | null {
  const path: string | null = emote.storage_path;
  const publicUrl = (p: string) => supabase.storage.from('bingo-assets').getPublicUrl(p).data.publicUrl as string;

  if (path) return publicUrl(emote.has_variants ? variantPath(path, size) : path);
  // Emotes added by URL rather than upload have no storage object at all.
  return emote.image_url && !emote.image_url.includes('/emote/') ? emote.image_url : null;
}

export { SIZES };
