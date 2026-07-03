import type { SupabaseClient } from '@supabase/supabase-js';
import { botSchema } from '../lib/supabase';

/**
 * Per-streamer integration state storage.
 *
 * Mirrors the importer pattern (Nightbot/StreamElements) by living inside the
 * existing `bot.tenants.settings` JSONB, namespaced under
 * `settings.integrations.<id>` so each module owns an isolated slice:
 *
 *   settings.integrations.bingo = { enabled: true, config: { size: 5, ... } }
 *
 * No new table/migration is required to add an integration. Modules that
 * outgrow JSON (e.g. live game state, leaderboards) can graduate to their own
 * `bot.*` table later without changing this contract.
 */

export interface IntegrationState {
  enabled: boolean;
  config: Record<string, any>;
}

async function readAllSettings(
  supabase: SupabaseClient,
  streamerId: string,
): Promise<Record<string, any>> {
  const { data } = await botSchema(supabase)
    .from('tenants')
    .select('settings')
    .eq('streamer_id', streamerId)
    .maybeSingle();
  return (data?.settings ?? {}) as Record<string, any>;
}

async function writeAllSettings(
  supabase: SupabaseClient,
  streamerId: string,
  settings: Record<string, any>,
): Promise<void> {
  await botSchema(supabase)
    .from('tenants')
    .update({ settings, updated_at: new Date().toISOString() })
    .eq('streamer_id', streamerId);
}

/** Map of integration id -> enabled, for all modules the streamer has touched. */
export async function readEnabledMap(
  supabase: SupabaseClient,
  streamerId: string,
): Promise<Record<string, boolean>> {
  const settings = await readAllSettings(supabase, streamerId);
  const integrations = (settings.integrations ?? {}) as Record<string, any>;
  const map: Record<string, boolean> = {};
  for (const [id, slice] of Object.entries(integrations)) map[id] = Boolean(slice?.enabled);
  return map;
}

/** Read one module's state, merging manifest defaults under the stored config. */
export async function readIntegrationState(
  supabase: SupabaseClient,
  streamerId: string,
  id: string,
  defaultConfig: Record<string, unknown> = {},
): Promise<IntegrationState> {
  const settings = await readAllSettings(supabase, streamerId);
  const slice = settings.integrations?.[id] ?? {};
  return {
    enabled: Boolean(slice.enabled),
    config: { ...defaultConfig, ...(slice.config ?? {}) },
  };
}

/** Patch one module's state (shallow-merges over what's stored). */
export async function writeIntegrationState(
  supabase: SupabaseClient,
  streamerId: string,
  id: string,
  patch: Partial<IntegrationState>,
): Promise<IntegrationState> {
  const settings = await readAllSettings(supabase, streamerId);
  const integrations = settings.integrations ?? {};
  const current = integrations[id] ?? { enabled: false, config: {} };
  const next: IntegrationState = {
    enabled: patch.enabled ?? current.enabled ?? false,
    config: { ...(current.config ?? {}), ...(patch.config ?? {}) },
  };
  settings.integrations = { ...integrations, [id]: next };
  await writeAllSettings(supabase, streamerId, settings);
  return next;
}
