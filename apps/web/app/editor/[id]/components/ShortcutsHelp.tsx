'use client';

import React, { useEffect, useState } from 'react';
import { Keyboard, X } from 'lucide-react';

// Self-contained: its own trigger button, `?` hotkey, and modal. Surfaces the
// editor's power features so they're actually discoverable.
const GROUPS: { title: string; items: [string, string][] }[] = [
    {
        title: 'Edit',
        items: [
            ['⌘/Ctrl Z', 'Undo'],
            ['⌘/Ctrl ⇧ Z', 'Redo'],
            ['⌘/Ctrl C / V', 'Copy / paste'],
            ['⌘/Ctrl D', 'Duplicate'],
            ['Delete', 'Remove selected'],
        ],
    },
    {
        title: 'Arrange',
        items: [
            ['Arrows', 'Nudge 1px (⇧ = 10px)'],
            ['⌘/Ctrl ] / [', 'Forward / backward'],
            ['⌘/Ctrl ⇧ ] / [', 'To front / back'],
            ['Drag layer row', 'Reorder layers'],
        ],
    },
    {
        title: 'Canvas',
        items: [
            ['Drag', 'Snaps to guides'],
            ['Alt + drag', 'Disable snapping'],
            ['⇧ + rotate', 'Snap to 15°'],
            ['Space + drag', 'Pan'],
            ['Ctrl + wheel', 'Zoom'],
            ['⌘/Ctrl A', 'Select all'],
            ['Esc', 'Deselect'],
        ],
    },
];

export function ShortcutsHelp() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key === '?') { e.preventDefault(); setOpen(o => !o); }
            else if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                title="Keyboard shortcuts (?)"
                aria-label="Keyboard shortcuts"
                className="fixed bottom-4 right-4 z-[200] w-9 h-9 flex items-center justify-center rounded-full bg-[#0a0c10]/90 backdrop-blur-md border border-white/8 text-zinc-500 hover:text-brand-primary hover:border-brand-primary/30 transition-colors cursor-pointer shadow-lg"
            >
                <Keyboard size={15} />
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-150"
                    onClick={(e) => e.target === e.currentTarget && setOpen(false)}
                >
                    <div className="w-full max-w-2xl bg-[#0a0c10] border border-white/8 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                            <div className="flex items-center gap-2">
                                <Keyboard size={14} className="text-brand-primary" />
                                <h3 className="text-[13px] font-black text-white tracking-tight">Keyboard Shortcuts</h3>
                            </div>
                            <button onClick={() => setOpen(false)} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-white/8 transition-colors cursor-pointer">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-6">
                            {GROUPS.map(group => (
                                <div key={group.title} className="space-y-2.5">
                                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-600">{group.title}</p>
                                    {group.items.map(([keys, label]) => (
                                        <div key={label} className="flex items-center justify-between gap-3">
                                            <span className="text-[11px] text-zinc-400">{label}</span>
                                            <kbd className="text-[9px] font-bold text-zinc-300 bg-white/[0.04] border border-white/8 rounded px-1.5 py-0.5 whitespace-nowrap">{keys}</kbd>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
