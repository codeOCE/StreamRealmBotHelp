import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { getUserFromSession } from '../lib/session';
import { error, json } from '../lib/response';
import { getIntegration, integrations, isIntegrationId } from './registry';
import { readEnabledMap, readIntegrationState, writeIntegrationState } from './config';

/**
 * Router for the integration module system.
 *
 *   GET   /api/integrations/catalog          public list of manifests
 *   GET   /api/integrations/<id>             { manifest, enabled, config }
 *   POST  /api/integrations/<id>/enable      enable for the streamer
 *   POST  /api/integrations/<id>/disable     disable for the streamer
 *   PATCH /api/integrations/<id>/config      { config } merge
 *   *     /api/integrations/<id>/<action>    delegated to the module's handle()
 *
 * Returns `null` when the path's first segment is not a registered integration
 * id, so `index.ts` can fall through to the legacy importer handler
 * (StreamElements / Nightbot) without either system clobbering the other.
 */
export async function handleIntegrationModules(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response | null> {
  const segments = path.replace(/^\/api\/integrations\/?/, '').split('/').filter(Boolean);
  const [head, ...rest] = segments;

  // Catalog of all manifests. Public, but when the request is authenticated we
  // attach the streamer's per-module `enabled` flag so the page can render toggles.
  if (head === 'catalog' && method === 'GET') {
    const user = await getUserFromSession(request, env, supabase).catch(() => null);
    const enabledMap = user ? await readEnabledMap(supabase, user.id) : {};
    return json(
      {
        integrations: integrations.map((i) => ({
          ...i.manifest,
          enabled: Boolean(enabledMap[i.manifest.id]),
        })),
      },
      request,
      env,
    );
  }

  // Not one of ours — let the legacy importer handler take it.
  if (!head || !isIntegrationId(head)) return null;

  const integration = getIntegration(head)!;

  // --- Viewer-facing public routes (no auth) ---
  if (rest[0] === 'public') {
    if (integration.handlePublic) {
      const res = await integration.handlePublic({
        request,
        env,
        supabase,
        segments: rest.slice(1),
        method,
      });
      if (res) return res;
    }
    return error('Not found', 404, request, env);
  }

  // Everything below is streamer-scoped.
  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const streamerId = user.id;
  const { id, defaultConfig } = integration.manifest;
  const state = await readIntegrationState(supabase, streamerId, id, defaultConfig);

  // --- Generic lifecycle ---
  if (rest.length === 0 && method === 'GET') {
    return json({ manifest: integration.manifest, ...state }, request, env);
  }
  if (rest[0] === 'enable' && method === 'POST') {
    const next = await writeIntegrationState(supabase, streamerId, id, { enabled: true });
    return json({ manifest: integration.manifest, ...next }, request, env);
  }
  if (rest[0] === 'disable' && method === 'POST') {
    const next = await writeIntegrationState(supabase, streamerId, id, { enabled: false });
    return json({ manifest: integration.manifest, ...next }, request, env);
  }
  if (rest[0] === 'config' && method === 'PATCH') {
    const body = (await request.json().catch(() => ({}))) as { config?: Record<string, any> };
    const next = await writeIntegrationState(supabase, streamerId, id, { config: body.config ?? {} });
    return json({ manifest: integration.manifest, ...next }, request, env);
  }

  // --- Module-specific actions ---
  if (integration.handle) {
    const res = await integration.handle({
      request,
      env,
      supabase,
      streamerId,
      segments: rest,
      method,
      config: state.config,
      enabled: state.enabled,
    });
    if (res) return res;
  }

  return error('Not found', 404, request, env);
}
