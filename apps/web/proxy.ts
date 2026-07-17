import { NextRequest, NextResponse } from 'next/server';

/**
 * emotes.creatorcastle.gg serves the standalone public emote vault (app/emotes-site)
 * from the same Next.js deploy as the dashboard (app.creatorcastle.gg) — routed by
 * hostname so it gets its own custom domain for SEO without a second deploy pipeline.
 */
export function proxy(req: NextRequest) {
  const host = req.headers.get('host') || '';
  if (!host.startsWith('emotes.')) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/emotes-site${url.pathname === '/' ? '' : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico).*)'],
};
