import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { error, json } from '../lib/response';

/**
 * Quotes — creator API (dashboard mirror of !quote/!addquote/!delquote).
 *
 *   GET    /api/quotes           list quotes (by number)
 *   POST   /api/quotes           add { text, game? }  (uses add_quote RPC for numbering)
 *   PATCH  /api/quotes/:number   edit { text?, game? }
 *   DELETE /api/quotes/:number   delete by quote_number
 */

interface QuoteRow {
  quote_number: number;
  text: string;
  added_by: string | null;
  game: string | null;
  created_at: string;
}

const toApi = (q: QuoteRow) => ({
  number: q.quote_number,
  text: q.text,
  addedBy: q.added_by,
  game: q.game,
  createdAt: q.created_at,
});

export async function handleQuotes(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response> {
  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const streamerId = user.id;
  const bot = botSchema(supabase);
  const seg = path.slice('/api/quotes'.length).replace(/^\//, '').split('/').filter(Boolean);
  const num = seg[0] ? parseInt(seg[0], 10) : NaN;

  if (!seg[0]) {
    if (method === 'GET') {
      const { data } = await bot
        .from('quotes')
        .select('quote_number, text, added_by, game, created_at')
        .eq('streamer_id', streamerId)
        .order('quote_number', { ascending: true });
      return json({ quotes: (data ?? []).map((q) => toApi(q as QuoteRow)) }, request, env);
    }
    if (method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as Record<string, any>;
      const text = String(body.text ?? '').trim().slice(0, 400);
      if (!text) return error('Quote text is required', 400, request, env);
      const game = body.game ? String(body.game).trim().slice(0, 80) : null;
      const { data, error: rpcErr } = await bot.rpc('add_quote', {
        p_streamer_id: streamerId,
        p_text: text,
        p_added_by: user.username ?? 'streamer',
        p_game: game,
      });
      if (rpcErr) return error('Could not add quote', 400, request, env);
      const number = Number(Array.isArray(data) ? data[0] : data);
      return json({ quote: { number, text, addedBy: user.username ?? 'streamer', game, createdAt: new Date().toISOString() } }, request, env, { status: 201 });
    }
    return error('Method not allowed', 405, request, env);
  }

  if (isNaN(num)) return error('Invalid quote number', 400, request, env);

  if (method === 'PATCH') {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const patch: Record<string, any> = {};
    if (Object.prototype.hasOwnProperty.call(body, 'text')) patch.text = String(body.text ?? '').trim().slice(0, 400);
    if (Object.prototype.hasOwnProperty.call(body, 'game')) patch.game = body.game ? String(body.game).trim().slice(0, 80) : null;
    if (!Object.keys(patch).length) return error('Nothing to update', 400, request, env);
    const { data } = await bot
      .from('quotes')
      .update(patch)
      .eq('streamer_id', streamerId)
      .eq('quote_number', num)
      .select('quote_number, text, added_by, game, created_at')
      .maybeSingle();
    if (!data) return error('Quote not found', 404, request, env);
    return json({ quote: toApi(data as QuoteRow) }, request, env);
  }

  if (method === 'DELETE') {
    const { data } = await bot.from('quotes').delete().eq('streamer_id', streamerId).eq('quote_number', num).select('quote_number');
    if (!data?.length) return error('Quote not found', 404, request, env);
    return json({ ok: true }, request, env);
  }

  return error('Method not allowed', 405, request, env);
}
