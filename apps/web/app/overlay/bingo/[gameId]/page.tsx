'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { connectRealtime } from '@/lib/realtime';

const BASE = apiUrl('/api/integrations/bingo/public');

interface Winner { id: string; name: string; bingoAt?: string }
interface Tile { id: string; label?: string; image?: string; count: number }
interface Call { id: string; label: string; image?: string | null }

const PATTERN_LABEL: Record<string, string> = {
  line: 'Any line',
  double_line: 'Two lines',
  four_corners: 'Four corners',
  x: 'X — both diagonals',
  full: 'Full board',
};

/**
 * OBS browser-source overlay for a bingo game. Transparent background. Shows the
 * win pattern, players online, the called-tile ticker (with the newest call
 * popped), and a live winners feed. Add as a browser source pointing at
 * /overlay/bingo/<gameId>.
 */
export default function BingoOverlayPage() {
  const params = useParams();
  const gameId = params.gameId as string;

  const [title, setTitle] = useState('');
  const [pattern, setPattern] = useState('line');
  const [round, setRound] = useState(1);
  const [reward, setReward] = useState<string | null>(null);
  const [callCount, setCallCount] = useState(0);
  const [recentCalls, setRecentCalls] = useState<Call[]>([]);
  const [players, setPlayers] = useState(0);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [board, setBoard] = useState<{ rank: number; name: string; points: number }[]>([]);
  const [latest, setLatest] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const tilesRef = useRef<Map<string, Tile>>(new Map());
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`${BASE}/games/${gameId}/board`);
    if (!res.ok) return;
    const data = await res.json();
    setTitle(data.game.title);
    setPattern(data.game.winCondition || 'line');
    setRound(data.game.round || 1);
    setReward(data.reward ?? null);
    setCallCount(data.calls || 0);
    setRecentCalls(data.recentCalls || []);
    setPlayers(data.players || 0);
    setWinners(data.winners || []);
    setBoard(data.leaderboard || []);
    tilesRef.current = new Map((data.game.tiles || []).map((t: Tile) => [t.id, t]));
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    load();
    return connectRealtime(`bingo:${gameId}`, (event, data) => {
      if (event === 'bingo.called') {
        const ids: string[] = data?.called || [];
        setCallCount(ids.length);
        setRecentCalls(
          [...ids].reverse().slice(0, 8).map((cid) => {
            const t = tilesRef.current.get(cid);
            return { id: cid, label: t?.label ?? cid, image: t?.image ?? null };
          }),
        );
        if (data?.action === 'call' && data?.tileId) {
          const t = tilesRef.current.get(data.tileId);
          setLatest(t?.label ?? data.tileId);
          setTimeout(() => setLatest(null), 4500);
        }
      } else if (event === 'bingo.reset') {
        setCallCount(0);
        setRecentCalls([]);
      } else if (event === 'bingo.joined') {
        if (typeof data?.players === 'number') setPlayers(data.players);
      } else if (event === 'bingo.round') {
        setRound(data?.round ?? round + 1);
        setCallCount(0);
        setRecentCalls([]);
        setWinners([]);
        load(); // refresh board/players for the new round
      } else if (event === 'bingo.winner') {
        setWinners((prev) => (prev.some((w) => w.id === data.cardId) ? prev : [...prev, { id: data.cardId, name: data.name }]));
        setCelebrate(data.name);
        if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
        celebrateTimer.current = setTimeout(() => setCelebrate(null), 8000);
        setTimeout(load, 600); // points changed — refresh the leaderboard
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, load]);

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden flex items-start justify-end p-6 font-[system-ui]">
      <div className="w-[360px] rounded-3xl bg-black/55 backdrop-blur-md border border-white/10 p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <h1 className="text-white font-black text-lg tracking-tight truncate">{title || 'Bingo'}</h1>
          <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/90 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> {players} playing
          </span>
        </div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-300/80">
            {round > 1 && <span className="text-purple-200">R{round} · </span>}
            {PATTERN_LABEL[pattern] ?? 'Any line'}
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{callCount} called</span>
        </div>

        {reward && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-200 text-xs font-bold text-center truncate">
            🎁 {reward}
          </div>
        )}

        {latest && (
          <div className="mb-4 px-4 py-3 rounded-2xl bg-purple-600 text-white font-black text-center uppercase tracking-wide animate-in zoom-in-95 fade-in duration-300">
            {latest}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {recentCalls.length === 0 ? (
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest py-2">Waiting for calls…</p>
          ) : (
            recentCalls.map((c, i) => (
              <span
                key={`${c.id}-${i}`}
                className={[
                  'px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5',
                  i === 0
                    ? 'bg-purple-500/30 border border-purple-400/50 text-white'
                    : 'bg-white/10 border border-white/10 text-white/90',
                ].join(' ')}
              >
                {c.image && <img src={c.image} alt="" className="w-4 h-4 rounded object-cover" />}
                {c.label}
              </span>
            ))
          )}
        </div>

        {/* Winners feed */}
        {winners.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300/80 mb-2">
              Winners ({winners.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {winners.slice(0, 8).map((w, i) => (
                <span
                  key={w.id}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-black"
                >
                  {i === 0 && '🏆 '}{w.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Season standings */}
        {board.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300/80 mb-2">Season leaders</p>
            <div className="space-y-1">
              {board.slice(0, 5).map((r) => (
                <div key={r.rank} className="flex items-center gap-2 text-xs">
                  <span className="w-5 text-center">{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank}</span>
                  <span className="flex-1 font-bold text-white/90 truncate">{r.name}</span>
                  <span className="font-black text-amber-300 tabular-nums">{r.points}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {celebrate && (
          <div className="mt-4 px-4 py-3 rounded-2xl bg-emerald-500/25 border border-emerald-400/40 text-emerald-200 font-black text-center uppercase tracking-wide animate-in slide-in-from-bottom-2 fade-in duration-300">
            🏆 {celebrate} got bingo!
          </div>
        )}
      </div>
    </div>
  );
}
