"use client";

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import { buildVariants } from '@/lib/emote-variants';

/**
 * Custom chat emotes — the 7TV/BTTV-style emote platform, dressed in the Castle
 * theme. Creators drag-drop emotes with a live chat preview, share them to the
 * emote vault (directory), and pull in emotes from other channels.
 * See apps/worker/src/routes/emotes.ts.
 */

interface Emote {
  id: string;
  code: string;
  imageUrl: string;
  width: number;
  animated: boolean;
  zeroWidth: boolean;
  tags: string[];
  visibility: 'channel' | 'public';
  status: 'pending' | 'approved' | 'rejected';
  owned: boolean;
}
interface DirEmote {
  id: string; code: string; imageUrl: string; width: number; animated: boolean;
  zeroWidth: boolean; tags: string[]; owner: string | null; added: boolean;
}

const EMOTES = apiUrl('/api/emotes');

// Shrink oversized STATIC emotes before upload: resize to ≤128px (7TV's 4x) and
// re-encode as AVIF (far smaller than PNG/JPEG at this size), falling back to
// the original format if the browser's canvas can't encode AVIF. Animated
// formats (gif / webp / apng) are left as-is — drawing them to a canvas would
// flatten them to a single frame, killing the animation.
async function compressStatic(file: File): Promise<File> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, 128 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bmp, 0, 0, w, h);

  // Browsers without an AVIF encoder hand back a PNG blob instead of throwing
  // (spec-mandated fallback), so checking blob.type is how we detect support.
  const avif: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/avif', 0.75));
  if (avif && avif.type === 'image/avif' && avif.size < file.size) {
    return new File([avif], file.name.replace(/\.[^.]+$/, '') + '.avif', { type: 'image/avif' });
  }

  if (scale === 1) return file; // no resize available and AVIF didn't win — keep original
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, file.type, 0.92));
  if (!blob || blob.size >= file.size) return file; // no win → keep original
  return new File([blob], file.name, { type: file.type });
}

// Transparency checkerboard behind emotes (matches how 7TV shows alpha).
const checker: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg,#ffffff0a 25%,transparent 25%,transparent 75%,#ffffff0a 75%),linear-gradient(45deg,#ffffff0a 25%,transparent 25%,transparent 75%,#ffffff0a 75%)',
  backgroundSize: '14px 14px',
  backgroundPosition: '0 0,7px 7px',
};

