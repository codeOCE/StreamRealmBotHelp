"use client";

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import { connectRealtime } from '@/lib/realtime';
import ShopItemModal, { ShopItem } from '../../../components/dashboard/ShopItemModal';

interface ItemRow extends ShopItem { id: string; code: string; }
interface Redemption {
    id: string;
    itemName: string;
    viewerName: string;
    cost: number;
    status: 'pending' | 'fulfilled' | 'refunded';
    createdAt: string;
}

export default function ShopPage() {
    const [items, setItems] = useState<ItemRow[]>([]);
    const [redemptions, setRedemptions] = useState<Redemption[]>([]);
    const [streamerId, setStreamerId] = useState('');
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<ItemRow | undefined>(undefined);
    const [tab, setTab] = useState<'all' | 'pending'>('pending');
    const ITEMS = apiUrl('/api/shop/items');

    const loadItems = async () => {
        const r = await fetch(ITEMS, { credentials: 'include' }).then((x) => x.json()).catch(() => ({}));
        setItems(Array.isArray(r.items) ? r.items : []);
    };
    const loadQueue = async () => {
        const url = apiUrl(`/api/shop/redemptions${tab === 'pending' ? '?status=pending' : ''}`);
        const r = await fetch(url, { credentials: 'include' }).then((x) => x.json()).catch(() => ({}));
        setRedemptions(Array.isArray(r.redemptions) ? r.redemptions : []);
    };

    useEffect(() => {
        (async () => {
            setLoading(true);
            const me = await fetch(apiUrl('/api/user/me'), { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
            setStreamerId(me?.tenantId ?? me?.id ?? '');
            await Promise.all([loadItems(), loadQueue()]);
            setLoading(false);
        })();
    }, []);
    useEffect(() => { loadQueue(); /* eslint-disable-next-line */ }, [tab]);

    // Live: a !buy in chat pushes a redemption — refresh the queue.
    useEffect(() => {
        if (!streamerId) return;
        return connectRealtime(`shop:${streamerId}`, (event) => { if (event === 'redemption') loadQueue(); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streamerId, tab]);

    const save = async (item: ShopItem) => {
        try {
            if (editing) {
                await fetch(`${ITEMS}/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item), credentials: 'include' });
            } else {
                await fetch(ITEMS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item), credentials: 'include' });
            }
            loadItems();
            setModalOpen(false);
        } catch (e) { console.error(e); }
    };
    const toggle = async (id: string) => {
        await fetch(`${ITEMS}/${id}/toggle`, { method: 'PATCH', credentials: 'include' });
        loadItems();
    };
    const remove = async (id: string) => {
        if (!confirm('Delete this reward?')) return;
        await fetch(`${ITEMS}/${id}`, { method: 'DELETE', credentials: 'include' });
        setItems((xs) => xs.filter((i) => i.id !== id));
    };
    const resolve = async (id: string, action: 'fulfill' | 'refund') => {
        await fetch(apiUrl(`/api/shop/redemptions/${id}/${action}`), { method: 'POST', credentials: 'include' });
        loadQueue();
    };

    const pendingCount = redemptions.filter((r) => r.status === 'pending').length;

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <div className="flex items-start justify-between gap-6 flex-wrap">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-white font-heading">The Royal Shop</h1>
                    <p className="text-brand-muted text-sm font-medium mt-1">
                        Let your subjects spend their Points. They redeem in chat with <code className="text-brand-primary">!shop</code> and <code className="text-brand-primary">!buy &lt;code&gt;</code>.
                    </p>
                </div>
                <button onClick={() => { setEditing(undefined); setModalOpen(true); }} className="saas-button">+ New Reward</button>
            </div>

            {streamerId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {([
                        { label: 'Viewer store link', hint: 'Share so viewers can browse rewards', path: `/shop/${streamerId}` },
                        { label: 'Redemption overlay', hint: 'Add as an OBS browser source', path: `/overlay/shop/${streamerId}` },
                    ]).map(({ label, hint, path }) => {
                        const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;
                        return (
                            <div key={path} className="glass-card rounded-2xl p-4 border border-white/5 flex items-center gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-black  text-zinc-400">{label}</p>
                                    <p className="text-xs text-zinc-500 truncate">{hint}</p>
                                </div>
                                <button onClick={() => navigator.clipboard?.writeText(url)} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-brand-primary/15 text-brand-primary border border-brand-primary/20 hover:bg-brand-primary/25 transition-colors shrink-0">Copy</button>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Items */}
                <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5">
                    {loading ? (
                        [0, 1, 2, 3].map((i) => <div key={i} className="glass-card rounded-[2rem] p-7 border border-white/5"><div className="skeleton h-24 w-full rounded-xl" /></div>)
                    ) : items.length === 0 ? (
                        <div className="md:col-span-2 py-24 flex flex-col items-center justify-center bento-card gap-6">
                            <div className="text-5xl opacity-30">🏰</div>
                            <p className="text-zinc-700 font-black  text-[11px]">The shop is empty</p>
                            <button onClick={() => { setEditing(undefined); setModalOpen(true); }} className="saas-button">Add your first reward</button>
                        </div>
                    ) : items.map((it) => (
                        <div key={it.id} className={cn('glass-card rounded-[2rem] p-6 border transition-all duration-300', it.enabled ? 'border-white/5 hover:border-brand-primary/40' : 'opacity-40 grayscale border-white/5')}>
                            <div className="flex items-start justify-between gap-3 mb-4">
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-2xl shrink-0 overflow-hidden">
                                        {it.imageUrl ? <img src={it.imageUrl} alt="" className="w-full h-full object-cover" /> : (it.icon || '🎁')}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-black text-white truncate">{it.name}</h3>
                                        <p className="text-[11px] text-zinc-500 line-clamp-2 leading-snug">{it.description || '—'}</p>
                                    </div>
                                </div>
                                <button onClick={() => toggle(it.id)} className="w-12 h-6 rounded-full relative transition-colors border border-white/10 p-0.5 shrink-0 cursor-pointer" style={{ background: it.enabled ? 'var(--brand-primary, #a855f7)' : '#18181b' }} aria-label="Toggle">
                                    <div className="w-5 h-5 bg-white rounded-full transition-transform" style={{ transform: it.enabled ? 'translateX(24px)' : 'translateX(0)' }} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between gap-2 pt-4 border-t border-white/[0.05]">
                                <div className="flex items-center gap-2 flex-wrap text-[9px] font-black ">
                                    <span className="px-2 py-1 rounded-lg border text-brand-primary bg-brand-primary/10 border-brand-primary/20">{it.cost} pts</span>
                                    <span className="px-2 py-1 rounded-lg border text-zinc-400 bg-white/5 border-white/10">!buy {it.code}</span>
                                    {it.stock != null && <span className="px-2 py-1 rounded-lg border text-amber-300 bg-amber-400/10 border-amber-400/20">{it.stock} left</span>}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button onClick={() => { setEditing(it); setModalOpen(true); }} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-zinc-600 hover:text-white hover:bg-brand-primary/20 transition-colors cursor-pointer" aria-label="Edit">
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                                    </button>
                                    <button onClick={() => remove(it.id)} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-zinc-600 hover:text-rose-400 hover:bg-rose-400/10 transition-colors cursor-pointer" aria-label="Delete">
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Fulfillment queue */}
                <div className="glass-card rounded-[2rem] p-6 border border-white/5">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-sm font-black  text-zinc-300">Redemptions{pendingCount ? ` · ${pendingCount}` : ''}</h3>
                        <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1">
                            {(['pending', 'all'] as const).map((t) => (
                                <button key={t} onClick={() => setTab(t)} className={cn('px-3 py-1 rounded-md text-[10px] font-black  transition-colors', tab === t ? 'bg-brand-primary text-white' : 'text-zinc-500 hover:text-white')}>{t}</button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2 max-h-[34rem] overflow-y-auto">
                        {redemptions.length === 0 ? (
                            <p className="text-xs text-zinc-600 py-12 text-center font-semibold">Nothing here yet.</p>
                        ) : redemptions.map((r) => (
                            <div key={r.id} className="px-3 py-3 rounded-xl bg-white/[0.02] border border-white/5">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs text-white font-semibold truncate"><span className="text-brand-primary">{r.viewerName}</span> → {r.itemName}</p>
                                        <p className="text-[10px] text-zinc-600  font-black">{r.cost} pts · {r.status}</p>
                                    </div>
                                    {r.status === 'pending' && (
                                        <div className="flex gap-1.5 shrink-0">
                                            <button onClick={() => resolve(r.id, 'fulfill')} className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors">Done</button>
                                            <button onClick={() => resolve(r.id, 'refund')} className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 transition-colors">Refund</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <ShopItemModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={save} initialData={editing} />
        </div>
    );
}
