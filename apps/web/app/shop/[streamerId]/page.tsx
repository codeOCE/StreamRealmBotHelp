'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { PublicNav } from '@/components/public/PublicNav';

interface StoreItem {
  code: string;
  name: string;
  description: string;
  icon: string | null;
  imageUrl: string | null;
  cost: number;
  stock: number | null;
  perUserLimit: number | null;
}
interface Owner {
  name: string;
  handle: string | null;
  avatar: string | null;
  banner: string | null;
  color: string | null;
  tagline: string | null;
}

/**
 * Viewer-facing storefront for The Royal Shop. Streamer-first identity card
 * (shared with the leaderboard/commands pages via PublicNav) + a read-only
 * catalog; viewers redeem in chat with `!buy <code>`. Share link is
 * `/shop/<streamerId>`.
 */
export default function PublicShopPage() {
  const { streamerId } = useParams<{ streamerId: string }>();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!streamerId) return;
    fetch(apiUrl(`/api/shop/public/${streamerId}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setItems(Array.isArray(d?.items) ? d.items : []);
        setOwner(d?.owner ?? null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [streamerId]);

  // The streamer's brand color drives every accent; fall back to Castle blue.
  const accent = owner?.color || '#3faaff';

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
                : <div className="w-full h-full flex items-center justify-center text-2xl" style={{ background: `${accent}1a` }}>🏰</div>}
            </div>
            <h1 className="text-xl font-black tracking-tight text-white font-display truncate">
              {loading ? ' ' : (owner?.name ?? 'Loyalty Store')}
            </h1>
            {owner?.handle && <p className="text-xs text-zinc-500 font-medium truncate mt-0.5">twitch.tv/{owner.handle}</p>}
            <p className="text-xs text-brand-muted font-medium mt-2 leading-relaxed">{owner?.tagline || 'Loyalty rewards store'}</p>

            <PublicNav streamerId={String(streamerId)} handle={owner?.handle} active="shop" accent={accent} />
          </div>

          {/* ── Rewards ── */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between gap-3">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-300">Rewards</h2>
              <p className="text-xs text-zinc-500 font-medium">
                Redeem in chat with <code className="font-mono" style={{ color: accent }}>!buy &lt;code&gt;</code>
              </p>
            </div>

            {loading ? (
              <div className="p-6 space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-5">
                    <div className="w-24 h-16 rounded-xl skeleton shrink-0" />
                    <div className="flex-1 space-y-2"><div className="h-4 w-1/3 skeleton rounded" /><div className="h-3 w-2/3 skeleton rounded" /></div>
                    <div className="h-5 w-16 skeleton rounded" />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="py-24 text-center">
                <p className="text-zinc-500 font-medium text-sm">No rewards yet — check back soon.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.03] px-2">
                {items.map((it) => (
                  <div key={it.code} className="flex items-center gap-4 sm:gap-6 py-5 px-4 -mx-2 rounded-xl hover:bg-white/[0.015] transition-colors group">
                    {/* Thumbnail */}
                    <div className="w-20 h-14 sm:w-28 sm:h-18 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-white/[0.02]">
                      {it.imageUrl
                        ? <img src={it.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        : <span className="text-3xl opacity-40">{it.icon || '🎁'}</span>}
                    </div>

                    {/* Name + description */}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-black text-white tracking-tight leading-tight truncate">{it.name}</h3>
                      {it.description && <p className="text-sm text-zinc-500 font-medium line-clamp-1 sm:line-clamp-2 mt-0.5">{it.description}</p>}
                      <div className="flex items-center gap-3 mt-1.5 text-xs">
                        <code className="font-mono" style={{ color: accent }}>!buy {it.code}</code>
                        {it.stock != null && <span className="text-amber-300/80">{it.stock} left</span>}
                        {it.perUserLimit != null && <span className="text-zinc-600">{it.perUserLimit}/viewer</span>}
                      </div>
                    </div>

                    {/* Price */}
                    <div className="text-right shrink-0 self-start sm:self-center">
                      <span className="font-black text-xl sm:text-2xl tracking-tight tabular-nums" style={{ color: accent }}>{it.cost.toLocaleString()}</span>
                      <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-600 -mt-0.5">pts</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
