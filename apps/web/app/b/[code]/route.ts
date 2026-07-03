import { NextResponse } from 'next/server';

// Short bingo share links: /b/<code> -> /play/bingo/<gameId>.
// Worker origin mirrors next.config.ts — rewrites don't apply to server-side
// fetches from a route handler, so we hit the API worker directly.
const WORKER =
  process.env.WORKER_DEV_URL ??
  (process.env.NODE_ENV === 'production' ? 'https://api.creatorcastle.gg' : 'http://localhost:8787');

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    const res = await fetch(`${WORKER}/api/integrations/bingo/public/resolve/${encodeURIComponent(code)}`);
    if (res.ok) {
      const { gameId } = (await res.json()) as { gameId?: string };
      if (gameId) return NextResponse.redirect(new URL(`/play/bingo/${gameId}`, req.url));
    }
  } catch {
    /* fall through to home */
  }
  return NextResponse.redirect(new URL('/', req.url));
}
