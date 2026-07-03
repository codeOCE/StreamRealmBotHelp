import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { error, json } from '../lib/response';

/**
 * Onboarding checklist — ported from the NestJS OnboardingController/Service
 * (apps/api/src/dashboard/onboarding.*). Row lives in bot.onboarding (1:1 with
 * streamer). The URL :tenantId is the streamer id; we always use the session's
 * streamer, so the param is informational.
 *
 * Routes (under /api/dashboard/onboarding):
 *   GET  /:tenantId          status (+ auto-detect from commands/mod/connection)
 *   POST /:tenantId/:step    mark a step complete
 */

const STEP_FLAGS: Record<string, string> = {
  linked_bot: 'has_linked_bot',
  created_command: 'has_created_command',
  enabled_moderation: 'has_enabled_moderation',
  visited_dashboard: 'has_visited_dashboard',
  imported_commands: 'has_imported_commands',
};

export async function handleOnboarding(
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
  const seg = path.slice('/api/dashboard/onboarding'.length).replace(/^\//, '').split('/').filter(Boolean);

  // Ensure the row exists.
  async function getRow() {
    const { data } = await bot.from('onboarding').select('*').eq('streamer_id', streamerId).maybeSingle();
    if (data) return data;
    const { data: created } = await bot
      .from('onboarding')
      .insert({ streamer_id: streamerId })
      .select('*')
      .single();
    return created;
  }

  // POST /:tenantId/:step
  if (method === 'POST' && seg.length === 2) {
    const flag = STEP_FLAGS[seg[1]];
    if (!flag) return json({ ok: true }, request, env);
    await getRow();
    await bot.from('onboarding').update({ [flag]: true }).eq('streamer_id', streamerId);
    return json({ ok: true }, request, env);
  }

  // GET /:tenantId
  if (method === 'GET' && seg.length === 1) {
    let row = await getRow();

    // Auto-detect completed steps from live data.
    const updates: Record<string, boolean> = {};
    if (!row.has_linked_bot) {
      const { data: tenant } = await bot.from('tenants').select('is_connected').eq('streamer_id', streamerId).maybeSingle();
      if (tenant?.is_connected) updates.has_linked_bot = true;
    }
    if (!row.has_created_command) {
      const { count } = await bot
        .from('commands')
        .select('id', { count: 'exact', head: true })
        .eq('streamer_id', streamerId)
        .eq('is_built_in', false);
      if ((count ?? 0) > 0) updates.has_created_command = true;
    }
    if (!row.has_enabled_moderation) {
      const { count } = await bot
        .from('mod_rules')
        .select('id', { count: 'exact', head: true })
        .eq('streamer_id', streamerId)
        .eq('enabled', true);
      if ((count ?? 0) > 0) updates.has_enabled_moderation = true;
    }
    if (Object.keys(updates).length > 0) {
      const { data: updated } = await bot
        .from('onboarding')
        .update(updates)
        .eq('streamer_id', streamerId)
        .select('*')
        .single();
      if (updated) row = updated;
    }

    const steps = [
      { key: 'linked_bot', completed: row.has_linked_bot, label: 'Initialize Sentinel Presence' },
      { key: 'created_command', completed: row.has_created_command, label: 'Authorize Custom Command' },
      { key: 'enabled_moderation', completed: row.has_enabled_moderation, label: 'Activate Neural Filters' },
      { key: 'imported_commands', completed: row.has_imported_commands, label: 'Legacy Protocol Migration' },
    ];
    const completedCount = steps.filter((s) => s.completed).length;
    const progress = Math.round((completedCount / steps.length) * 100);
    return json({ steps, progress, completed: progress === 100 }, request, env);
  }

  return error('Not found', 404, request, env);
}
