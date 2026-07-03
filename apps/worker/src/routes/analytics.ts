import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { error, json } from '../lib/response';

/**
 * Analytics for the Intel dashboard (apps/web/app/dashboard/intel). All series
 * are scoped to the authenticated streamer — the web sends `?tenantId=default`
 * but we intentionally ignore it and resolve identity from the session.
 *
 *   GET /api/analytics/commands   → [{ trigger, usages, enabled }]  (top first)
 *   GET /api/analytics/trends     → [{ hour, count }]  (last 24h, hourly buckets)
 *   GET /api/analytics/loyalty    → { totalUsers, sumXP, topViewers[] }
 */

/** Most XP rows we sum in-process. Channels above this are vanishingly rare at
 *  launch; the sum is then a (high) lower bound rather than wrong-by-default. */
const XP_SUM_CAP = 5000;

export async function handleAnalytics(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response | null> {
  if (method !== 'GET' || !path.startsWith('/api/analytics/')) return null;

  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const streamerId = user.id;
  const bot = botSchema(supabase);
  const sub = path.slice('/api/analytics/'.length).split('/')[0];

  try {
    // ── Command usage leaderboard ──────────────────────────────────────────
    if (sub === 'commands') {
      const { data } = await bot
        .from('commands')
        .select('trigger, usages, enabled')
        .eq('streamer_id', streamerId)
        .order('usages', { ascending: false })
        .limit(50);
      return json(
        (data ?? []).map((c: any) => ({ trigger: c.trigger, usages: c.usages ?? 0, enabled: !!c.enabled })),
        request,
        env,
      );
    }

    // ── 24h chat activity, bucketed by rolling hour ────────────────────────
    if (sub === 'trends') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const { data } = await bot
        .from('chat_logs')
        .select('timestamp')
        .eq('streamer_id', streamerId)
        .gte('timestamp', since.toISOString())
        .order('timestamp', { ascending: true })
        .limit(20000);

      // 24 buckets, oldest → newest, keyed by hours-ago.
      const buckets = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
      for (const row of data ?? []) {
        const ageMs = Date.now() - new Date(row.timestamp).getTime();
        const idx = 23 - Math.min(23, Math.floor(ageMs / (60 * 60 * 1000)));
        if (idx >= 0 && idx < 24) buckets[idx].count += 1;
      }
      return json(buckets, request, env);
    }

    // ── Loyalty summary ────────────────────────────────────────────────────
    if (sub === 'loyalty') {
      const [{ count }, { data: xpRows }, { data: top }] = await Promise.all([
        bot.from('viewer_profiles').select('id', { count: 'exact', head: true }).eq('streamer_id', streamerId),
        bot
          .from('viewer_profiles')
          .select('xp')
          .eq('streamer_id', streamerId)
          .order('xp', { ascending: false })
          .limit(XP_SUM_CAP),
        bot
          .from('viewer_profiles')
          .select('username, xp, level')
          .eq('streamer_id', streamerId)
          .order('xp', { ascending: false })
          .limit(10),
      ]);
      const sumXP = (xpRows ?? []).reduce((acc: number, r: any) => acc + (Number(r.xp) || 0), 0);
      return json(
        {
          totalUsers: count ?? 0,
          sumXP,
          topViewers: (top ?? []).map((v: any) => ({ username: v.username, xp: v.xp ?? 0, level: v.level ?? 1 })),
        },
        request,
        env,
      );
    }

    return error('Unknown analytics resource', 404, request, env);
  } catch (e) {
    console.error('[Analytics] query failed:', e);
    // Degrade gracefully so the dashboard renders empty rather than erroring.
    if (sub === 'loyalty') return json({ totalUsers: 0, sumXP: 0, topViewers: [] }, request, env, { status: 200 });
    return json([], request, env, { status: 200 });
  }
}