export default function EmotesPage() {
  const [mine, setMine] = useState<Emote[]>([]);
  const [added, setAdded] = useState<Emote[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [seedFile, setSeedFile] = useState<File | null>(null);
  const [pageDrag, setPageDrag] = useState(false);
  const [tab, setTab] = useState<'mine' | 'directory'>('mine');

  const load = async () => {
    const r = await fetch(EMOTES, { credentials: 'include' }).then((x) => x.json()).catch(() => ({}));
    setMine(Array.isArray(r.emotes) ? r.emotes : []);
    setAdded(Array.isArray(r.added) ? r.added : []);
  };
  useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, []);

  const openCreate = (f?: File | null) => { setSeedFile(f ?? null); setCreating(true); };
  const del = async (id: string) => {
    if (!confirm('Delete this emote? Anyone using it in your chat loses it.')) return;
    await fetch(`${EMOTES}/${id}`, { method: 'DELETE', credentials: 'include' });
    setMine((xs) => xs.filter((e) => e.id !== id));
  };
  const patch = async (id: string, body: Partial<Emote>) => {
    await fetch(`${EMOTES}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' });
    load();
  };
  const removeAdded = async (id: string) => {
    await fetch(`${EMOTES}/${id}/add`, { method: 'DELETE', credentials: 'include' });
    setAdded((xs) => xs.filter((e) => e.id !== id));
  };

  // Drag a file anywhere onto the page → open the uploader pre-loaded with it.
  const onPageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setPageDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith('image/')) openCreate(f);
  };

  return (
    <div
      className="space-y-8 max-w-7xl mx-auto relative"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setPageDrag(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setPageDrag(false); }}
      onDrop={onPageDrop}
    >
      {pageDrag && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-brand-primary/10 backdrop-blur-sm border-4 border-dashed border-brand-primary/50 rounded-3xl pointer-events-none">
          <div className="text-center">
            <div className="text-6xl mb-3">🏰</div>
            <p className="text-white font-black text-lg">Drop to add an emote to your castle</p>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white font-heading">Custom Emotes</h1>
          <p className="text-brand-muted text-sm font-medium mt-1 max-w-2xl">
            Drag in <span className="text-brand-primary">custom emotes</span> for your channel. Anyone with the CreatorCastle
            browser extension types them in your Twitch chat and sees the image — and they rain in your Emote Wall overlay.
            Share your best to the <span className="text-brand-primary">vault</span> for other castles to use.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a href="https://emotes.creatorcastle.gg" target="_blank" rel="noopener noreferrer" className="text-xs font-black uppercase tracking-wide text-zinc-400 hover:text-white transition-colors">
            View the public Vault ↗
          </a>
          <button onClick={() => openCreate(null)} className="saas-button">+ Upload Emote</button>
        </div>
      </div>

      <div className="flex gap-2">
        {(['mine', 'directory'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-4 py-2 rounded-xl text-xs font-black border transition-colors',
              tab === t ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white/[0.02] text-zinc-500 border-white/10 hover:text-white')}>
            {t === 'mine' ? `My Emotes (${mine.length + added.length})` : '🔍 Emote Vault'}
          </button>
        ))}
      </div>

      {tab === 'mine' ? (
        <MyEmotes mine={mine} added={added} loading={loading} onNew={() => openCreate(null)} onDelete={del} onPatch={patch} onRemoveAdded={removeAdded} />
      ) : (
        <Directory onChanged={load} />
      )}

      {creating && <CreateModal seedFile={seedFile} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </div>
  );
}

/* ─────────────────────────── shared bits ─────────────────────────── */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-black uppercase tracking-wide text-zinc-300">{title}</h2>
        {hint && <p className="text-[11px] text-zinc-600 mt-1">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
const Grid = ({ children }: { children: React.ReactNode }) =>
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">{children}</div>;

function Skeletons() {
  return <Grid>{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="glass-card rounded-2xl p-5 border border-white/5"><div className="skeleton h-16 w-full rounded-xl" /></div>)}</Grid>;
}

const ZeroWidthIcon = () => (
  <span title="Overlaying emote" className="shrink-0 text-brand-primary">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="13" height="13" rx="2" /><path d="M21 8v11a2 2 0 0 1-2 2H8" />
    </svg>
  </span>
);
function TagChips({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  const shown = tags.slice(0, 3);
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {shown.map((t) => <span key={t} className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-zinc-500">#{t}</span>)}
      {tags.length > shown.length && <span className="text-[8px] font-bold text-zinc-600">+{tags.length - shown.length}</span>}
    </div>
  );
}

// 7TV-style tile: checkerboard alpha, hover-zoom on the emote, code + owner row.
function EmoteTile({ url, size, animated, zeroWidth, code, owner, tags, badge, children }: {
  url: string; size: number; animated?: boolean; zeroWidth?: boolean; code: string; owner?: string | null; tags?: string[]; badge?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="group relative glass-card rounded-2xl border border-white/5 hover:border-brand-primary/40 transition-colors overflow-hidden">
      <div className="relative h-24 flex items-center justify-center overflow-hidden" style={checker}>
        <img src={url} alt={code} style={{ height: Math.min(64, size) }} className="object-contain transition-transform duration-200 ease-out group-hover:scale-[1.65]" />
        {animated && <span className="absolute top-1.5 left-1.5 text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-black/60 text-amber-300 border border-amber-400/20">GIF</span>}
        {badge && <span className="absolute top-1.5 right-1.5">{badge}</span>}
      </div>
      <div className="px-3 py-2 border-t border-white/5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <code className="text-xs font-black text-white truncate">{code}</code>
            {zeroWidth && <ZeroWidthIcon />}
          </div>
          {children}
        </div>
        {owner && <p className="text-[10px] text-zinc-600 truncate mt-0.5">{owner}</p>}
        {tags && <TagChips tags={tags} />}
      </div>
    </div>
  );
}

const StatusPill = ({ e }: { e: Emote }) => {
  if (e.visibility !== 'public') return null;
  const meta = e.status === 'approved'
    ? { c: '#34d399', t: 'Vault' }
    : e.status === 'pending' ? { c: '#f59e0b', t: 'Review' } : { c: '#f43f5e', t: 'Nope' };
  return <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded" style={{ color: meta.c, background: `${meta.c}22` }}>{meta.t}</span>;
};

function DropCta({ onNew }: { onNew: () => void }) {
  return (
    <button onClick={onNew} className="w-full py-20 flex flex-col items-center justify-center gap-4 rounded-[2rem] border-2 border-dashed border-white/10 hover:border-brand-primary/50 bg-white/[0.01] hover:bg-brand-primary/5 transition-colors group">
      <div className="text-5xl opacity-40 group-hover:opacity-100 transition-opacity">😄</div>
      <p className="text-zinc-400 font-black text-sm">Drag an emote here, or click to upload</p>
      <p className="text-zinc-600 text-[11px] uppercase font-black tracking-wide">PNG · GIF · WEBP · up to 1MB</p>
    </button>
  );
}

/* ─────────────────────────── my emotes ─────────────────────────── */
function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card rounded-2xl border border-white/5 px-5 py-4">
      <p className="text-2xl font-black text-white tabular-nums">{value}</p>
      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-600 mt-0.5">{label}</p>
    </div>
  );
}

function MyEmotes({ mine, added, loading, onNew, onDelete, onPatch, onRemoveAdded }: {
  mine: Emote[]; added: Emote[]; loading: boolean; onNew: () => void;
  onDelete: (id: string) => void; onPatch: (id: string, body: Partial<Emote>) => void; onRemoveAdded: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'new' | 'name'>('new');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const stats = {
    total: mine.length,
    animated: mine.filter((e) => e.animated).length,
    overlaying: mine.filter((e) => e.zeroWidth).length,
    inVault: mine.filter((e) => e.visibility === 'public' && e.status === 'approved').length,
  };

  const filterSort = (list: Emote[]) => {
    const term = q.trim().toLowerCase();
    const filtered = term ? list.filter((e) => e.code.toLowerCase().includes(term)) : list;
    return sort === 'name' ? [...filtered].sort((a, b) => a.code.localeCompare(b.code)) : filtered; // "new" = server order (created_at desc)
  };
  const shownMine = filterSort(mine);
  const shownAdded = filterSort(added);

  const ListRow = ({ e, children }: { e: Emote; children: React.ReactNode }) => (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl glass-card border border-white/5 hover:border-brand-primary/30 transition-colors">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={checker}>
        <img src={e.imageUrl} alt={e.code} style={{ height: Math.min(28, e.width) }} className="object-contain" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-xs font-black text-white truncate">{e.code}</p>
          {e.zeroWidth && <ZeroWidthIcon />}
        </div>
        {e.tags.length > 0 && <TagChips tags={e.tags} />}
      </div>
      {children}
    </div>
  );

  return (
    <div className="space-y-8">
      {!loading && mine.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile label="Total" value={stats.total} />
          <StatTile label="Animated" value={stats.animated} />
          <StatTile label="Overlaying" value={stats.overlaying} />
          <StatTile label="In Vault" value={stats.inVault} />
        </div>
      )}

      {!loading && mine.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative max-w-xs flex-1 min-w-[10rem]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your emotes…"
              className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-brand-primary/50" />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/5">
              {(['new', 'name'] as const).map((s) => (
                <button key={s} onClick={() => setSort(s)}
                  className={cn('px-3.5 py-1.5 rounded-md text-xs font-black transition-colors', sort === s ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-white')}>
                  {s === 'new' ? '✨ New' : '🔤 A–Z'}
                </button>
              ))}
            </div>
            <div className="flex gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/5">
              <button onClick={() => setView('grid')} aria-label="Grid view" className={cn('p-1.5 rounded', view === 'grid' ? 'bg-white/10 text-white' : 'text-zinc-600 hover:text-zinc-300')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>
              </button>
              <button onClick={() => setView('list')} aria-label="List view" className={cn('p-1.5 rounded', view === 'list' ? 'bg-white/10 text-white' : 'text-zinc-600 hover:text-zinc-300')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <Section title="Your emotes" hint="Type these in your own chat right away. Flip “Vault” to share (needs a quick review).">
        {loading ? <Skeletons /> : mine.length === 0 ? (
          <DropCta onNew={onNew} />
        ) : shownMine.length === 0 ? (
          <p className="text-zinc-600 text-sm font-semibold py-10 text-center">No emotes match “{q}”.</p>
        ) : view === 'grid' ? (
          <Grid>
            {shownMine.map((e) => (
              <EmoteTile key={e.id} url={e.imageUrl} size={e.width} animated={e.animated} zeroWidth={e.zeroWidth} code={e.code} tags={e.tags} badge={<StatusPill e={e} />}>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[10px] text-zinc-500 cursor-pointer select-none" title="Share to the vault">
                    <input type="checkbox" checked={e.visibility === 'public'} onChange={(ev) => onPatch(e.id, { visibility: ev.target.checked ? 'public' : 'channel' })} className="accent-[var(--brand-primary,#a855f7)]" />
                    Vault
                  </label>
                  <button onClick={() => onDelete(e.id)} className="text-zinc-600 hover:text-rose-400 transition-colors" aria-label="Delete">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                  </button>
                </div>
              </EmoteTile>
            ))}
          </Grid>
        ) : (
          <div className="space-y-1.5">
            {shownMine.map((e) => (
              <ListRow key={e.id} e={e}>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusPill e={e} />
                  <label className="flex items-center gap-1 text-[10px] text-zinc-500 cursor-pointer select-none" title="Share to the vault">
                    <input type="checkbox" checked={e.visibility === 'public'} onChange={(ev) => onPatch(e.id, { visibility: ev.target.checked ? 'public' : 'channel' })} className="accent-[var(--brand-primary,#a855f7)]" />
                    Vault
                  </label>
                  <button onClick={() => onDelete(e.id)} className="text-zinc-600 hover:text-rose-400 transition-colors" aria-label="Delete">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                  </button>
                </div>
              </ListRow>
            ))}
          </div>
        )}
      </Section>

      {added.length > 0 && (
        <Section title="Added from the vault" hint="Emotes from other castles, live in your chat.">
          {shownAdded.length === 0 ? (
            <p className="text-zinc-600 text-sm font-semibold py-10 text-center">No emotes match “{q}”.</p>
          ) : view === 'grid' ? (
            <Grid>
              {shownAdded.map((e) => (
                <EmoteTile key={e.id} url={e.imageUrl} size={e.width} animated={e.animated} zeroWidth={e.zeroWidth} code={e.code}>
                  <button onClick={() => onRemoveAdded(e.id)} className="text-[9px] font-black uppercase text-rose-300 hover:underline">Remove</button>
                </EmoteTile>
              ))}
            </Grid>
          ) : (
            <div className="space-y-1.5">
              {shownAdded.map((e) => (
                <ListRow key={e.id} e={e}>
                  <button onClick={() => onRemoveAdded(e.id)} className="text-[9px] font-black uppercase text-rose-300 hover:underline shrink-0">Remove</button>
                </ListRow>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

/* ─────────────────────────── emote vault (7TV-style directory) ─────────────────────────── */
function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-xs font-black uppercase tracking-wide text-zinc-400 hover:text-white transition-colors mb-2.5">
        {title}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={cn('transition-transform', open && 'rotate-180')}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && <div className="space-y-2.5 pb-1">{children}</div>}
    </div>
  );
}
function FilterCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-zinc-300 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--brand-primary,#a855f7)] w-4 h-4" />
      {label}
    </label>
  );
}

function Directory({ onChanged }: { onChanged: () => void }) {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [animatedOnly, setAnimatedOnly] = useState(false);
  const [staticOnly, setStaticOnly] = useState(false);
  const [overlayOnly, setOverlayOnly] = useState(false);
  const [exact, setExact] = useState(false);
  const [sort, setSort] = useState<'new' | 'name'>('new');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [results, setResults] = useState<DirEmote[]>([]);
  const [loading, setLoading] = useState(true);

  const search = async () => {
    setLoading(true);
    const params = new URLSearchParams({ sort });
    if (q) params.set('q', q);
    if (tag) params.set('tag', tag);
    if (exact) params.set('exact', 'true');
    if (animatedOnly) params.set('animated', 'true');
    else if (staticOnly) params.set('animated', 'false');
    if (overlayOnly) params.set('overlaying', 'true');
    const r = await fetch(`${EMOTES}/directory?${params}`, { credentials: 'include' }).then((x) => x.json()).catch(() => ({}));
    setResults(Array.isArray(r.emotes) ? r.emotes : []);
    setLoading(false);
  };
  useEffect(() => { const t = setTimeout(search, 250); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [q, tag, exact, animatedOnly, staticOnly, overlayOnly, sort]);

  const toggle = async (e: DirEmote) => {
    const method = e.added ? 'DELETE' : 'POST';
    await fetch(`${EMOTES}/${e.id}/add`, { method, credentials: 'include' });
    setResults((xs) => xs.map((x) => x.id === e.id ? { ...x, added: !e.added } : x));
    onChanged();
  };

  const AddButton = ({ e }: { e: DirEmote }) => e.added
    ? <button onClick={() => toggle(e)} className="text-[9px] font-black uppercase text-emerald-400 hover:text-rose-300 transition-colors shrink-0" title="Remove from my channel">Added ✓</button>
    : <button onClick={() => toggle(e)} className="text-[9px] font-black uppercase text-brand-primary hover:underline shrink-0">+ Add</button>;

  return (
    <div className="grid lg:grid-cols-[15rem_1fr] gap-7">
      {/* ── Sidebar filters ─────────────────────────────────────── */}
      <aside className="space-y-6">
        <FilterSection title="Search">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Emote"
              className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-2.5 text-sm text-white outline-none focus:border-brand-primary/50" />
          </div>
        </FilterSection>

        <FilterSection title="Tags">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></svg>
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Enter tags"
              className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-2.5 text-sm text-white outline-none focus:border-brand-primary/50" />
          </div>
        </FilterSection>

        <FilterSection title="Filters">
          <FilterCheckbox label="Animated" checked={animatedOnly} onChange={(v) => { setAnimatedOnly(v); if (v) setStaticOnly(false); }} />
          <FilterCheckbox label="Static" checked={staticOnly} onChange={(v) => { setStaticOnly(v); if (v) setAnimatedOnly(false); }} />
          <FilterCheckbox label="Overlaying" checked={overlayOnly} onChange={setOverlayOnly} />
          <FilterCheckbox label="Exact Match" checked={exact} onChange={setExact} />
        </FilterSection>
      </aside>

      {/* ── Results ─────────────────────────────────────────────── */}
      <div className="space-y-5 min-w-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/5">
            {(['new', 'name'] as const).map((s) => (
              <button key={s} onClick={() => setSort(s)}
                className={cn('px-3.5 py-1.5 rounded-md text-xs font-black transition-colors', sort === s ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-white')}>
                {s === 'new' ? '✨ New' : '🔤 A–Z'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {!loading && <span className="text-[10px] font-black uppercase text-zinc-600">{results.length} found</span>}
            <div className="flex gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/5">
              <button onClick={() => setView('grid')} aria-label="Grid view" className={cn('p-1.5 rounded', view === 'grid' ? 'bg-white/10 text-white' : 'text-zinc-600 hover:text-zinc-300')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>
              </button>
              <button onClick={() => setView('list')} aria-label="List view" className={cn('p-1.5 rounded', view === 'list' ? 'bg-white/10 text-white' : 'text-zinc-600 hover:text-zinc-300')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
              </button>
            </div>
          </div>
        </div>

        {loading ? <Skeletons /> : results.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-3 text-center">
            <div className="text-4xl opacity-30">🗝️</div>
            <p className="text-zinc-600 text-sm font-semibold">No emotes match those filters.</p>
          </div>
        ) : view === 'grid' ? (
          <Grid>
            {results.map((e) => (
              <EmoteTile key={e.id} url={e.imageUrl} size={e.width} animated={e.animated} zeroWidth={e.zeroWidth} code={e.code} owner={e.owner}>
                <AddButton e={e} />
              </EmoteTile>
            ))}
          </Grid>
        ) : (
          <div className="space-y-1.5">
            {results.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-3 py-2 rounded-xl glass-card border border-white/5 hover:border-brand-primary/30 transition-colors">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={checker}>
                  <img src={e.imageUrl} alt={e.code} style={{ height: Math.min(28, e.width) }} className="object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-white truncate">{e.code}</p>
                  {e.owner && <p className="text-[10px] text-zinc-500 truncate">{e.owner}</p>}
                </div>
                <AddButton e={e} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── uploader (7TV-style) ─────────────────────────── */
function CreateModal({ seedFile, onClose, onSaved }: { seedFile: File | null; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [code, setCode] = useState('');
  const [tags, setTags] = useState('');
  const [overlaying, setOverlaying] = useState(false);
  const [priv, setPriv] = useState(true);
  const [accept, setAccept] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState('');
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (f: File | null) => {
    if (!f) return;
    const optimized = await compressStatic(f);
    setFile(optimized);
    setPreview(URL.createObjectURL(optimized));
    if (!code) setCode(f.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 30));
  };
  // Pre-load a file dragged onto the page.
  useEffect(() => { if (seedFile) pick(seedFile); /* eslint-disable-next-line */ }, []);

  const shown = mode === 'upload' ? preview : url;

  const submit = async () => {
    setErr('');
    if (!/^[A-Za-z0-9][A-Za-z0-9_]{1,29}$/.test(code)) { setErr('Name: 2–30 letters, digits or _, starting with a letter/digit.'); return; }
    if (!accept) { setErr('Please accept the rules and guidelines.'); return; }
    setBusy(true);
    let res: Response;
    if (mode === 'upload') {
      if (!file) { setErr('Choose an image.'); setBusy(false); return; }
      const fd = new FormData();
      fd.append('file', file); fd.append('code', code);
      fd.append('tags', tags); fd.append('zeroWidth', String(overlaying)); fd.append('share', String(!priv));
      // 7TV-style 1x–4x webp, resized here in the browser. Animated emotes come
      // back null and ship without variants — the CDN serves their original.
      const variants = await buildVariants(file);
      if (variants) for (const [size, blob] of Object.entries(variants)) fd.append(size, blob, `${size}.webp`);
      res = await fetch(EMOTES, { method: 'POST', body: fd, credentials: 'include' });
    } else {
      if (!url.trim()) { setErr('Enter an image URL.'); setBusy(false); return; }
      res = await fetch(EMOTES, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ code, imageUrl: url.trim(), tags, zeroWidth: overlaying, share: !priv }) });
    }
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || 'Could not add emote.'); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card rounded-[2rem] border border-white/10 w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-7 pt-6 pb-4 border-b border-white/5">
          <h2 className="text-xl font-black text-white">Upload Emote</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="grid md:grid-cols-2 gap-7 p-7">
          {/* ── Left: the form ─────────────────────────────────────────── */}
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-bold text-zinc-400">Emote Name</label>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))} placeholder="Emote Name"
                className="w-full mt-1.5 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-brand-primary/50" />
            </div>

            <div>
              <label className="text-[11px] font-bold text-zinc-400">Tags</label>
              <div className="relative mt-1.5">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></svg>
                <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Enter tags"
                  className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-2.5 text-sm text-white outline-none focus:border-brand-primary/50" />
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-zinc-300 cursor-pointer select-none">
              <input type="checkbox" checked={overlaying} onChange={(e) => setOverlaying(e.target.checked)} className="accent-[var(--brand-primary,#a855f7)] w-4 h-4" />
              Overlaying
            </label>
            <label className="flex items-center gap-2.5 text-sm text-zinc-300 cursor-pointer select-none">
              <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} className="accent-[var(--brand-primary,#a855f7)] w-4 h-4" />
              Private
            </label>
            <label className="flex items-center gap-2.5 text-sm text-zinc-300 cursor-pointer select-none">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="accent-[var(--brand-primary,#a855f7)] w-4 h-4" />
              I accept the rules and guidelines
            </label>

            <button onClick={() => setShowRules((s) => !s)} className="block text-xs font-bold text-brand-primary hover:underline">Emote Upload Guidelines</button>
            {showRules && (
              <ul className="text-[11px] text-zinc-500 space-y-1 list-disc pl-4">
                <li>You have the rights to the image you upload.</li>
                <li>No hateful, harassing, or explicit content.</li>
                <li>Overlaying emotes should be transparent to stack cleanly.</li>
                <li>Shared (public) emotes are reviewed before entering the vault.</li>
              </ul>
            )}

            {err && <p className="text-[11px] text-rose-400 font-semibold">{err}</p>}

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="px-5 py-2.5 rounded-lg text-sm font-bold bg-white/[0.04] border border-white/10 text-zinc-300 hover:text-white transition-colors">Discard</button>
              <button onClick={submit} disabled={busy || !shown || !accept} className="px-5 py-2.5 rounded-lg text-sm font-bold bg-zinc-200 text-zinc-900 hover:bg-white transition-colors disabled:opacity-40">{busy ? 'Uploading…' : 'Upload'}</button>
            </div>
          </div>

          {/* ── Right: the drop zone ───────────────────────────────────── */}
          <div
            onClick={() => mode === 'upload' && fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); setMode('upload'); pick(e.dataTransfer.files?.[0] ?? null); }}
            className={cn('relative flex flex-col items-center justify-center min-h-[19rem] rounded-lg border-2 border-dashed transition-colors overflow-hidden p-6',
              mode === 'upload' && 'cursor-pointer',
              drag ? 'border-brand-primary bg-brand-primary/10' : 'border-white/20 hover:border-brand-primary/50')}
            style={shown ? checker : undefined}
          >
            <input ref={fileRef} type="file" accept="image/png,image/gif,image/webp,.apng" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />

            {shown ? (
              <>
                <img src={shown} alt="" style={{ height: 128 }} className="object-contain" />
                <button onClick={(e) => { e.stopPropagation(); setMode('upload'); fileRef.current?.click(); }}
                  className="mt-4 px-4 py-2 rounded-lg text-xs font-bold bg-black/50 border border-white/15 text-zinc-200 hover:text-white transition-colors">Replace</button>
              </>
            ) : mode === 'url' ? (
              <div className="w-full text-center" onClick={(e) => e.stopPropagation()}>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/catJAM.gif"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-brand-primary/50" />
                <button onClick={() => setMode('upload')} className="mt-3 text-xs font-bold text-brand-primary hover:underline">← Back to file upload</button>
              </div>
            ) : (
              <div className="text-center pointer-events-none">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300 mx-auto mb-4"><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" /></svg>
                <p className="text-white font-bold text-lg mb-3">Drag &amp; Drop to upload, or</p>
                <span className="inline-block px-4 py-2 rounded-lg text-sm font-bold bg-zinc-700/60 border border-white/10 text-zinc-100">Browse Files</span>
                <p className="text-[11px] text-zinc-600 mt-6 leading-relaxed">1MB max file size<br />PNG · GIF · WEBP · APNG<br /><span className="text-zinc-700">static images auto-converted to AVIF</span></p>
                <button onClick={(e) => { e.stopPropagation(); setMode('url'); }} className="mt-3 text-[11px] font-bold text-brand-primary hover:underline pointer-events-auto">or use an image URL</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
