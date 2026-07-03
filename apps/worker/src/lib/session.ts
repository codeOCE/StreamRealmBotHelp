import { SignJWT, jwtVerify } from 'jose';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { devSessionUser, isDevSkipAuth } from './dev-auth';
import { getCookie, isSecureRequest, serializeCookie } from './cookies';

/**
 * Session management, ported from the reference (TCG/mulistreamer-tcg).
 *
 * Creator Castle is a shared-identity platform: the `session` cookie holds an
 * HS256 JWT (signed with the SHARED SESSION_SECRET, so the cookie works across
 * *.creatorcastle.gg) whose `sub` is the user's Twitch ID.
 *
 * CreatorCastle's dashboard user is a STREAMER, so identity resolves against the
 * shared `public.streamers` table. Sessions can be revoked via the shared
 * `public.users.last_logout_at`: a token issued before that timestamp is rejected.
 */

export const SESSION_COOKIE_NAME = 'session';
export const SESSION_MAX_AGE_SEC = 2_592_000; // 30 days
export const SESSION_RENEW_THRESHOLD_SEC = 1_296_000; // renew when < 15 days remain

/** Authenticated streamer shape returned from the session lookup. */
export interface SessionUser {
  /** public.streamers.id (UUID) */
  id: string;
  twitch_id: string;
  username: string;
}

/**
 * Authenticated VIEWER shape — a logged-in Twitch user resolved against the
 * shared collector identity table (public.users), NOT public.streamers. Used by
 * viewer-facing integration routes (e.g. claiming a bingo card) so a viewer
 * can't farm cards anonymously. A viewer need not be a Creator Castle streamer.
 */
export interface ViewerUser {
  twitch_id: string;
  username: string;
}

function secret(env: Env): Uint8Array {
  return new TextEncoder().encode(env.SESSION_SECRET);
}

/** Sign a new 30-day session JWT for the given user. */
export async function createSessionToken(
  env: Env,
  user: { twitch_id: string; username: string; is_creator?: boolean },
): Promise<string> {
  return new SignJWT({ twitch_id: user.twitch_id, username: user.username, is_creator: !!user.is_creator })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.twitch_id))
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret(env));
}

/** Build the Set-Cookie string carrying a session token. */
export function sessionCookie(request: Request, env: Env, token: string): string {
  return serializeCookie(SESSION_COOKIE_NAME, token, {
    path: '/',
    domain: env.COOKIE_DOMAIN,
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(request),
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

/** Build the Set-Cookie string that clears the session (logout). */
export function clearSessionCookie(request: Request, env: Env): string {
  return serializeCookie(SESSION_COOKIE_NAME, '', {
    path: '/',
    domain: env.COOKIE_DOMAIN,
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(request),
    maxAge: 0,
  });
}

/**
 * Dev bypass: resolve the real public.streamers row by twitch_id so bot.* FKs
 * (commands, overlays, …) use a valid streamer_id — not a stale hardcoded UUID.
 */
async function resolveDevSessionUser(env: Env, supabase: SupabaseClient): Promise<SessionUser> {
  const dev = devSessionUser(env);
  const { data: streamer, error } = await supabase
    .from('streamers')
    .select('id, twitch_id, username')
    .eq('twitch_id', dev.twitch_id)
    .maybeSingle();

  if (error) {
    console.error('[Auth] Dev bypass streamer lookup failed:', error.message);
  }

  if (streamer) {
    return {
      id: streamer.id,
      twitch_id: streamer.twitch_id,
      username: streamer.username ?? dev.username,
    };
  }

  console.warn(
    `[Auth] Dev bypass: no streamers row for twitch_id ${dev.twitch_id}. ` +
      'Commands/overlays may fail FK checks until you log in via Twitch once.',
  );
  return dev;
}

/**
 * Verify the `session` cookie and load the streamer from Supabase.
 * Returns null when there is no valid, non-revoked session, or when the
 * authenticated Twitch user is not a Creator Castle streamer.
 * Mirrors the reference's getUserFromSession(request, env, supabase).
 */
export async function getUserFromSession(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
): Promise<SessionUser | null> {
  if (isDevSkipAuth(env)) return resolveDevSessionUser(env, supabase);

  const token = getCookie(request, SESSION_COOKIE_NAME);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret(env));
    const twitchId = payload.sub || (payload as Record<string, unknown>).twitch_id;
    if (!twitchId) return null;
    const tid = String(twitchId).trim();

    // Identity = the streamer (creator) account in the shared schema.
    const { data: streamer, error } = await supabase
      .from('streamers')
      .select('id, twitch_id, username')
      .eq('twitch_id', tid)
      .single();

    if (error || !streamer) {
      if (error) console.error('[Auth] DB error in getUserFromSession:', error.message);
      return null;
    }

    // Shared session revocation: reject tokens issued before the user's last
    // logout. Guarded — tolerate absence of the column/row in the shared DB.
    if (payload.iat) {
      const { data: u } = await supabase
        .from('users')
        .select('last_logout_at')
        .eq('twitch_id', tid)
        .maybeSingle();
      if (u?.last_logout_at) {
        const logoutTime = Math.floor(new Date(u.last_logout_at).getTime() / 1000);
        if (payload.iat < logoutTime) return null;
      }
    }

    return { id: streamer.id, twitch_id: streamer.twitch_id, username: streamer.username };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code !== 'ERR_JWT_EXPIRED') {
      console.error('[Auth] JWT verification failed:', err.message);
    }
    return null;
  }
}

/**
 * Verify the `session` cookie and resolve the VIEWER (collector) identity from
 * public.users. Unlike {@link getUserFromSession}, this does not require the user
 * to be a streamer — any logged-in Twitch account is a valid viewer. Returns null
 * when there's no valid/non-revoked session or the user isn't in public.users.
 */
export async function getViewerFromSession(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
): Promise<ViewerUser | null> {
  const token = getCookie(request, SESSION_COOKIE_NAME);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret(env));
    const twitchId = payload.sub || (payload as Record<string, unknown>).twitch_id;
    if (!twitchId) return null;
    const tid = String(twitchId).trim();

    const { data: user, error } = await supabase
      .from('users')
      .select('twitch_id, username, last_logout_at')
      .eq('twitch_id', tid)
      .maybeSingle();
    if (error || !user) return null;

    // Shared session revocation.
    if (payload.iat && user.last_logout_at) {
      const logoutTime = Math.floor(new Date(user.last_logout_at).getTime() / 1000);
      if ((payload.iat as number) < logoutTime) return null;
    }

    return { twitch_id: user.twitch_id, username: user.username };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code !== 'ERR_JWT_EXPIRED') {
      console.error('[Auth] Viewer JWT verification failed:', err.message);
    }
    return null;
  }
}

/** Decode a JWT payload without re-verifying (safe after getUserFromSession). */
function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

/**
 * If the current session has less than SESSION_RENEW_THRESHOLD_SEC remaining,
 * issue a fresh token and return its Set-Cookie string. Otherwise null.
 */
export async function maybeRenewSession(
  request: Request,
  env: Env,
  user: { twitch_id: string; username: string },
): Promise<string | null> {
  const token = getCookie(request, SESSION_COOKIE_NAME);
  if (!token) return null;
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return null;
  const remaining = (payload.exp as number) - Math.floor(Date.now() / 1000);
  if (remaining > SESSION_RENEW_THRESHOLD_SEC) return null;

  const newToken = await createSessionToken(env, user);
  return sessionCookie(request, env, newToken);
}
