import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { encryptSensitive, encryptionKeySecret } from '../lib/crypto';
import { getCookie, isSecureRequest, serializeCookie } from '../lib/cookies';
import {
  createSessionToken,
  clearSessionCookie,
  getUserFromSession,
  getViewerFromSession,
  sessionCookie,
} from '../lib/session';
import { error, json } from '../lib/response';
import {
  buildAuthorizeUrl,
  buildStreamerSlug,
  exchangeCodeForToken,
  fetchTwitchUser,
  scopeToString,
  VIEWER_SCOPES,
  BOT_SCOPES,
} from '../lib/twitch';
import { storePlatformBot } from '../lib/platform-bot';
import { importTwitchFollowers } from './integrations';

const OAUTH_STATE_COOKIE = 'twitch_oauth_state';
const OAUTH_ROLE_COOKIE = 'twitch_oauth_role';
const OAUTH_RETURN_COOKIE = 'twitch_oauth_return';

/**
 * Sanitize a post-login return URL: only allow the configured frontend origin
 * (absolute) or a relative path (resolved against it). Prevents open redirects.
 */
function safeReturnUrl(env: Env, raw: string | null): string {
  const base = env.FRONTEND_URL;
  if (!raw) return `${base}/dashboard`;
  try {
    if (raw.startsWith('/')) return new URL(raw, base).toString();
    const u = new URL(raw);
    if (u.origin === new URL(base).origin) return u.toString();
  } catch {
    /* fall through */
  }
  return `${base}/dashboard`;
}

/**
 * Twitch OAuth + session routes. Adapted from the reference (TCG/mulistreamer-tcg),
 * but the Worker is backend-only: the callback runs here (token exchange + cookie)
 * then redirects to the Next.js frontend (env.FRONTEND_URL).
 *
 * Routes: GET /auth/twitch, GET /auth/callback, GET /api/auth/me, POST /api/auth/logout
 */
