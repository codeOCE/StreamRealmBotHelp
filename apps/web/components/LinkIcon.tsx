'use client';

import { useState } from 'react';

/**
 * Auto icons for the link-in-bio feature. A link's icon resolves in order:
 * creator's emoji override → the site's favicon (works for any URL) → 🔗.
 * The KNOWN map is only for pretty label autofill in the dashboard modal.
 */

const KNOWN: [RegExp, string][] = [
  [/(^|\.)twitch\.tv$/, 'Twitch'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)(twitter\.com|x\.com)$/, 'X'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)(discord\.gg|discord\.com)$/, 'Discord'],
  [/(^|\.)github\.com$/, 'GitHub'],
  [/(^|\.)spotify\.com$/, 'Spotify'],
  [/(^|\.)kick\.com$/, 'Kick'],
  [/(^|\.)patreon\.com$/, 'Patreon'],
  [/(^|\.)ko-fi\.com$/, 'Ko-fi'],
  [/(^|\.)(paypal\.com|paypal\.me)$/, 'PayPal'],
  [/(^|\.)(steamcommunity\.com|steampowered\.com)$/, 'Steam'],
  [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)threads\.net$/, 'Threads'],
  [/(^|\.)bsky\.app$/, 'Bluesky'],
  [/(^|\.)throne\.com$/, 'Throne'],
  [/(^|\.)streamlabs\.com$/, 'Streamlabs'],
  [/(^|\.)merch\.store$/, 'Merch Store'],
];

export function linkMeta(url: string): { host: string; name: string | null; favicon: string } | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    const name = KNOWN.find(([re]) => re.test(host))?.[1] ?? null;
    return { host, name, favicon: `https://www.google.com/s2/favicons?domain=${host}&sz=64` };
  } catch {
    return null;
  }
}

export function LinkIcon({ icon, url, size = 24, className }: { icon?: string | null; url: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const meta = linkMeta(url);
  if (icon) return <span className={className} style={{ fontSize: size * 0.9 }}>{icon}</span>;
  if (meta && !broken) {
    return <img src={meta.favicon} alt="" width={size} height={size} className="rounded-md" onError={() => setBroken(true)} />;
  }
  return <span className={className} style={{ fontSize: size * 0.9 }}>🔗</span>;
}
