import type { Env } from '../env';

/**
 * HTTP response helpers + CORS handling for the SPA frontend.
 *
 * The Next.js web app (apps/web) calls this Worker cross-origin with credentials,
 * so responses echo the configured frontend origin and allow credentials.
 */

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.FRONTEND_URL;
  // Echo the origin only when it matches the configured frontend (credentialed
  // requests cannot use a wildcard origin).
  const allowOrigin = origin && origin === allowed ? origin : allowed;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-csrf-token',
    Vary: 'Origin',
  };
}

/** Handle a CORS preflight (OPTIONS) request. */
export function handlePreflight(request: Request, env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

/** JSON response with CORS headers. Extra headers (e.g. Set-Cookie) can be merged in. */
export function json(
  body: unknown,
  request: Request,
  env: Env,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request, env),
      ...(init.headers ?? {}),
    },
  });
}

/**
 * JSON response for PUBLIC, cross-site reads (e.g. the browser extension running
 * on twitch.tv). Unlike {@link json}, this allows ANY origin and does NOT allow
 * credentials — these endpoints only return public cosmetic data, never anything
 * tied to the caller's session. Safe because there is no cookie/credential trust.
 */
export function publicJson(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'public, max-age=60',
      ...(init.headers ?? {}),
    },
  });
}

/** Standard JSON error response. */
export function error(
  message: string,
  status: number,
  request: Request,
  env: Env,
): Response {
  return json({ error: message }, request, env, { status });
}
