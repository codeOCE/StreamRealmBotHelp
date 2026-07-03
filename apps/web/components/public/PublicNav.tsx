'use client';

import Link from 'next/link';
import { Trophy, Gift, Terminal, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PublicNavTab = 'leaderboard' | 'shop' | 'commands';

/**
 * Shared nav for the viewer-facing pages that hang off a streamer's public
 * profile (leaderboard, loyalty store, commands). Rendered inside each page's
 * identity card so streamer branding sits above it, matching a single
 * "channel portal" rather than three disconnected pages.
 */
export function PublicNav({
  streamerId,
  handle,
  active,
  accent,
}: {
  streamerId: string;
  handle?: string | null;
  active: PublicNavTab;
  accent: string;
}) {
  const items: { key: PublicNavTab; label: string; href: string; icon: typeof Trophy }[] = [
    { key: 'leaderboard', label: 'Leaderboard', href: `/leaderboard/${streamerId}`, icon: Trophy },
    { key: 'shop', label: 'Loyalty Store', href: `/shop/${streamerId}`, icon: Gift },
    { key: 'commands', label: 'Commands', href: `/commands/${streamerId}`, icon: Terminal },
  ];

  return (
    <nav className="mt-4 pt-4 border-t border-white/5 space-y-1">
      {items.map(({ key, label, href, icon: Icon }) => {
        const isActive = key === active;
        return (
          <Link
            key={key}
            href={href}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-bold transition-colors',
              isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]',
            )}
            style={isActive ? { background: `${accent}1a`, border: `1px solid ${accent}33` } : undefined}
          >
            <Icon className="w-4 h-4 shrink-0" style={isActive ? { color: accent } : undefined} />
            {label}
          </Link>
        );
      })}
      {handle && (
        <Link
          href={`/tip/${handle}`}
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-bold text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] transition-colors"
        >
          <Heart className="w-4 h-4 shrink-0" />
          Tip {handle}
        </Link>
      )}
    </nav>
  );
}
