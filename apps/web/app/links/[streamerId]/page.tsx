'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import { PublicNav } from '@/components/public/PublicNav';
import { LinkIcon } from '@/components/LinkIcon';

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
  bgColor: string | null;
  bgImage: string | null;
  title: string | null;
  bio: string | null;
}

/**
 * Viewer-facing link-in-bio page. Streamer-first identity card (shared with
 * the leaderboard/shop/commands pages via PublicNav) + a stack of link
 * buttons styled by the creator (accent, button style, shape). Icons resolve
 * automatically from each link's favicon unless the creator set an emoji.
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
  const pageBio = style?.bio || owner?.tagline || 'Find me everywhere';

  // Solid buttons need readable text on light accents (e.g. yellow).
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));
  const solidText = 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#0a0a0f' : '#ffffff';

  // Custom wallpaper (image beats color) replaces the banner strip entirely.
  const hasWallpaper = !!(style?.bgImage || style?.bgColor);

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={
        style?.bgImage ? { backgroundImage: `url(${style.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }
        : style?.bgColor ? { background: style.bgColor }
        : undefined
      }
    >
      {/* Readability scrim over image wallpapers */}
      <div className={cn('min-h-screen', style?.bgImage && 'bg-black/60')}>
      {!hasWallpaper && (
        <div className="h-32 md:h-40 w-full overflow-hidden bg-surface-bright">
          {owner?.banner
            ? <img src={owner.banner} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full" style={{ background: `linear-gradient(120deg, ${accent}22, transparent 60%), var(--color-surface-bright)` }} />}
        </div>
      )}

      <main className={cn('max-w-5xl mx-auto px-6 pb-24', hasWallpaper ? 'pt-12' : '-mt-10')}>
        <div className="grid md:grid-cols-[260px_1fr] gap-6 items-start">
          {/* ── Identity card ── */}
          <div className="glass-card rounded-2xl p-5 md:sticky md:top-6">
            <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-surface-base mb-4" style={{ border: `2px solid ${accent}` }}>
              {owner?.avatar
                ? <img src={owner.avatar} alt={owner.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-2xl" style={{ background: `${accent}1a` }}>🏰</div>}
            </div>
            <h1 className="text-xl font-black tracking-tight text-white font-display truncate">
              {loading ? ' ' : pageTitle}
            </h1>
            {owner?.handle && <p className="text-xs text-zinc-500 font-medium truncate mt-0.5">twitch.tv/{owner.handle}</p>}
            <p className="text-xs text-brand-muted font-medium mt-2 leading-relaxed">{pageBio}</p>

            <PublicNav streamerId={String(streamerId)} handle={owner?.handle} active="links" accent={accent} />
          </div>

          {/* ── Links ── */}
          <div className="space-y-3">
            {loading ? (
              [0, 1, 2].map((i) => <div key={i} className={cn('h-16 skeleton', shapeCls)} />)
            ) : links.length === 0 ? (
              <div className="glass-card rounded-2xl py-24 text-center">
                <p className="text-zinc-500 font-medium text-sm">No links yet — check back soon.</p>
              </div>
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
                  'flex items-center gap-4 px-6 py-5 transition-all group',
                  shapeCls,
                  btn === 'glass' && 'glass-card border border-white/5 hover:border-white/20',
                  btn === 'solid' && 'hover:brightness-110',
                  btn === 'outline' && 'border-2 bg-transparent hover:bg-white/[0.03]',
                )}
                style={
                  btn === 'solid' ? { background: accent, color: solidText }
                  : btn === 'outline' ? { borderColor: `${accent}55` }
                  : undefined
                }
              >
                <span className="shrink-0 flex items-center justify-center w-7"><LinkIcon icon={l.icon} url={l.url} size={26} /></span>
                <span className={cn('font-black tracking-tight flex-1 min-w-0 truncate', btn !== 'solid' && 'text-white')}>{l.label}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={cn('transition-colors shrink-0', btn === 'solid' ? 'opacity-60' : 'text-zinc-600 group-hover:text-white')}><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>
              </a>
            ))}
          </div>
        </div>
      </main>
      </div>
    </div>
  );
}
