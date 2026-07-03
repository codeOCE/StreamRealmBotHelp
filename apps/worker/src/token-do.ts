import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { createSupabaseClient } from './lib/supabase';
import { getCreatorToken } from './lib/creator-chat';

/**
 * Per-streamer token broker.
 *
 * Twitch confidential-client refresh tokens ROTATE — each successful refresh
 * returns a new refresh token and invalidates the old one. With no shared lock,
 * two concurrent requests both refreshing the same creator can invalidate each
 * other's token and brick the streamer until they re-auth (see ADR-0001).
 *
 * Routing all token fetches for a streamer through this DO (keyed by streamerId
 * via getByName) serializes them: one DO instance globally, single-threaded, so
 * concurrent getToken() calls coalesce onto one in-flight refresh. A short
 * memory cache absorbs bursts (e.g. the timer sweep firing several timers for
 * one channel) without re-hitting the DB each time.
 */

export interface CreatorCreds {
  token: string;
  broadcasterId: string;
}

/** Coalesce window — long enough to absorb a burst, far shorter than token TTL. */
const CACHE_MS = 120_000;

export class CreatorTokenDO extends DurableObject<Env> {
  private inflight: Promise<CreatorCreds | null> | null = null;
  private cache: { creds: CreatorCreds; expiresAt: number } | null = null;

  /** Get valid creator creds, refreshing once even under concurrent callers. */
  async getToken(streamerId: string): Promise<CreatorCreds | null> {
    if (this.cache && Date.now() < this.cache.expiresAt) return this.cache.creds;
    if (this.inflight) return this.inflight;
    this.inflight = this.load(streamerId).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async load(streamerId: string): Promise<CreatorCreds | null> {
    const supabase = createSupabaseClient(this.env);
    const creds = await getCreatorToken(supabase, this.env, streamerId);
    if (creds) this.cache = { creds, expiresAt: Date.now() + CACHE_MS };
    return creds;
  }
}

/**
 * Fetch creator creds through the per-streamer token DO (race-safe). Prefer this
 * over calling getCreatorToken() directly anywhere two requests for the same
 * streamer can overlap (timer sweep, chat announce, webhook handlers).
 */
export function getCreatorCreds(env: Env, streamerId: string): Promise<CreatorCreds | null> {
  return env.TOKENS.getByName(streamerId).getToken(streamerId);
}
