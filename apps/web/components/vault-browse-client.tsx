"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { checker, type VaultEmote } from "@/lib/vault-shared";

const PAGE_SIZE = 48;

export type VaultSearchParams = {
  q?: string;
  tag?: string;
  animated?: string;
  overlaying?: string;
  exact?: string;
  sort?: string;
  page?: string;
};

/**
 * The public emote vault — the full instant 7TV-style browser, but server-seeded
 * for SEO. The parent server component fetches page 1 and hands it in as
 * `initialEmotes` / `initialTotal`, so the first grid is already in the HTML for
 * crawlers; this component then takes over for live search, filtering, sorting,
 * view-switching, and load-more, hitting the public (CORS-open, cacheable)
 * /api/emotes/public/directory endpoint directly. Mirrors the dashboard's own
 * Directory browser (app/dashboard/emotes/page.tsx), minus the add-to-channel
 * actions — here each emote links to its indexable detail page.
 */
export function VaultBrowseClient({
  initialEmotes,
  initialTotal,
  initialSp,
}: {
  initialEmotes: VaultEmote[];
  initialTotal: number;
  initialSp: VaultSearchParams;
}) {
  const [q, setQ] = useState(initialSp.q ?? "");
  const [tag, setTag] = useState(initialSp.tag ?? "");
  const [animatedOnly, setAnimatedOnly] = useState(initialSp.animated === "true");
  const [staticOnly, setStaticOnly] = useState(initialSp.animated === "false");
  const [overlayOnly, setOverlayOnly] = useState(initialSp.overlaying === "true");
  const [exact, setExact] = useState(initialSp.exact === "true");
  const [sort, setSort] = useState<"new" | "name">(initialSp.sort === "name" ? "name" : "new");
  const [view, setView] = useState<"grid" | "list">("grid");

  const [emotes, setEmotes] = useState<VaultEmote[]>(initialEmotes);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const first = useRef(true);

  const buildParams = (p: number) => {
    const params = new URLSearchParams({ sort, page: String(p) });
    if (q.trim()) params.set("q", q.trim());
    if (tag.trim()) params.set("tag", tag.trim());
    if (exact) params.set("exact", "true");
    if (animatedOnly) params.set("animated", "true");
    else if (staticOnly) params.set("animated", "false");
    if (overlayOnly) params.set("overlaying", "true");
    return params;
  };

  // Re-query from page 1 whenever a filter changes (debounced). Skip the very
  // first run — that data is already server-seeded into state.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setPage(1);
      const r = await fetch(`/api/emotes/public/directory?${buildParams(1)}`)
        .then((x) => x.json())
        .catch(() => ({}));
      setEmotes(Array.isArray(r.emotes) ? r.emotes : []);
      setTotal(typeof r.total === "number" ? r.total : 0);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tag, exact, animatedOnly, staticOnly, overlayOnly, sort]);

  const loadMore = async () => {
    const next = page + 1;
    setLoadingMore(true);
    const r = await fetch(`/api/emotes/public/directory?${buildParams(next)}`)
      .then((x) => x.json())
      .catch(() => ({}));
    setEmotes((xs) => [...xs, ...(Array.isArray(r.emotes) ? r.emotes : [])]);
    setPage(next);
    setLoadingMore(false);
  };

  const hasMore = emotes.length < total;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white font-heading">The Emote Vault</h1>
        <p className="text-brand-muted text-sm font-medium mt-1 max-w-2xl">
          Free custom emotes shared by Creator Castle streamers. Grab the{" "}
          <a href="https://app.creatorcastle.gg" className="text-brand-primary hover:underline">browser extension</a>{" "}
          and type any of these in a CreatorCastle chat to see them render live.
        </p>
      </div>

      <div className="grid lg:grid-cols-[15rem_1fr] gap-7">
        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside>
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500 px-1 pb-2.5">Directory</p>
          <div className="dashboard-tab-btn active mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            Emotes
          </div>

          <div className="glass-card rounded-2xl border border-white/5 p-4 space-y-1">
            <FilterSection title="Search">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Emote"
                  className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-2.5 text-sm text-white outline-none focus:border-brand-primary/50"
                />
              </div>
            </FilterSection>

            <FilterSection title="Tags">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></svg>
                <input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="Enter a tag"
                  className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-2.5 text-sm text-white outline-none focus:border-brand-primary/50"
                />
              </div>
            </FilterSection>

            <FilterSection title="Filters">
              <FilterCheckbox label="Animated" checked={animatedOnly} onChange={(v) => { setAnimatedOnly(v); if (v) setStaticOnly(false); }} />
              <FilterCheckbox label="Static" checked={staticOnly} onChange={(v) => { setStaticOnly(v); if (v) setAnimatedOnly(false); }} />
              <FilterCheckbox label="Overlaying" checked={overlayOnly} onChange={setOverlayOnly} />
              <FilterCheckbox label="Exact Match" checked={exact} onChange={setExact} />
            </FilterSection>
          </div>
        </aside>

        {/* ── Results ─────────────────────────────────────────────── */}
        <div className="space-y-5 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/5">
              {(["new", "name"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-black transition-colors ${sort === s ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white"}`}
                >
                  {s === "new" ? "✨ New" : "🔤 A–Z"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black uppercase text-zinc-600">{total} found</span>
              <div className="flex gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/5">
                <button onClick={() => setView("grid")} aria-label="Grid view" className={`p-1.5 rounded ${view === "grid" ? "bg-white/10 text-white" : "text-zinc-600 hover:text-zinc-300"}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>
                </button>
                <button onClick={() => setView("list")} aria-label="List view" className={`p-1.5 rounded ${view === "list" ? "bg-white/10 text-white" : "text-zinc-600 hover:text-zinc-300"}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="glass-card rounded-2xl p-5 border border-white/5"><div className="skeleton h-16 w-full rounded-xl" /></div>
              ))}
            </div>
          ) : emotes.length === 0 ? (
            <div className="py-24 flex flex-col items-center gap-3 text-center">
              <div className="text-4xl opacity-30">🗝️</div>
              <p className="text-zinc-600 text-sm font-semibold">No emotes match those filters.</p>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
              {emotes.map((e) => (
                <Link
                  key={e.id}
                  href={`/e/${e.id}`}
                  className="group relative glass-card rounded-2xl border border-white/5 hover:border-brand-primary/40 transition-colors overflow-hidden"
                >
                  <div className="relative h-24 flex items-center justify-center overflow-hidden" style={checker}>
                    <img src={e.imageUrl} alt={`${e.code} emote`} loading="lazy" style={{ height: Math.min(64, e.width) }} className="object-contain transition-transform duration-200 ease-out group-hover:scale-[1.65]" />
                    {e.animated && <span className="absolute top-1.5 left-1.5 text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-black/60 text-amber-300 border border-amber-400/20">GIF</span>}
                  </div>
                  <div className="px-3 py-2 border-t border-white/5">
                    <code className="text-xs font-black text-white truncate block">{e.code}</code>
                    {e.owner && <p className="text-[10px] text-zinc-600 truncate mt-0.5">{e.owner}</p>}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {emotes.map((e) => (
                <Link key={e.id} href={`/e/${e.id}`} className="flex items-center gap-3 px-3 py-2 rounded-xl glass-card border border-white/5 hover:border-brand-primary/30 transition-colors">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={checker}>
                    <img src={e.imageUrl} alt={e.code} style={{ height: Math.min(28, e.width) }} className="object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-white truncate">{e.code}</p>
                    {e.owner && <p className="text-[10px] text-zinc-500 truncate">{e.owner}</p>}
                  </div>
                  {e.animated && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/60 text-amber-300 border border-amber-400/20 shrink-0">GIF</span>}
                </Link>
              ))}
            </div>
          )}

          {hasMore && !loading && (
            <div className="flex justify-center pt-4">
              <button onClick={loadMore} disabled={loadingMore} className="saas-button-secondary text-xs disabled:opacity-40">
                {loadingMore ? "Loading…" : `Load more (${total - emotes.length} left)`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="py-2">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-xs font-black uppercase tracking-wide text-zinc-400 hover:text-white transition-colors mb-2.5">
        {title}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && <div className="space-y-2.5 pb-1">{children}</div>}
    </div>
  );
}

function FilterCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-zinc-300 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-brand-primary w-4 h-4" />
      {label}
    </label>
  );
}