export async function handleAuth(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  // Prefer the configured public URL over the request origin: behind the Next
  // dev proxy / a wrangler custom_domain route, url.origin can resolve to the
  // production host, producing a redirect_uri that doesn't match the one
  // registered for this environment. PUBLIC_WORKER_URL is set per-env
  // (localhost:8787 in .dev.vars, https://api.creatorcastle.gg in prod).
  const workerOrigin = (env.PUBLIC_WORKER_URL || url.origin).replace(/\/$/, '');
  const redirectUri = `${workerOrigin}/auth/callback`;

  // --- Start OAuth ---
  if (method === 'GET' && path === '/auth/twitch') {
    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
      return new Response('Twitch OAuth not configured', { status: 503 });
    }
    const state = crypto.randomUUID();
    const forceVerify = url.searchParams.get('reauth') === '1';
    const authUrl = buildAuthorizeUrl(env, redirectUri, state, forceVerify);

    const headers = new Headers({ Location: authUrl });
    headers.append(
      'Set-Cookie',
      serializeCookie(OAUTH_STATE_COOKIE, state, {
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        secure: isSecureRequest(request),
        maxAge: 600,
      }),
    );
    return new Response(null, { status: 302, headers });
  }

  // --- Start OAuth as a VIEWER (play bingo, claim cards) ---
  // Identity-only login that does NOT provision a streamer/tenant. `return` is
  // where we redirect back to (e.g. the bingo play page).
  if (method === 'GET' && path === '/auth/viewer') {
    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
      return new Response('Twitch OAuth not configured', { status: 503 });
    }
    const state = crypto.randomUUID();
    const returnUrl = safeReturnUrl(env, url.searchParams.get('return'));
    const authUrl = buildAuthorizeUrl(env, redirectUri, state, false, VIEWER_SCOPES);

    const cookieOpts = {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax' as const,
      secure: isSecureRequest(request),
      maxAge: 600,
    };
    const headers = new Headers({ Location: authUrl });
    headers.append('Set-Cookie', serializeCookie(OAUTH_STATE_COOKIE, state, cookieOpts));
    headers.append('Set-Cookie', serializeCookie(OAUTH_ROLE_COOKIE, 'viewer', cookieOpts));
    headers.append('Set-Cookie', serializeCookie(OAUTH_RETURN_COOKIE, returnUrl, cookieOpts));
    return new Response(null, { status: 302, headers });
  }

  // --- Connect the dedicated platform bot account (operator only) ---
  if (method === 'GET' && path === '/auth/bot') {
    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
      return new Response('Twitch OAuth not configured', { status: 503 });
    }
    // Operator-only. Preferred: a setup secret, so seeding the bot needs no app
    // session — you just authorize while logged into Twitch as the bot account.
    // Falls back to the creator-session + owner check when no secret is set (dev).
    if (env.BOT_SETUP_SECRET) {
      if (url.searchParams.get('key') !== env.BOT_SETUP_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }
    } else {
      const me = await getUserFromSession(request, env, supabase);
      if (!me) return new Response('Log in first', { status: 401 });
      if (env.BOT_OWNER_TWITCH_ID && me.twitch_id !== env.BOT_OWNER_TWITCH_ID) {
        return new Response('Not authorized to connect the platform bot', { status: 403 });
      }
    }
    const state = crypto.randomUUID();
    // force_verify so the operator can pick the BOT account, not silently reuse
    // their own logged-in Twitch session.
    const authUrl = buildAuthorizeUrl(env, redirectUri, state, true, BOT_SCOPES);
    const cookieOpts = { path: '/', httpOnly: true, sameSite: 'Lax' as const, secure: isSecureRequest(request), maxAge: 600 };
    const headers = new Headers({ Location: authUrl });
    headers.append('Set-Cookie', serializeCookie(OAUTH_STATE_COOKIE, state, cookieOpts));
    headers.append('Set-Cookie', serializeCookie(OAUTH_ROLE_COOKIE, 'bot', cookieOpts));
    return new Response(null, { status: 302, headers });
  }

  // --- OAuth callback ---
  if (method === 'GET' && path === '/auth/callback') {
    const code = url.searchParams.get('code');
    const stateParam = url.searchParams.get('state');
    if (!code) return new Response('No code', { status: 400 });

    // CSRF: state must match the cookie set at /auth/twitch.
    const stateCookie = getCookie(request, OAUTH_STATE_COOKIE);
    if (!stateParam || !stateCookie || stateParam !== stateCookie) {
      return new Response('Invalid OAuth state', { status: 400 });
    }

    const tokenData = await exchangeCodeForToken(env, code, redirectUri);
    if (!tokenData.access_token) {
      console.error('[Auth/Callback] Token exchange failed');
      return new Response('Auth failed: no access token', { status: 401 });
    }

    const tUser = await fetchTwitchUser(env, tokenData.access_token);
    if (!tUser?.id) {
      console.error('[Auth/Callback] Helix user fetch failed');
      return new Response('Auth failed: no user', { status: 401 });
    }

    const role = getCookie(request, OAUTH_ROLE_COOKIE);

    // --- Platform bot branch: store the bot account's token, nothing else ---
    if (role === 'bot') {
      await storePlatformBot(
        env,
        supabase,
        { id: tUser.id, display_name: tUser.display_name },
        tokenData,
        scopeToString(tokenData.scope),
      );
      const headers = new Headers({ Location: `${env.FRONTEND_URL}/dashboard/integrations?bot=connected` });
      const clear = { path: '/', maxAge: 0, secure: isSecureRequest(request) };
      headers.append('Set-Cookie', serializeCookie(OAUTH_STATE_COOKIE, '', clear));
      headers.append('Set-Cookie', serializeCookie(OAUTH_ROLE_COOKIE, '', clear));
      return new Response(null, { status: 302, headers });
    }

    // --- Viewer login branch: identity only, no streamer/tenant provisioning ---
    if (role === 'viewer') {
      const { error: userErr } = await supabase.from('users').upsert(
        {
          twitch_id: tUser.id,
          username: tUser.display_name,
          avatar_url: tUser.profile_image_url,
          is_linked: true,
        },
        { onConflict: 'twitch_id' },
      );
      if (userErr) console.error('[Auth/Callback] viewer users upsert error:', userErr.message);

      const token = await createSessionToken(env, {
        twitch_id: tUser.id,
        username: tUser.display_name,
        is_creator: false,
      });
      const returnUrl = getCookie(request, OAUTH_RETURN_COOKIE) || `${env.FRONTEND_URL}/`;
      const headers = new Headers({ Location: returnUrl });
      headers.append('Set-Cookie', sessionCookie(request, env, token));
      const clear = { path: '/', maxAge: 0, secure: isSecureRequest(request) };
      headers.append('Set-Cookie', serializeCookie(OAUTH_STATE_COOKIE, '', clear));
      headers.append('Set-Cookie', serializeCookie(OAUTH_ROLE_COOKIE, '', clear));
      headers.append('Set-Cookie', serializeCookie(OAUTH_RETURN_COOKIE, '', clear));
      return new Response(null, { status: 302, headers });
    }

    // Encrypt the creator's Twitch tokens. CreatorCastle has its OWN Twitch app,
    // so these are stored in bot.tenants (NOT public.streamers.twitch_*, which is
    // bound to the TCG's client_id and owned by that product).
    const encKey = encryptionKeySecret(env);
    const encryptedAccess = await encryptSensitive(tokenData.access_token, encKey);
    const encryptedRefresh = tokenData.refresh_token
      ? await encryptSensitive(tokenData.refresh_token, encKey)
      : null;
    const tokenScope = scopeToString(tokenData.scope);
    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // 1. Shared identity: upsert public.users (collector/identity table).
    const { error: userErr } = await supabase.from('users').upsert(
      {
        twitch_id: tUser.id,
        username: tUser.display_name,
        avatar_url: tUser.profile_image_url,
        is_linked: true,
      },
      { onConflict: 'twitch_id' },
    );
    if (userErr) console.error('[Auth/Callback] users upsert error:', userErr.message);

    // 2. Creator identity in public.streamers. Only CREATE it if missing — never
    //    overwrite TCG-owned profile/token fields on an existing row.
    const { data: existingStreamer } = await supabase
      .from('streamers')
      .select('id')
      .eq('twitch_id', tUser.id)
      .maybeSingle();

    let streamerId = existingStreamer?.id as string | undefined;
    if (!streamerId) {
      const slug = buildStreamerSlug(tUser.display_name, tUser.id);
      const { data: inserted, error: streamerErr } = await supabase
        .from('streamers')
        .insert({
          twitch_id: tUser.id,
          username: slug,
          castle_code: slug,
          brand_name: tUser.display_name,
          display_name: tUser.display_name,
          avatar_url: tUser.profile_image_url,
        })
        .select('id')
        .single();
      if (streamerErr || !inserted) {
        console.error('[Auth/Callback] streamers insert error:', streamerErr?.message);
        return new Response('Auth failed: could not provision streamer', { status: 500 });
      }
      streamerId = inserted.id;
    } else if (tUser.profile_image_url) {
      // Keep the avatar fresh for existing rows (Twitch profile mirror — safe to refresh).
      await supabase.from('streamers').update({ avatar_url: tUser.profile_image_url }).eq('id', streamerId);
    }

    // 3. Provision/refresh the CreatorCastle channel config + creator token.
    const { error: tenantErr } = await botSchema(supabase).from('tenants').upsert(
      {
        streamer_id: streamerId,
        encrypted_creator_access_token: encryptedAccess,
        encrypted_creator_refresh_token: encryptedRefresh,
        creator_token_scope: tokenScope,
        creator_token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'streamer_id' },
    );
    if (tenantErr) console.error('[Auth/Callback] bot.tenants upsert error:', tenantErr.message);

    // 3b. Auto-backfill follower history in the background (no button needed).
    // Guarded so it only paginates Twitch once — skips if we already have
    // backfill rows. The Integrations button still force re-runs it.
    const creatorId = streamerId!;
    const broadcasterId = tUser.id;
    const accessToken = tokenData.access_token;
    ctx.waitUntil((async () => {
      const bot = botSchema(supabase);
      const { count } = await bot
        .from('event_logs')
        .select('id', { count: 'exact', head: true })
        .eq('streamer_id', creatorId)
        .eq('data->>source', 'twitch-backfill');
      if (!count) await importTwitchFollowers(bot, env, creatorId, accessToken, broadcasterId);
    })().catch((e) => console.error('[Auth/Callback] follower backfill failed:', (e as Error).message)));

    // 4. Issue the shared session cookie and redirect to the dashboard.
    const token = await createSessionToken(env, {
      twitch_id: tUser.id,
      username: tUser.display_name,
      is_creator: true,
    });

    const headers = new Headers({ Location: `${env.FRONTEND_URL}/dashboard` });
    headers.append('Set-Cookie', sessionCookie(request, env, token));
    // Clear the one-time state cookie.
    headers.append(
      'Set-Cookie',
      serializeCookie(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0, secure: isSecureRequest(request) }),
    );
    return new Response(null, { status: 302, headers });
  }

  // --- Current session ---
  if (method === 'GET' && path === '/api/auth/me') {
    const user = await getUserFromSession(request, env, supabase);
    if (!user) return error('Not authenticated', 401, request, env);
    return json({ ...user, is_creator: true }, request, env);
  }

  // --- Current VIEWER session (collector identity; any logged-in Twitch user) ---
  if (method === 'GET' && path === '/api/auth/viewer/me') {
    const viewer = await getViewerFromSession(request, env, supabase);
    if (!viewer) return error('Not authenticated', 401, request, env);
    return json({ ...viewer, is_creator: false }, request, env);
  }

  // --- Legacy /api/user/me shape (dashboard shell, onboarding, integrations) ---
  // tenantId == the streamer id in the shared-identity model.
  if (method === 'GET' && path === '/api/user/me') {
    const user = await getUserFromSession(request, env, supabase);
    if (!user) return error('Not authenticated', 401, request, env);
    const { data: streamer } = await supabase
      .from('streamers')
      .select('avatar_url, display_name')
      .eq('id', user.id)
      .maybeSingle();
    const { data: tenant } = await botSchema(supabase)
      .from('tenants')
      .select('is_connected, plan_tier, bot_username, target_channel')
      .eq('streamer_id', user.id)
      .maybeSingle();
    return json(
      {
        id: user.id,
        tenantId: user.id,
        twitchId: user.twitch_id,
        twitch_id: user.twitch_id,
        username: user.username,
        displayName: streamer?.display_name ?? user.username,
        avatar: streamer?.avatar_url ?? null,
        avatarUrl: streamer?.avatar_url ?? null,
        isConnected: tenant?.is_connected ?? false,
        planTier: tenant?.plan_tier ?? 'FREE',
        botUsername: tenant?.bot_username ?? null,
        targetChannel: tenant?.target_channel ?? null,
        is_creator: true,
      },
      request,
      env,
    );
  }

  // --- Logout (clears cookie + records shared logout for revocation) ---
  if (method === 'POST' && path === '/api/auth/logout') {
    const user = await getUserFromSession(request, env, supabase);
    if (user) {
      await supabase
        .from('users')
        .update({ last_logout_at: new Date().toISOString() })
        .eq('twitch_id', user.twitch_id);
    }
    return json({ ok: true }, request, env, {
      headers: { 'Set-Cookie': clearSessionCookie(request, env) },
    });
  }

  return null; // not an auth route
}
