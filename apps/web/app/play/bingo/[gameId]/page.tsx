'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { connectRealtime } from '@/lib/realtime';

const BASE = apiUrl('/api/integrations/bingo/public');

type Pattern = 'line' | 'double_line' | 'four_corners' | 'x' | 'full';
const PATTERN_LABELS: Record<Pattern, string> = {
  line: 'Complete any line',
  double_line: 'Complete two lines',
  four_corners: 'Mark the four corners',
  x: 'Mark both diagonals (X)',
  full: 'Fill the whole board',
};

interface Tile { id: string; label?: string; image?: string; count: number }
interface CardStyle {
  markStyle?: 'cross' | 'dot' | 'check' | 'star' | 'image';
  markColor?: string;
  markImage?: string;
  tileFont?: string;
  tileFontUrl?: string;
  tileTextColor?: string;
}
interface PublicGame {
  id: string;
  title: string;
  size: number;
  freeSpace: boolean;
  winCondition: Pattern;
  status: 'draft' | 'active' | 'ended';
  round?: number;
  reward?: string | null;
  reviewMode?: 'auto' | 'manual';
  cardStyle?: CardStyle;
  tiles: Tile[];
}
type Marks = Record<string, number>;
interface Card {
  id: string;
  cells: string[]; // tile ids
  marks: Marks;
  cardNumber: number;
  hasBingo: boolean;
  claimStatus: 'none' | 'pending' | 'invalid' | 'denied' | 'confirmed';
}
interface Entitlement {
  base: number; allowed: number; current: number; subTier: string | null;
  allowMultiple: boolean; channelPoints: { enabled: boolean; cost: number; cardsPerRedemption: number; maxPerUser: number };
}
interface Viewer { twitch_id: string; username: string }

// --- Win-pattern logic (client mirror, count-aware). Reveals nothing about calls. ---
function tileCount(tiles: Tile[], id: string): number {
  return tiles.find((t) => t.id === id)?.count ?? 1;
}
function completeFlags(cells: string[], tiles: Tile[], marks: Marks): boolean[] {
  return cells.map((cid, i) => cid === 'FREE' || Number(marks[String(i)] ?? 0) >= tileCount(tiles, cid));
}
function completedLines(m: boolean[], size: number): number {
  let n = 0;
  for (let r = 0; r < size; r++) {
    let row = true, col = true;
    for (let c = 0; c < size; c++) { if (!m[r * size + c]) row = false; if (!m[c * size + r]) col = false; }
    if (row) n++; if (col) n++;
  }
  let d = true, a = true;
  for (let i = 0; i < size; i++) { if (!m[i * size + i]) d = false; if (!m[i * size + (size - 1 - i)]) a = false; }
  if (d) n++; if (a) n++;
  return n;
}
function patternComplete(m: boolean[], size: number, p: Pattern): boolean {
  switch (p) {
    case 'full': return m.every(Boolean);
    case 'four_corners': return m[0] && m[size - 1] && m[size * (size - 1)] && m[size * size - 1];
    case 'x': { for (let i = 0; i < size; i++) if (!m[i * size + i] || !m[i * size + (size - 1 - i)]) return false; return true; }
    case 'double_line': return completedLines(m, size) >= 2;
    default: return completedLines(m, size) >= 1;
  }
}
function isWin(cells: string[], tiles: Tile[], marks: Marks, size: number, p: Pattern): boolean {
  return patternComplete(completeFlags(cells, tiles, marks), size, p);
}
function isOneAway(cells: string[], tiles: Tile[], marks: Marks, size: number, p: Pattern): boolean {
  if (isWin(cells, tiles, marks, size, p)) return false;
  const flags = completeFlags(cells, tiles, marks);
  for (let i = 0; i < cells.length; i++) {
    if (flags[i]) continue;
    const m2 = { ...marks, [String(i)]: tileCount(tiles, cells[i]) };
    if (isWin(cells, tiles, m2, size, p)) return true;
  }
  return false;
}

// --- Celebration (dependency-free) ---
function fireConfetti() {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const colors = ['#a855f7', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#ffffff'];
  const parts = Array.from({ length: 140 }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * 200, y: canvas.height / 3,
    vx: (Math.random() - 0.5) * 12, vy: Math.random() * -14 - 4,
    s: Math.random() * 6 + 4, c: colors[(Math.random() * colors.length) | 0],
    rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
  }));
  const start = performance.now();
  const tick = (t: number) => {
    const e = t - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach((p) => {
      p.vy += 0.3; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - e / 2200); ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); ctx.restore();
    });
    if (e < 2400) requestAnimationFrame(tick); else canvas.remove();
  };
  requestAnimationFrame(tick);
}
function playChime() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext; if (!AC) return;
    const ctx = new AC(); const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const at = now + i * 0.09;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45); o.start(at); o.stop(at + 0.5);
    });
  } catch { /* ignore */ }
}
function playClick() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext; if (!AC) return;
    const ctx = new AC(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'square'; o.frequency.value = 320; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.08, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    o.start(); o.stop(ctx.currentTime + 0.09);
  } catch { /* ignore */ }
}

