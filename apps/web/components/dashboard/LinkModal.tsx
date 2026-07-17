"use client";

import React, { useEffect, useState } from 'react';

export interface ProfileLink {
    id?: string;
    label: string;
    url: string;
    icon?: string | null;
    enabled: boolean;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSave: (link: ProfileLink) => void;
    initialData?: ProfileLink | null;
}

export default function LinkModal({ isOpen, onClose, onSave, initialData }: Props) {
    const [label, setLabel] = useState('');
    const [url, setUrl] = useState('');
    const [icon, setIcon] = useState('');
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        if (initialData) {
            setLabel(initialData.label);
            setUrl(initialData.url ?? '');
            setIcon(initialData.icon ?? '');
            setEnabled(initialData.enabled);
        } else {
            setLabel(''); setUrl(''); setIcon(''); setEnabled(true);
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        let href = url.trim();
        if (href && !/^https?:\/\//i.test(href)) href = `https://${href}`;
        onSave({ id: initialData?.id, label, url: href, icon: icon.trim() || null, enabled });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-[#050508]/85 backdrop-blur-xl animate-in fade-in duration-200" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="w-full max-w-md bg-surface-base border border-white/8 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between sticky top-0 bg-surface-base z-10">
                    <div>
                        <h2 className="text-base font-bold text-white tracking-tight">{initialData ? 'Edit Link' : 'New Link'}</h2>
                        <p className="text-xs text-zinc-500 mt-0.5">Shown on your public link page</p>
                    </div>
                    <button onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-xl text-zinc-500 hover:text-white hover:bg-white/8 transition-colors cursor-pointer" aria-label="Close">
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>

                <form onSubmit={submit} className="p-6 space-y-4">
                    <div className="flex gap-3">
                        <div className="space-y-1.5 w-20 shrink-0">
                            <label className="text-xs font-semibold text-zinc-400 block">Icon</label>
                            <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} className="void-input text-center text-lg" placeholder="🔗" maxLength={4} />
                        </div>
                        <div className="space-y-1.5 flex-1">
                            <label className="text-xs font-semibold text-zinc-400 block">Label</label>
                            <input required autoFocus type="text" value={label} onChange={(e) => setLabel(e.target.value)} className="void-input" placeholder="Discord" maxLength={80} />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400 block">URL</label>
                        <input required type="text" value={url} onChange={(e) => setUrl(e.target.value)} className="void-input" placeholder="https://discord.gg/…" />
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button type="button" onClick={onClose} className="saas-button-secondary flex-1">Cancel</button>
                        <button type="submit" className="saas-button flex-[2]">{initialData ? 'Save Changes' : 'Add Link'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
