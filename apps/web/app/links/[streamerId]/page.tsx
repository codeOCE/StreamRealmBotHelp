'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { PublicNav } from '@/components/public/PublicNav';

interface LinkItem {
  label: string;
  url: string;
  icon: string | null;
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
 * Viewer-facing link-in-bio page. Streamer-first identity card (shared with
 * the leaderboard/shop/commands pages via PublicNav) + a stack of link
 * buttons. Share link is `/links/<streamerId>`.
 */
export default function PublicLinksPage() {
  const { streamerId } = useParams<{ streamerId: string }>();
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!streamerId) return;
    fetch(apiUrl(`/api/links/public/${streamerId}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setLinks(Array.isArray(d?.links) ? d.links : []);
        setOwner(d?.owner ?? null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [streamerId]);

  const accent = owner?.color || '#3faaff';

  return (
    <div className="min-h-screen bg-background text-foreground">
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
              {loading ? ' ' : (owner?.name ?? 'Links')}
            </h1>
            {owner?.handle && <p className="text-xs text-zinc-500 font-medium truncate mt-0.5">twitch.tv/{owner.handle}</p>}
            <p className="text-xs text-brand-muted font-medium mt-2 leading-relaxed">{owner?.tagline || 'Find me everywhere'}</p>

            <PublicNav streamerId={String(streamerId)} handle={owner?.handle} active="links" accent={accent} />
          </div>

          {/* ── Links ── */}
          <div className="space-y-3">
            {loading ? (
              [0, 1, 2].map((i) => <div key={i} className="h-16 skeleton rounded-2xl" />)
            ) : links.length === 0 ? (
              <div className="glass-card rounded-2xl py-24 text-center">
                <p className="text-zinc-500 font-medium text-sm">No links yet — check back soon.</p>
              </div>
            ) : links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="glass-card flex items-center gap-4 rounded-2xl px-6 py-5 border border-white/5 hover:border-white/20 transition-colors group"
              >
                <span className="text-2xl shrink-0">{l.icon || '🔗'}</span>
                <span className="font-black text-white tracking-tight flex-1 min-w-0 truncate">{l.label}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600 group-hover:text-white transition-colors shrink-0"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>
              </a>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
