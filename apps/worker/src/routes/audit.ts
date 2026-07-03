import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { error, json } from '../lib/response';

/**
 * Moderation / activity audit feed for the Sentinel dashboard
 * (apps/web/app/dashboard/sentinel). Reads bot.audit_logs, which the chat
 * pipeline writes on every mod action and command mutation. Scoped to the
 * authenticated streamer; `?tenantId=` is ignored in favour of the session.
 *
 *   GET /api/audit?limit=50  → [{ id, action, actor, target, metadata, createdAt }]
 */
export async function handleAudit(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response | null> {
  if (path !== '/api/audit' || method !== 'GET') return null;

  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));

  try {
    const { data } = await botSchema(supabase)
      .from('audit_logs')
      .select('id, action, actor, target, metadata, created_at')
      .eq('streamer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    return json(
      (data ?? []).map((r: any) => ({
        id: r.id,
        action: r.action,
        actor: r.actor,
        target: r.target ?? undefined,
        metadata: r.metadata ?? {},
        createdAt: r.created_at,
      })),
      request,
      env,
    );
  } catch (e) {
    console.error('[Audit] query failed:', e);
    return json([], request, env, { status: 200 });
  }
}
