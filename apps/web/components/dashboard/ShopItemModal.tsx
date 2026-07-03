"use client";

import React, { useEffect, useState } from 'react';

export interface ShopItem {
    id?: string;
    code?: string;
    name: string;
    description: string;
    icon?: string | null;
    imageUrl?: string | null;
    cost: number;
    stock: number | null;
    perUserLimit: number | null;
    enabled: boolean;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: ShopItem) => void;
    initialData?: ShopItem | null;
}

export default function ShopItemModal({ isOpen, onClose, onSave, initialData }: Props) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [description, setDescription] = useState('');
    const [icon, setIcon] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [cost, setCost] = useState(100);
    const [stock, setStock] = useState<string>('');
    const [perUserLimit, setPerUserLimit] = useState<string>('');
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
            setCode(initialData.code ?? '');
            setDescription(initialData.description ?? '');
            setIcon(initialData.icon ?? '');
            setImageUrl(initialData.imageUrl ?? '');
            setCost(initialData.cost);
            setStock(initialData.stock == null ? '' : String(initialData.stock));
            setPerUserLimit(initialData.perUserLimit == null ? '' : String(initialData.perUserLimit));
            setEnabled(initialData.enabled);
        } else {
            setName(''); setCode(''); setDescription(''); setIcon(''); setImageUrl(''); setCost(100); setStock(''); setPerUserLimit(''); setEnabled(true);
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            id: initialData?.id,
            name, code: code.trim() || undefined, description, icon: icon.trim() || null,
            imageUrl: imageUrl.trim() || null,
            cost: Math.max(0, Math.floor(cost)),
            stock: stock === '' ? null : Math.max(0, Math.floor(Number(stock))),
            perUserLimit: perUserLimit === '' ? null : Math.max(1, Math.floor(Number(perUserLimit))),
            enabled,
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-[#050508]/85 backdrop-blur-xl animate-in fade-in duration-200" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="w-full max-w-md bg-surface-base border border-white/8 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between sticky top-0 bg-surface-base z-10">
                    <div>
                        <h2 className="text-base font-bold text-white tracking-tight">{initialData ? 'Edit Reward' : 'New Reward'}</h2>
                        <p className="text-xs text-zinc-500 mt-0.5">Something viewers can buy with Points</p>
                    </div>
                    <button onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-xl text-zinc-500 hover:text-white hover:bg-white/8 transition-colors cursor-pointer" aria-label="Close">
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>

                <form onSubmit={submit} className="p-6 space-y-4">
                    <div className="flex gap-3">
                        <div className="space-y-1.5 w-20 shrink-0">
                            <label className="text-xs font-semibold text-zinc-400 block">Icon</label>
                            <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} className="void-input text-center text-lg" placeholder="🎁" maxLength={4} />
                        </div>
                        <div className="space-y-1.5 flex-1">
                            <label className="text-xs font-semibold text-zinc-400 block">Name</label>
                            <input required autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} className="void-input" placeholder="VIP shoutout" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400 block">Image URL <span className="text-zinc-600 font-normal">(optional)</span></label>
                        <div className="flex gap-3 items-center">
                            <div className="w-14 h-14 rounded-xl bg-white/[0.03] border border-white/8 flex items-center justify-center text-2xl shrink-0 overflow-hidden">
                                {imageUrl.trim()
                                    ? <img src={imageUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    : (icon || '🎁')}
                            </div>
                            <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="void-input flex-1" placeholder="https://… (falls back to the icon)" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400 block">Description</label>
                        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="void-input" placeholder="I'll shout you out on stream." />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-zinc-400 block">Cost (Points)</label>
                            <input type="number" min={0} value={cost} onChange={(e) => setCost(Number(e.target.value))} className="void-input" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-zinc-400 block">Buy code</label>
                            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} className="void-input" placeholder="auto from name" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-zinc-400 block">Stock</label>
                            <input type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} className="void-input" placeholder="∞ unlimited" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-zinc-400 block">Per-viewer limit</label>
                            <input type="number" min={1} value={perUserLimit} onChange={(e) => setPerUserLimit(e.target.value)} className="void-input" placeholder="∞ no limit" />
                        </div>
                    </div>

                    <p className="text-[11px] text-zinc-600 leading-relaxed">
                        Viewers buy this with <strong className="text-zinc-500">!buy {code.trim() || '<code>'}</strong>. Leave stock/limit blank for unlimited.
                    </p>

                    <div className="flex gap-3 pt-1">
                        <button type="button" onClick={onClose} className="saas-button-secondary flex-1">Cancel</button>
                        <button type="submit" className="saas-button flex-[2]">{initialData ? 'Save Changes' : 'Create Reward'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
