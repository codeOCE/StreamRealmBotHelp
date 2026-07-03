'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { PublicNav } from '@/components/public/PublicNav';
import { Search } from 'lucide-react';

interface PublicCommand {
  trigger: string;
  aliases: string[];
  response: string;
  category: string;
  userLevel: string;
  cooldown: number;
  userCooldown: number;
  isBuiltIn: boolean;
}
interface Owner {
  name: string;
  handle: string | null;
  avatar: string | null;
  banner: string | null;
  color: string | null;
  tagline: string | null;
}

const LEVEL_STYLE: Record<string, string> = {
  VIEWER: 'text-zinc-500',
  SUBSCRIBER: 'text-violet-400',
  VIP: 'text-fuchsia-400',
  MODERATOR: 'text-emerald-400',
  BROADCASTER: 'text-rose-400',
};
const LEVEL_LABEL: Record<string, string> = {
  VIEWER: 'Everyone',
  SUBSCRIBER: 'Subscriber',
  VIP: 'VIP',
  MODERATOR: 'Moderator',
  BROADCASTER: 'Broadcaster',
};

type Tab = 'all' | 'default' | 'custom';

/**
 * Viewer-facing command list — same identity-card + PublicNav shell as the
 * leaderboard and shop pages. All enabled commands are listed (permission
 * level shown, not hidden — the server still enforces who can run what).
 * Share link is `/commands/<streamerId>`.
 */
export default function PublicCommandsPage() {
  const { streamerId } = useParams<{ streamerId: string }>();
  const [commands, setCommands] = useState<PublicCommand[]>([]);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');

  useEffect(() => {
    if (!streamerId) return;
    fetch(apiUrl(`/api/commands/public/${streamerId}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setCommands(Array.isArray(d?.commands) ? d.commands : []);
        setOwner(d?.owner ?? null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [streamerId]);

  const accent = owner?.color || '#3faaff';

  const defaultCount = useMemo(() => commands.filter((c) => c.isBuiltIn).length, [commands]);
  const customCount = commands.length - defaultCount;

  const filtered = useMemo(() => {
    let list = commands;
    if (tab === 'default') list = list.filter((c) => c.isBuiltIn);
    if (tab === 'custom') list = list.filter((c) => !c.isBuiltIn);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.trigger.toLowerCase().includes(q) ||
        c.aliases.some((a) => a.toLowerCase().includes(q)) ||
        c.response.toLowerCase().includes(q),
    );
  }, [commands, tab, query]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Banner ── */}
      <div className="h-32 md:h-40 w-full overflow-hidden bg-surface-bright">
        {owner?.banner
          ? <img src={owner.banner} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full" style={{ background: `linear-gradient(120deg, ${accent}22, transparent 60%), var(--color-surface-bright)` }} />}
      </div>

      <main className="max-w-6xl mx-auto px-6 -mt-10 pb-24">
        <div className="grid md:grid-cols-[260px_1fr] gap-6 items-start">
          {/* ── Identity card ── */}
          <div className="glass-card rounded-2xl p-5 md:sticky md:top-6">
            <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-surface-base mb-4" style={{ border: `2px solid ${accent}` }}>
              {owner?.avatar
                ? <img src={owner.avatar} alt={owner.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-2xl" style={{ background: `${accent}1a` }}>⌘</div>}
            </div>
            <h1 className="text-xl font-black tracking-tight text-white font-display truncate">
              {loading ? ' ' : (owner?.name ?? 'Commands')}
            </h1>
            {owner?.handle && <p className="text-xs text-zinc-500 font-medium truncate mt-0.5">twitch.tv/{owner.handle}</p>}
            <p className="text-xs text-brand-muted font-medium mt-2 leading-relaxed">{owner?.tagline || 'Chat command list'}</p>

            <PublicNav streamerId={String(streamerId)} handle={owner?.handle} active="commands" accent={accent} />
          </div>

          {/* ── Commands ── */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-white/5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black tracking-tight text-white">Channel commands</h2>
                <p className="text-xs text-zinc-500 font-medium mt-0.5">A list of chat commands enabled in chat</p>
              </div>
              {commands.length > 0 && (
                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search commands…"
                    className="w-full bg-white/[0.02] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-brand-primary/40 transition-shadow"
                  />
                </div>
              )}
            </div>

            {!loading && commands.length > 0 && (
              <div className="flex items-center gap-1 px-4 pt-4">
                {([
                  ['all', `All commands (${commands.length})`],
                  ['default', `Default (${defaultCount})`],
                  ['custom', `Custom (${customCount})`],
                ] as [Tab, string][]).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors ${
                      tab === id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    style={tab === id ? { background: `${accent}1a`, color: accent } : undefined}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {loading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-4 py-2">
                    <div className="h-4 w-20 skeleton rounded" />
                    <div className="h-4 flex-1 skeleton rounded" />
                  </div>
                ))}
              </div>
            ) : commands.length === 0 ? (
              <div className="py-24 text-center">
                <p className="text-zinc-500 font-medium text-sm">No commands yet — check back soon.</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-24 text-center">
                <p className="text-zinc-500 font-medium text-sm">No commands match &ldquo;{query}&rdquo;.</p>
              </div>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[640px]">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-600 w-40">Command</th>
                      <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-600 w-36">Permissions</th>
                      <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-600">Response</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {filtered.map((c) => (
                      <tr key={c.trigger} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-3.5 align-top">
                          <span className="font-mono text-sm font-bold text-white">!{c.trigger}</span>
                          {c.aliases.length > 0 && (
                            <span className="ml-1.5 text-[10px] font-black text-zinc-600" title={c.aliases.map((a) => `!${a}`).join(', ')}>
                              +{c.aliases.length}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 align-top">
                          <span className={`text-[10px] font-black uppercase tracking-wide ${LEVEL_STYLE[c.userLevel] ?? 'text-zinc-500'}`}>
                            {LEVEL_LABEL[c.userLevel] ?? c.userLevel}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 align-top">
                          <span className="text-sm text-zinc-400 font-medium line-clamp-1">{c.response || '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