export default function BingoPlayPage() {
  const params = useParams();
  const gameId = params.gameId as string;

  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [game, setGame] = useState<PublicGame | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimMsg, setClaimMsg] = useState<{ kind: 'ok' | 'warn' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const active = cards.find((c) => c.id === activeCardId) || cards[0] || null;
  const tiles = game?.tiles ?? [];
  const size = game?.size ?? 5;
  const pattern = (game?.winCondition ?? 'line') as Pattern;
  const style = game?.cardStyle ?? {};
  const manual = game?.reviewMode === 'manual';
  const won = active ? isWin(active.cells, tiles, active.marks, size, pattern) : false;
  const almost = active ? isOneAway(active.cells, tiles, active.marks, size, pattern) : false;

  const loginHref = `${apiUrl('/auth/viewer')}?return=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`;

  const loadCards = useCallback(async () => {
    const res = await fetch(`${BASE}/games/${gameId}/cards`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setCards(data.cards || []);
      setActiveCardId((prev) => prev ?? data.cards?.[0]?.id ?? null);
    }
  }, [gameId]);
  const loadEntitlement = useCallback(async () => {
    const res = await fetch(`${BASE}/games/${gameId}/entitlement`, { credentials: 'include' });
    if (res.ok) setEntitlement((await res.json()).entitlement);
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    (async () => {
      try {
        const gRes = await fetch(`${BASE}/games/${gameId}`);
        if (!gRes.ok) throw new Error(gRes.status === 404 ? 'Game not found' : 'Failed to load game');
        setGame((await gRes.json()).game);
        const meRes = await fetch(apiUrl('/api/auth/viewer/me'), { credentials: 'include' });
        if (meRes.ok) { setViewer(await meRes.json()); await Promise.all([loadCards(), loadEntitlement()]); }
      } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    })();
  }, [gameId, loadCards, loadEntitlement]);

  useEffect(() => {
    if (!gameId) return;
    return connectRealtime(`bingo:${gameId}`, (event, data) => {
      if (event === 'bingo.ended' || event === 'bingo.started') {
        setGame((g) => (g ? { ...g, status: event === 'bingo.ended' ? 'ended' : 'active' } : g));
      } else if (event === 'bingo.round') {
        setGame((g) => (g ? { ...g, status: 'active', round: data?.round ?? (g.round ?? 1) + 1 } : g));
        setClaimMsg(null); loadCards();
      } else if (event === 'bingo.grant') {
        loadEntitlement();
      } else if (event === 'bingo.winner' && data?.cardId) {
        setCards((prev) => prev.map((c) => (c.id === data.cardId ? { ...c, hasBingo: true, claimStatus: 'confirmed' } : c)));
        setActiveCardId((cur) => {
          if (cur === data.cardId) { fireConfetti(); playChime(); setClaimMsg({ kind: 'ok', text: '🎉 BINGO confirmed!' }); }
          return cur;
        });
      } else if (event === 'bingo.denied' && data?.cardId) {
        setCards((prev) => prev.map((c) => (c.id === data.cardId ? { ...c, claimStatus: 'none' } : c)));
        setActiveCardId((cur) => { if (cur === data.cardId) setClaimMsg({ kind: 'warn', text: 'Streamer didn’t approve it — keep playing.' }); return cur; });
      }
    });
  }, [gameId, loadCards, loadEntitlement]);

  const join = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${BASE}/games/${gameId}/join`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not get a card'); return; }
      await Promise.all([loadCards(), loadEntitlement()]);
      setActiveCardId(data.card.id);
    } finally { setBusy(false); }
  };

  const tapCell = async (index: number) => {
    if (!active || active.claimStatus === 'confirmed' || active.claimStatus === 'pending') return;
    if (active.cells[index] === 'FREE') return;
    const need = tileCount(tiles, active.cells[index]);
    const cur = Number(active.marks[String(index)] ?? 0);
    const next = cur + 1 > need ? 0 : cur + 1;
    const marks = { ...active.marks };
    if (next <= 0) delete marks[String(index)]; else marks[String(index)] = next;
    setCards((prev) => prev.map((c) => (c.id === active.id ? { ...c, marks } : c)));
    setClaimMsg(null); playClick();
    await fetch(`${BASE}/cards/${active.id}/mark`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ index }),
    }).catch(() => undefined);
  };

  const claim = async () => {
    if (!active) return;
    setBusy(true); setClaimMsg(null);
    try {
      const res = await fetch(`${BASE}/cards/${active.id}/claim`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (data.submitted) {
        setCards((prev) => prev.map((c) => (c.id === active.id ? { ...c, claimStatus: 'pending' } : c)));
        setClaimMsg({ kind: 'info', text: 'Submitted — waiting for the streamer to check it.' });
      } else if (data.valid) {
        setCards((prev) => prev.map((c) => (c.id === active.id ? { ...c, hasBingo: true, claimStatus: 'confirmed' } : c)));
        fireConfetti(); playChime(); setClaimMsg({ kind: 'ok', text: '🎉 BINGO confirmed!' });
      } else if (data.verifying) {
        setClaimMsg({ kind: 'info', text: data.reason || 'Bingo verifying…' });
      } else {
        setClaimMsg({ kind: 'warn', text: data.reason || 'Not a valid bingo yet' });
      }
    } finally { setBusy(false); }
  };

  if (loading) return <Centered><div className="w-12 h-12 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" /></Centered>;
  if (error && !game) return <Centered><p className="text-zinc-400 font-bold">{error}</p></Centered>;

  const markColor = style.markColor || '#9333ea';
  const pending = active?.claimStatus === 'pending';

  return (
    <div className="min-h-screen bg-[#070a10] text-white flex flex-col items-center px-4 py-8">
      {style.tileFont && style.tileFontUrl && (
        <style>{`@font-face{font-family:'${style.tileFont}';src:url('${style.tileFontUrl}');font-display:swap;}`}</style>
      )}
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-black text-center tracking-tight">{game?.title}</h1>
        <p className="text-center text-zinc-500 text-xs font-black uppercase tracking-[0.3em] mt-1">
          {(game?.round ?? 1) > 1 && <span className="text-purple-400">Round {game?.round} · </span>}
          {PATTERN_LABELS[pattern]}
        </p>
        {game?.reward && (
          <div className="mt-4 text-center px-4 py-3 rounded-2xl bg-amber-400/10 border border-amber-400/30">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-300/80">Prize</span>
            <p className="text-amber-200 font-bold mt-0.5">{game.reward}</p>
          </div>
        )}

        {!viewer ? (
          <div className="mt-10 glass-card rounded-3xl p-8 border border-white/10 space-y-5 text-center">
            <p className="text-zinc-400 font-bold">Log in with Twitch to get your card.</p>
            <a href={loginHref} className="inline-flex items-center justify-center w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 transition-colors font-black uppercase tracking-widest text-sm">
              Log in with Twitch
            </a>
            <p className="text-zinc-600 text-[10px]">One card per account — no anonymous farming.</p>
          </div>
        ) : game?.status !== 'active' && cards.length === 0 ? (
          <div className="mt-10 glass-card rounded-3xl p-8 border border-white/10 text-center text-zinc-400 font-bold">
            {game?.status === 'ended' ? 'This game has ended.' : 'Waiting for the creator to start…'}
          </div>
        ) : (
          <>
            <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500">
                {entitlement ? `${entitlement.current} / ${entitlement.allowed} cards` : `${cards.length} card(s)`}
                {entitlement?.subTier && <span className="text-purple-400"> · sub T{entitlement.subTier[0]}</span>}
              </span>
              {entitlement && entitlement.current < entitlement.allowed && game?.status === 'active' && (
                <button onClick={join} disabled={busy} className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-black uppercase tracking-widest">
                  {cards.length === 0 ? 'Generate my card' : '+ Another card'}
                </button>
              )}
            </div>

            {entitlement?.channelPoints?.enabled && entitlement.current >= entitlement.allowed && entitlement.current < entitlement.channelPoints.maxPerUser && (
              <p className="mt-2 text-center text-[10px] text-purple-300/70 font-bold">
                Redeem the channel-point reward ({entitlement.channelPoints.cost} pts) for another card.
              </p>
            )}

            {cards.length > 1 && (
              <div className="mt-4 flex gap-2 flex-wrap justify-center">
                {cards.map((c) => (
                  <button key={c.id} onClick={() => setActiveCardId(c.id)}
                    className={['px-3 py-1.5 rounded-lg text-xs font-black border transition-all',
                      c.id === active?.id ? 'bg-purple-600 border-purple-400' : 'bg-white/[0.04] border-white/10 text-zinc-400',
                      c.claimStatus === 'confirmed' ? 'ring-1 ring-emerald-400/60' : ''].join(' ')}>
                    Card {c.cardNumber}
                  </button>
                ))}
              </div>
            )}

            {claimMsg && (
              <div className={['mt-6 text-center py-4 rounded-2xl font-black text-lg uppercase tracking-[0.2em] border',
                claimMsg.kind === 'ok' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 animate-pulse'
                  : claimMsg.kind === 'info' ? 'bg-sky-500/10 border-sky-500/30 text-sky-200'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'].join(' ')}>
                {claimMsg.text}
              </div>
            )}

            {active && (
              <>
                <div className="mt-6 grid gap-2" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
                  {active.cells.map((cid, i) => {
                    const isFree = cid === 'FREE';
                    const tile = tiles.find((t) => t.id === cid);
                    const need = tile?.count ?? 1;
                    const have = Number(active.marks[String(i)] ?? 0);
                    const crossed = isFree || have >= need;
                    const partial = !isFree && have > 0 && have < need;
                    return (
                      <button key={i} onClick={() => tapCell(i)} disabled={isFree || pending || active.claimStatus === 'confirmed'}
                        className="relative aspect-square rounded-xl flex items-center justify-center text-center p-1 overflow-hidden text-[10px] sm:text-xs font-bold leading-tight transition-all select-none active:scale-90 border"
                        style={{
                          background: crossed ? markColor : 'rgba(255,255,255,0.04)',
                          borderColor: crossed ? markColor : partial ? `${markColor}99` : 'rgba(255,255,255,0.1)',
                          color: style.tileTextColor || (crossed ? '#fff' : '#d4d4d8'),
                          fontFamily: style.tileFont ? `'${style.tileFont}', sans-serif` : undefined,
                          boxShadow: crossed ? `0 0 12px ${markColor}66` : undefined,
                        }}>
                        {tile?.image ? (
                          <img src={tile.image} alt={tile.label || ''} className="absolute inset-0 w-full h-full object-cover" style={{ opacity: crossed ? 0.55 : 0.95 }} />
                        ) : (
                          <span className={crossed && !isFree ? 'opacity-80 relative z-10' : 'relative z-10'}>{isFree ? 'FREE' : tile?.label ?? cid}</span>
                        )}
                        {crossed && !isFree && <DaubMark style={style} />}
                        {partial && (
                          <span className="absolute bottom-0.5 right-1 z-20 text-[9px] font-black px-1 rounded bg-black/60" style={{ color: markColor }}>
                            {have}/{need}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <button onClick={claim} disabled={busy || pending || active.claimStatus === 'confirmed' || game?.status !== 'active'}
                  className={['mt-6 w-full py-4 rounded-2xl disabled:opacity-50 transition-all font-black uppercase tracking-[0.3em] text-sm',
                    active.claimStatus === 'confirmed' ? 'bg-emerald-600'
                      : pending ? 'bg-sky-700'
                        : won ? 'bg-purple-500 animate-pulse shadow-[0_0_28px_rgba(168,85,247,0.8)] scale-[1.02]'
                          : 'bg-purple-600 hover:bg-purple-500'].join(' ')}>
                  {active.claimStatus === 'confirmed' ? '✓ Winner'
                    : pending ? 'Submitted ✓'
                      : manual ? (won ? 'Submit for check' : 'Submit')
                        : won ? '🎉 BINGO!' : 'BINGO!'}
                </button>

                <p className="text-center text-[10px] font-black uppercase tracking-[0.3em] mt-4">
                  {active.claimStatus === 'confirmed' ? <span className="text-emerald-400">You won — nice!</span>
                    : pending ? <span className="text-sky-300">Waiting for the streamer…</span>
                      : won ? <span className="text-purple-300">{manual ? 'Looks complete — submit it!' : 'You’ve got it — press BINGO!'}</span>
                        : almost ? <span className="text-amber-400">One square to go!</span>
                          : <span className="text-zinc-600">Cross off your squares as they happen</span>}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DaubMark({ style }: { style: CardStyle }) {
  const s = style.markStyle || 'cross';
  if (s === 'image' && style.markImage) {
    return <img src={style.markImage} alt="" className="pointer-events-none absolute inset-0 m-auto w-3/5 h-3/5 object-contain z-20" />;
  }
  const glyph = s === 'dot' ? '●' : s === 'check' ? '✔' : s === 'star' ? '★' : '✕';
  return <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl text-white/90 z-20">{glyph}</span>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#070a10] flex items-center justify-center">{children}</div>;
}
