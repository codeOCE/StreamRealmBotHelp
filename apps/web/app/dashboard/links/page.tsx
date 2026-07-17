"use client";

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import LinkModal, { ProfileLink } from '../../../components/dashboard/LinkModal';

interface LinkRow extends ProfileLink { id: string; }

export default function LinksPage() {
    const [links, setLinks] = useState<LinkRow[]>([]);
    const [streamerId, setStreamerId] = useState('');
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<LinkRow | undefined>(undefined);
    const LINKS = apiUrl('/api/links');

    const load = async () => {
        const r = await fetch(LINKS, { credentials: 'include' }).then((x) => x.json()).catch(() => ({}));
        setLinks(Array.isArray(r.links) ? r.links : []);
    };

    useEffect(() => {
        (async () => {
            setLoading(true);
            const me = await fetch(apiUrl('/api/user/me'), { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
            setStreamerId(me?.tenantId ?? me?.id ?? '');
            await load();
            setLoading(false);
        })();
    }, []);

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
    };
    const move = async (index: number, dir: -1 | 1) => {
        const next = [...links];
        const swap = index + dir;
        if (swap < 0 || swap >= next.length) return;
        [next[index], next[swap]] = [next[swap], next[index]];
        setLinks(next);
        await fetch(`${LINKS}/reorder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: next.map((l) => l.id) }), credentials: 'include' });
    };

    const shareUrl = streamerId && typeof window !== 'undefined' ? `${window.location.origin}/links/${streamerId}` : '';

    return (
        <div className="space-y-8 max-w-4xl mx-auto">
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
                    <button onClick={() => navigator.clipboard?.writeText(shareUrl)} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-brand-primary/15 text-brand-primary border border-brand-primary/20 hover:bg-brand-primary/25 transition-colors shrink-0">Copy</button>
                </div>
            )}

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
                    <div key={l.id} className={cn('glass-card rounded-2xl p-4 border transition-all duration-300 flex items-center gap-3', l.enabled ? 'border-white/5' : 'opacity-40 grayscale border-white/5')}>
                        <div className="flex flex-col shrink-0">
                            <button onClick={() => move(i, -1)} disabled={i === 0} className="text-zinc-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer" aria-label="Move up">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                            </button>
                            <button onClick={() => move(i, 1)} disabled={i === links.length - 1} className="text-zinc-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer" aria-label="Move down">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-lg shrink-0">{l.icon || '🔗'}</div>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-black text-white truncate text-sm">{l.label}</h3>
                            <p className="text-[11px] text-zinc-500 truncate">{l.url}</p>
                        </div>
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
    );
}
