import type { Env } from '../env';
import { botSchema } from './supabase';
import { decryptSensitive, encryptSensitive, encryptionKeySecret } from './crypto';

/**
 * Spotify integration for song requests. The creator connects their Spotify
 * account (OAuth, tokens encrypted in bot.tenants.settings.spotify); viewers
 * queue tracks with !sr and Spotify plays them on whatever device the creator
 * is already listening on — no embedded player to build or babysit.
 *
 * ponytail: queue-only v1. No request list widget, no per-viewer limits, no
 * skip votes — add on demand.
 */

export const SPOTIFY_SCOPES = 'user-modify-playback-state user-read-playback-state user-read-currently-playing';

export interface SpotifySettings {
  accessToken?: string; // encrypted
  refreshToken?: string; // encrypted
  expiresAt?: string; // ISO
  connectedAt?: string;
  /** Song requests on/off (default on once connected). */
  srEnabled?: boolean;
  /** Minimum user level for !sr: viewer | subscriber | moderator. */
  srLevel?: string;
}

export interface Track {
  uri: string;
  name: string;
  artist: string;
}

/** spotify:track:ID or open.spotify.com/track/ID (intl paths included) → ID. */
export function parseTrackId(input: string): string | null {
  const m =
    input.match(/spotify:track:([A-Za-z0-9]{22})/) ??
    input.match(/open\.spotify\.com\/(?:[a-z-]+\/)?track\/([A-Za-z0-9]{22})/);
  return m?.[1] ?? null;
}

async function refreshAccessToken(env: Env, refreshToken: string): Promise<{ access_token?: string; refresh_token?: string; expires_in?: number } | null> {
  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!resp.ok) return null;
  return (await resp.json()) as any;
}

/**
 * Valid access token for a streamer, refreshing (and persisting the rotation)
 * when expired. `settings` is the tenant settings object; mutated + saved on refresh.
 */
export async function getSpotifyAccessToken(
  env: Env,
  bot: ReturnType<typeof botSchema>,
  streamerId: string,
  settings: Record<string, any>,
): Promise<string | null> {
  const sp = settings.spotify as SpotifySettings | undefined;
  if (!sp?.accessToken || !env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return null;
  const encKey = encryptionKeySecret(env);

  if (sp.expiresAt && new Date(sp.expiresAt).getTime() > Date.now() + 30_000) {
    return decryptSensitive(sp.accessToken, encKey);
  }

  if (!sp.refreshToken) return null;
  const refreshed = await refreshAccessToken(env, await decryptSensitive(sp.refreshToken, encKey));
  if (!refreshed?.access_token) return null;

  sp.accessToken = await encryptSensitive(refreshed.access_token, encKey);
  if (refreshed.refresh_token) sp.refreshToken = await encryptSensitive(refreshed.refresh_token, encKey);
  sp.expiresAt = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();
  settings.spotify = sp;
  await bot.from('tenants').update({ settings, updated_at: new Date().toISOString() }).eq('streamer_id', streamerId);
  return refreshed.access_token;
}

const api = (token: string, path: string, init?: RequestInit) =>
  fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(5000),
  });

function toTrack(t: any): Track {
  return {
    uri: String(t.uri),
    name: String(t.name),
    artist: (t.artists ?? []).map((a: any) => a.name).join(', '),
  };
}

/** Resolve a query (free text or Spotify link) to a track. */
export async function findTrack(token: string, query: string): Promise<Track | null> {
  const id = parseTrackId(query);
  if (id) {
    const r = await api(token, `/tracks/${id}`);
    return r.ok ? toTrack(await r.json()) : null;
  }
  const r = await api(token, `/search?type=track&limit=1&q=${encodeURIComponent(query)}`);
  if (!r.ok) return null;
  const t = ((await r.json()) as any)?.tracks?.items?.[0];
  return t ? toTrack(t) : null;
}

/** Queue a track. 'no_device' when Spotify isn't playing anywhere. */
export async function queueTrack(token: string, uri: string): Promise<'ok' | 'no_device' | 'error'> {
  const r = await api(token, `/me/player/queue?uri=${encodeURIComponent(uri)}`, { method: 'POST' });
  if (r.ok || r.status === 204) return 'ok';
  if (r.status === 404) return 'no_device';
  return 'error';
}

/** Currently playing track, or null when nothing is playing. */
export async function currentTrack(token: string): Promise<Track | null> {
  const r = await api(token, '/me/player/currently-playing');
  if (r.status !== 200) return null;
  const body = (await r.json()) as any;
  return body?.item ? toTrack(body.item) : null;
}
