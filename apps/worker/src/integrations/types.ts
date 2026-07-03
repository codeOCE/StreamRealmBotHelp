import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';

/**
 * Integration module contract.
 *
 * An "integration" is a self-contained interactive feature a streamer can turn
 * on for their channel — bingo, a wheel spin, a rank command, or a standalone
 * product like the TCG. Each one lives in its own folder under
 * `src/integrations/<id>/` and exports a single {@link Integration} object as
 * the default export. The {@link registry} imports them all; the router
 * (`router.ts`) dispatches `/api/integrations/<id>/*` to the matching module.
 */

export type IntegrationCategory =
  | 'game' // bingo, wheel spin, predictions…
  | 'engagement' // polls, shoutouts, rank…
  | 'utility' // helpers, counters…
  | 'product'; // standalone products that plug in, e.g. the TCG

export interface IntegrationManifest {
  /** URL-safe unique id; also the route segment, e.g. `bingo`. */
  id: string;
  /** Display name for the catalog card. */
  name: string;
  /** One-line description for the catalog UI. */
  description: string;
  /** Lucide icon name or emoji rendered on the catalog card. */
  icon?: string;
  category: IntegrationCategory;
  /** Visible in the catalog but not yet enableable. */
  comingSoon?: boolean;
  /**
   * For `product` integrations hosted elsewhere (e.g. the TCG at
   * tcg.creatorcastle.gg): the catalog links out here instead of opening an
   * in-app config panel.
   */
  externalUrl?: string;
  /**
   * In-app dashboard route for configuring this integration, e.g.
   * `/dashboard/bingo`. The catalog renders a "Configure" link when set.
   */
  dashboardPath?: string;
  /** Config defaults merged in the first time a streamer enables the module. */
  defaultConfig?: Record<string, unknown>;
}

/** Everything a module handler needs to do its work for one request. */
export interface IntegrationContext {
  request: Request;
  env: Env;
  supabase: SupabaseClient;
  /** The authenticated streamer's id (= bot.tenants.streamer_id). */
  streamerId: string;
  /** Path segments after `/api/integrations/<id>`, e.g. ['spin']. */
  segments: string[];
  method: string;
  /** This module's persisted per-streamer config (manifest defaults merged). */
  config: Record<string, any>;
  /** Whether the streamer has enabled this module. */
  enabled: boolean;
}

/**
 * Context for unauthenticated public routes (under `/api/integrations/<id>/public/*`).
 * No session/streamer — these are viewer-facing (e.g. generating a bingo card).
 * The module resolves the relevant streamer from the path (e.g. a game id).
 */
export interface PublicIntegrationContext {
  request: Request;
  env: Env;
  supabase: SupabaseClient;
  /** Path segments after `/api/integrations/<id>/public`. */
  segments: string[];
  method: string;
}

export interface Integration {
  manifest: IntegrationManifest;
  /**
   * Optional handler for routes under `/api/integrations/<id>/*`. The router
   * handles the generic lifecycle (status / enable / disable / config) itself;
   * this is only for module-specific actions (e.g. `POST .../spin`). Return
   * `null` to fall through to a 404.
   */
  handle?: (ctx: IntegrationContext) => Promise<Response | null>;
  /**
   * Optional handler for viewer-facing routes under
   * `/api/integrations/<id>/public/*`. Runs WITHOUT authentication, so the
   * module must scope by an unguessable id from the path (e.g. a game UUID).
   */
  handlePublic?: (ctx: PublicIntegrationContext) => Promise<Response | null>;
}
