/**
 * Cookie + CSRF helpers.
 *
 * The Worker authenticates requests via a `session` JWT cookie (see session.ts)
 * and defends state-changing requests with a double-submit CSRF token.
 */

/** Parse a Cookie header into a name -> value map. */
export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('Cookie') || '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name) out[name] = part.slice(idx + 1).trim();
  }
  return out;
}

/** Read a single cookie value by name. */
export function getCookie(request: Request, name: string): string | undefined {
  return parseCookies(request)[name];
}

export interface CookieOptions {
  maxAge?: number;
  path?: string;
  domain?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/** Serialize a Set-Cookie string. `secure` defaults from the request scheme when given. */
export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${name}=${value}`];
  parts.push(`Path=${opts.path ?? '/'}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join('; ');
}

/** Whether the request was served over HTTPS (controls the Secure cookie flag). */
export function isSecureRequest(request: Request): boolean {
  return request.url.startsWith('https');
}

const CSRF_COOKIE_NAME = 'castle_csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

/** Issue a fresh random CSRF token + its Set-Cookie string (readable by the SPA). */
export function issueCsrfToken(request: Request): { token: string; setCookie: string } {
  const token = crypto.randomUUID();
  const setCookie = serializeCookie(CSRF_COOKIE_NAME, token, {
    path: '/',
    sameSite: 'Lax',
    secure: isSecureRequest(request),
    // Not HttpOnly: the SPA must read it to echo into the request header.
  });
  return { token, setCookie };
}

/** Double-submit verification: header token must match the cookie token. */
export function verifyCsrf(request: Request): boolean {
  const cookieToken = getCookie(request, CSRF_COOKIE_NAME);
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  return !!cookieToken && !!headerToken && cookieToken === headerToken;
}
