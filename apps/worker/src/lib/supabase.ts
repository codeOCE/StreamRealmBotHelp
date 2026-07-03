import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';

/**
 * Create a Supabase client scoped to the service-role key.
 *
 * The Worker is a trusted backend and performs its own authorization
 * (see lib/session.ts), so it uses the service-role key, which bypasses RLS.
 * RLS policies (migration 002) defend against direct anon-key access.
 *
 * This client targets the default `public` schema, where the SHARED identity
 * tables (streamers, users) live. For CreatorCastle's own tables, use
 * {@link botSchema} to reach the `bot` schema.
 *
 * Matches the reference pattern:
 *   const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
 */
export function createSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Scope a client to the `bot` schema (CreatorCastle's tables).
 *   botSchema(supabase).from('commands').select(...)
 * Requires `bot` to be in the project's Exposed Schemas (see README).
 */
export function botSchema(supabase: SupabaseClient) {
  return supabase.schema('bot');
}

export interface PublicOwner {
  name: string;
  handle: string | null;
  avatar: string | null;
  banner: string | null;
  color: string | null;
  tagline: string | null;
}

/**
 * Streamer branding for viewer-facing public pages (leaderboard, shop,
 * commands). Shared so the three public routes render identically.
 */
export async function getPublicOwner(supabase: SupabaseClient, streamerId: string): Promise<PublicOwner | null> {
  const { data: s } = await supabase
    .from('streamers')
    .select('username, display_name, avatar_url, banner_url, brand_color_primary, brand_tagline')
    .eq('id', streamerId)
    .maybeSingle();
  if (!s) return null;
  return {
    name: s.display_name || s.username,
    handle: s.username ?? null,
    avatar: s.avatar_url ?? null,
    banner: s.banner_url ?? null,
    color: s.brand_color_primary ?? null,
    tagline: s.brand_tagline ?? null,
  };
}
