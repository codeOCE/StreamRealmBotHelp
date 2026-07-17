"use client";

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import LinkModal, { ProfileLink } from '../../../components/dashboard/LinkModal';
import { LinkIcon } from '../../../components/LinkIcon';
import { WALLPAPERS } from '@/lib/link-wallpapers';

interface LinkRow extends ProfileLink { id: string; clicks?: number; }
interface PageStyle {
    accent: string | null;
    buttonStyle: 'glass' | 'solid' | 'outline';
    shape: 'rounded' | 'pill' | 'sharp';
    wallpaper: string;
    title: string | null;
    bio: string | null;
}

export default function LinksPage() {
    const [links, setLinks] = useState<LinkRow[]>([]);
    const [streamerId, setStreamerId] = useState('');
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<LinkRow | undefined>(undefined);
    const [style, setStyle] = useState<PageStyle>({ accent: null, buttonStyle: 'glass', shape: 'rounded', wallpaper: 'default', title: null, bio: null });
    const styleSaveRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [previewKey, setPreviewKey] = useState(0);
    const bumpPreview = () => setPreviewKey((k) => k + 1);
    const LINKS = apiUrl('/api/links');

    const load = async () => {
        const r = await fetch(LINKS, { credentials: 'include' }).then((x) => x.json()).catch(() => ({}));
        setLinks(Array.isArray(r.links) ? r.links : []);
        bumpPreview();
    };

    useEffect(() => {
        (async () => {
            setLoading(true);
            const me = await fetch(apiUrl('/api/user/me'), { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
            setStreamerId(me?.tenantId ?? me?.id ?? '');
            const s = await fetch(`${LINKS}/settings`, { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
            if (s?.settings) setStyle(s.settings);
            await load();
            setLoading(false);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Debounced save — the color input fires on every drag tick.
    const saveStyle = (next: PageStyle) => {
        setStyle(next);
        clearTimeout(styleSaveRef.current);
        styleSaveRef.current = setTimeout(() => {
            fetch(`${LINKS}/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next), credentials: 'include' })
                .then(bumpPreview);
        }, 400);
    };

    const save = async (link: ProfileLink) => {
        try {
            if (editing) {
                await fetch(`${LINKS}/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(link), credentials: 'include' });
            } else {
                await fetch(LINKS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(link), credentials: 'include' });
            }
            load();
            setModalOpen(false);
        } catch (e) { console.error(e); }
    };
    const toggle = async (id: string) => {
        await fetch(`${LINKS}/${id}/toggle`, { method: 'PATCH', credentials: 'include' });
        load();
    };
    const remove = async (id: string) => {
        if (!confirm('Delete this link?')) return;
        await fetch(`${LINKS}/${id}`, { method: 'DELETE', credentials: 'include' });
        setLinks((xs) => xs.filter((l) => l.id !== id));
        bumpPreview();
    };
    const persistOrder = (list: LinkRow[]) =>
        fetch(`${LINKS}/reorder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: list.map((l) => l.id) }), credentials: 'include' })
            .then(bumpPreview);
    const move = (index: number, dir: -1 | 1) => {
        const next = [...links];
        const swap = index + dir;
        if (swap < 0 || swap >= next.length) return;
        [next[index], next[swap]] = [next[swap], next[index]];
        setLinks(next);
        persistOrder(next);
    };

    // Native HTML5 drag-and-drop; the arrow buttons stay as the touch fallback.
    const dragIdx = useRef<number | null>(null);
    const onDragOverRow = (i: number) => {
        if (dragIdx.current === null || dragIdx.current === i) return;
        setLinks((prev) => {
            const next = [...prev];
            const [moved] = next.splice(dragIdx.current!, 1);
            next.splice(i, 0, moved);
            return next;
        });
        dragIdx.current = i;
    };

    const shareUrl = streamerId && typeof window !== 'undefined' ? `${window.location.origin}/links/${streamerId}` : '';

    return (
        <div className="max-w-7xl mx-auto lg:grid lg:grid-cols-[1fr_360px] lg:gap-10 lg:items-start">
        <div className="space-y-8">
            <div className="flex items-start justify-between gap-6 flex-wrap">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-white font-heading">Links</h1>
                    <p className="text-brand-muted text-sm font-medium mt-1">One page for all your other links — socials, merch, Discord, anything.</p>
                </div>
                <button onClick={() => { setEditing(undefined); setModalOpen(true); }} className="saas-button">+ Add Link</button>
            </div>

            {shareUrl && (
                <div className="glass-card rounded-2xl p-4 border border-white/5 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black text-zinc-400">Your link page</p>
                        <p className="text-xs text-zinc-500 truncate">{shareUrl}</p>
                    </div>
                    <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10 transition-colors shrink-0">Preview</a>
                    <button onClick={() => navigator.clipboard?.writeText(shareUrl)} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-brand-primary/15 text-brand-primary border border-brand-primary/20 hover:bg-brand-primary/25 transition-colors shrink-0">Copy</button>
                </div>
            )}

            {/* ── Page style ── */}
            <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-4">
                <div className="flex items-center gap-6 flex-wrap">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest shrink-0">Page style</p>

                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-zinc-500">Accent</span>
                    <input
                        type="color"
                        value={style.accent ?? '#3faaff'}
                        onChange={(e) => saveStyle({ ...style, accent: e.target.value })}
                        className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                        aria-label="Accent color"
                    />
                    {style.accent && (
                        <button onClick={() => saveStyle({ ...style, accent: null })} className="text-[10px] font-black uppercase text-zinc-500 hover:text-white transition-colors cursor-pointer">Use brand color</button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-zinc-500">Buttons</span>
                    <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1">
                        {(['glass', 'solid', 'outline'] as const).map((b) => (
                            <button key={b} onClick={() => saveStyle({ ...style, buttonStyle: b })} className={cn('px-3 py-1 rounded-md text-[10px] font-black transition-colors cursor-pointer', style.buttonStyle === b ? 'bg-brand-primary text-white' : 'text-zinc-500 hover:text-white')}>{b}</button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-zinc-500">Shape</span>
                    <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1">
                        {(['rounded', 'pill', 'sharp'] as const).map((s) => (
                            <button key={s} onClick={() => saveStyle({ ...style, shape: s })} className={cn('px-3 py-1 rounded-md text-[10px] font-black transition-colors cursor-pointer', style.shape === s ? 'bg-brand-primary text-white' : 'text-zinc-500 hover:text-white')}>{s}</button>
                        ))}
                    </div>
                </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-white/5">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400 block">Page title</label>
                        <input type="text" value={style.title ?? ''} maxLength={80} onChange={(e) => saveStyle({ ...style, title: e.target.value || null })} className="void-input" placeholder="Defaults to your display name" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400 block">Bio</label>
                        <input type="text" value={style.bio ?? ''} maxLength={200} onChange={(e) => saveStyle({ ...style, bio: e.target.value || null })} className="void-input" placeholder="Defaults to your tagline" />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-xs font-semibold text-zinc-400 block">Wallpaper</label>
                        <div className="flex gap-2 flex-wrap">
                            {WALLPAPERS.map((w) => (
                                <button
                                    key={w.key}
                                    onClick={() => saveStyle({ ...style, wallpaper: w.key })}
                                    className={cn(
                                        'w-16 flex flex-col items-center gap-1 cursor-pointer group',
                                    )}
                                    aria-label={`Wallpaper: ${w.name}`}
                                >
                                    <span
                                        className={cn(
                                            'w-14 h-20 rounded-xl border-2 transition-all block',
                                            style.wallpaper === w.key ? 'border-brand-primary scale-105' : 'border-white/10 group-hover:border-white/30',
                                        )}
                                        style={{ background: w.css(style.accent ?? '#3faaff') }}
                                    />
                                    <span className={cn('text-[9px] font-black uppercase tracking-wide', style.wallpaper === w.key ? 'text-white' : 'text-zinc-600 group-hover:text-zinc-400')}>{w.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                {loading ? (
                    [0, 1, 2].map((i) => <div key={i} className="glass-card rounded-2xl p-5 border border-white/5"><div className="skeleton h-10 w-full rounded-xl" /></div>)
                ) : links.length === 0 ? (
                    <div className="py-24 flex flex-col items-center justify-center bento-card gap-6">
                        <div className="text-5xl opacity-30">🔗</div>
                        <p className="text-zinc-700 font-black text-[11px]">No links yet</p>
                        <button onClick={() => { setEditing(undefined); setModalOpen(true); }} className="saas-button">Add your first link</button>
                    </div>
                ) : links.map((l, i) => (
                    <div
                        key={l.id}
                        draggable
                        onDragStart={() => { dragIdx.current = i; }}
                        onDragOver={(e) => { e.preventDefault(); onDragOverRow(i); }}
                        onDragEnd={() => { dragIdx.current = null; persistOrder(links); }}
                        className={cn('glass-card rounded-2xl p-4 border transition-all duration-300 flex items-center gap-3 cursor-grab active:cursor-grabbing', l.enabled ? 'border-white/5' : 'opacity-40 grayscale border-white/5')}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-700 shrink-0" aria-hidden><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                        <div className="flex flex-col shrink-0">
                            <button onClick={() => move(i, -1)} disabled={i === 0} className="text-zinc-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer" aria-label="Move up">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                            </button>
                            <button onClick={() => move(i, 1)} disabled={i === links.length - 1} className="text-zinc-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer" aria-label="Move down">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center shrink-0"><LinkIcon icon={l.icon} url={l.url} size={20} /></div>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-black text-white truncate text-sm">{l.label}</h3>
                            <p className="text-[11px] text-zinc-500 truncate">{l.url}</p>
                        </div>
                        <span className="text-[10px] font-black text-zinc-500 tabular-nums shrink-0 hidden sm:block">{(l.clicks ?? 0).toLocaleString()} clicks</span>
                        <button onClick={() => toggle(l.id)} className="w-12 h-6 rounded-full relative transition-colors border border-white/10 p-0.5 shrink-0 cursor-pointer" style={{ background: l.enabled ? 'var(--brand-primary, #a855f7)' : '#18181b' }} aria-label="Toggle">
                            <div className="w-5 h-5 bg-white rounded-full transition-transform" style={{ transform: l.enabled ? 'translateX(24px)' : 'translateX(0)' }} />
                        </button>
                        <button onClick={() => { setEditing(l); setModalOpen(true); }} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-zinc-600 hover:text-white hover:bg-brand-primary/20 transition-colors cursor-pointer shrink-0" aria-label="Edit">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </button>
                        <button onClick={() => remove(l.id)} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-zinc-600 hover:text-rose-400 hover:bg-rose-400/10 transition-colors cursor-pointer shrink-0" aria-label="Delete">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                    </div>
                ))}
            </div>

            <LinkModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={save} initialData={editing} />
        </div>

        {/* ── Live preview (Linktree-style phone frame) ── */}
        {streamerId && (
            <div className="hidden lg:block sticky top-24">
                <div className="mx-auto w-[330px] h-[640px] rounded-[2.75rem] border-[6px] border-white/10 bg-black overflow-hidden shadow-2xl shadow-black/60">
                    <iframe key={previewKey} src={`/links/${streamerId}`} className="w-full h-full border-0" title="Live preview" />
                </div>
                <p className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-600 mt-3">Live preview</p>
            </div>
        )}
        </div>
    );
}
