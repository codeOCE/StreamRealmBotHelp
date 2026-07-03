'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { PublicNav } from '@/components/public/PublicNav';

interface RankedViewer {
  username: string;
  level: number;
  points: number;
  xp: number;
}
interface Owner {
  name: string;
  handle: string | null;
  avatar: string | null;
  banner: string | null;
  color: string | null;
  tagline: string | null;
}
interface LoyaltyInfo {
  currencyName: string;
  pointsPerInterval: number;
  intervalMinutes: number;
  subMultiplier: number;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Viewer-facing points leaderboard. Identity card (avatar, handle, real
 * earn-rate from loyalty settings) + a ranked table, matching the public
 * shop page's brand-first layout. Read-only; points are earned by chatting.
 * Share link is `/leaderboard/<streamerId>`.
 */
export default function PublicLeaderboardPage() {
  const { streamerId } = useParams<{ streamerId: string }>();
  const [viewers, setViewers] = useState<RankedViewer[]>([]);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!streamerId) return;
    fetch(apiUrl(`/api/loyalty/public/${streamerId}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setViewers(Array.isArray(d?.viewers) ? d.viewers : []);
        setOwner(d?.owner ?? null);
        setLoyalty(d?.loyalty ?? null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [streamerId]);

  const accent = owner?.color || '#3faaff';
  const currency = loyalty?.currencyName || 'Points';

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Banner ── */}
      <div className="h-32 md:h-40 w-full overflow-hidden bg-surface-bright">
        {owner?.banner
          ? <img src={owner.banner} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full" style={{ background: `linear-gradient(120deg, ${accent}22, transparent 60%), var(--color-surface-bright)` }} />}
      </div>

      <main className="max-w-5xl mx-auto px-6 -mt-10 pb-24">
        <div className="grid md:grid-cols-[260px_1fr] gap-6 items-start">
          {/* ── Identity card ── */}
          <div className="glass-card rounded-2xl p-5 md:sticky md:top-6">
            <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-surface-base mb-4" style={{ border: `2px solid ${accent}` }}>
              {owner?.avatar
                ? <img src={owner.avatar} alt={owner.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-2xl" style={{ background: `${accent}1a` }}>🏆</div>}
            </div>
            <h1 className="text-xl font-black tracking-tight text-white font-display truncate">
              {loading ? ' ' : (owner?.name ?? 'Leaderboard')}
            </h1>
            {owner?.handle && <p className="text-xs text-zinc-500 font-medium truncate mt-0.5">twitch.tv/{owner.handle}</p>}
            {owner?.tagline && <p className="text-xs text-brand-muted font-medium mt-2 leading-relaxed">{owner.tagline}</p>}

            {loyalty && (
              <div className="mt-4 pt-4 border-t border-white/5 space-y-1.5 text-xs text-zinc-400 font-medium leading-relaxed">
                <p>
                  Earn <span className="font-black text-white">{loyalty.pointsPerInterval}</span> {currency} every{' '}
                  <span className="font-black text-white">{loyalty.intervalMinutes}</span> minutes
                </p>
                {loyalty.subMultiplier > 1 && (
                  <p>Subscribers earn <span className="font-black text-white">{loyalty.subMultiplier}x</span> points</p>
                )}
              </div>
            )}

            <PublicNav streamerId={String(streamerId)} handle={owner?.handle} active="leaderboard" accent={accent} />
          </div>

          {/* ── Leaderboard ── */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-white/5">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-300">Leaderboard</h2>
              <p className="text-xs text-zinc-500 font-medium mt-1">Top viewers in the community, ranked by {currency.toLowerCase()}.</p>
            </div>

            {loading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-4 py-2">
                    <div className="h-4 w-6 skeleton rounded" />
                    <div className="h-4 w-1/3 skeleton rounded" />
                    <div className="h-4 w-16 skeleton rounded ml-auto" />
                  </div>
                ))}
              </div>
            ) : viewers.length === 0 ? (
              <div className="py-24 text-center">
                <p className="text-zinc-500 font-medium text-sm">No one on the board yet — start chatting to earn {currency.toLowerCase()}.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-600 w-16">Position</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-600">Username</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-600 text-right">{currency}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {viewers.map((v, i) => (
                    <tr key={v.username + i} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-3.5 text-xs font-black text-zinc-500 tabular-nums">#{i + 1}</td>
                      <td className="px-6 py-3.5">
                        <span className="font-bold text-white text-sm">{v.username}</span>
                        {i < 3 && <span className="ml-1.5">{MEDALS[i]}</span>}
                      </td>
                      <td className="px-6 py-3.5 text-right font-black tabular-nums" style={{ color: i === 0 ? accent : undefined }}>
                        <span className={i === 0 ? '' : 'text-white'}>{v.points.toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
