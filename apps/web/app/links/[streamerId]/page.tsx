'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import { LinkIcon } from '@/components/LinkIcon';
import { wallpaperCss } from '@/lib/link-wallpapers';

interface LinkItem {
  id: string;
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
interface PageStyle {
  accent: string | null;
  buttonStyle: 'glass' | 'solid' | 'outline';
  shape: 'rounded' | 'pill' | 'sharp';
  wallpaper: string;
  title: string | null;
  bio: string | null;
}

/**
 * Standalone link-in-bio page (Linktree-style): centered avatar, title, bio,
 * and a stack of link buttons — deliberately NOT part of the channel-portal
 * layout the leaderboard/shop/commands pages share. Icons resolve from each
 * link's favicon unless the creator set an emoji; the creator styles the page
 * (accent, buttons, shape, wallpaper) from the dashboard.
 * Share link is `/links/<streamerId>`.
 */
export default function PublicLinksPage() {
  const { streamerId } = useParams<{ streamerId: string }>();
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [style, setStyle] = useState<PageStyle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!streamerId) return;
    fetch(apiUrl(`/api/links/public/${streamerId}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setLinks(Array.isArray(d?.links) ? d.links : []);
        setOwner(d?.owner ?? null);
        setStyle(d?.settings ?? null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [streamerId]);

  const accent = style?.accent || owner?.color || '#3faaff';
  const shapeCls = style?.shape === 'pill' ? 'rounded-full' : style?.shape === 'sharp' ? 'rounded-lg' : 'rounded-2xl';
  const btn = style?.buttonStyle ?? 'glass';
  const pageTitle = style?.title || owner?.name || 'Links';
  const pageBio = style?.bio || owner?.tagline || '';

  // Solid buttons need readable text on light accents (e.g. yellow).
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));
  const solidText = 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#0a0a0f' : '#ffffff';

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{ background: wallpaperCss(style?.wallpaper, accent) }}
    >
      <div className="min-h-screen flex flex-col">
        <main className="w-full max-w-xl mx-auto px-6 pt-14 sm:pt-20 pb-10 flex flex-col items-center flex-1">
          {/* ── Profile ── */}
          <div className="w-24 h-24 rounded-full overflow-hidden bg-surface-base shadow-2xl shadow-black/40" style={{ border: `3px solid ${accent}` }}>
            {owner?.avatar
              ? <img src={owner.avatar} alt={owner.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-4xl" style={{ background: `${accent}1a` }}>🏰</div>}
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white font-display mt-4 text-center">
            {loading ? ' ' : pageTitle}
          </h1>
          {owner?.handle && (
            <a href={`https://twitch.tv/${owner.handle}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold mt-0.5 hover:underline" style={{ color: accent }}>
              twitch.tv/{owner.handle}
            </a>
          )}
          {pageBio && <p className="text-sm text-zinc-400 font-medium mt-2 text-center leading-relaxed max-w-md">{pageBio}</p>}

          {/* ── Links ── */}
          <div className="w-full space-y-3 mt-8">
            {loading ? (
              [0, 1, 2].map((i) => <div key={i} className={cn('h-16 skeleton', shapeCls)} />)
            ) : links.length === 0 ? (
              <p className="text-zinc-500 font-medium text-sm text-center py-16">No links yet — check back soon.</p>
            ) : links.map((l) => (
              <a
                key={l.id}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                onClick={() => {
                  // keepalive so the beacon survives the navigation
                  try { fetch(apiUrl(`/api/links/public/${streamerId}/click/${l.id}`), { method: 'POST', keepalive: true }); } catch { /* best effort */ }
                }}
                className={cn(
                  'flex items-center gap-4 px-6 py-4 transition-all group hover:scale-[1.02]',
                  shapeCls,
                  btn === 'glass' && 'glass-card border border-white/10 hover:border-white/25',
                  btn === 'solid' && 'hover:brightness-110 shadow-lg',
                  btn === 'outline' && 'border-2 bg-black/20 hover:bg-black/40',
                )}
                style={
                  btn === 'solid' ? { background: accent, color: solidText }
                  : btn === 'outline' ? { borderColor: `${accent}88` }
                  : undefined
                }
              >
                <span className="shrink-0 flex items-center justify-center w-7"><LinkIcon icon={l.icon} url={l.url} size={24} /></span>
                <span className={cn('font-black tracking-tight flex-1 min-w-0 truncate text-center', btn !== 'solid' && 'text-white')}>{l.label}</span>
                <span className="w-7 shrink-0" aria-hidden />
              </a>
            ))}
          </div>
        </main>

        <footer className="pb-8 flex justify-center">
          <a href="https://app.creatorcastle.gg" className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors">
            <img src="https://cdn.codeoce.com/logo/logo_white.png" alt="" className="w-5 h-5 object-contain opacity-70" />
            <span>Powered by Creator<span style={{ color: accent }}>Castle</span></span>
          </a>
        </footer>
      </div>
    </div>
  );
}
