"use client";

import React from 'react';
import { ImportWizard } from './importer/ImportWizard';
import type { ImportDataType } from './importer/ImportContext';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (items: any[], dataType: ImportDataType) => void;
}

export default function ImportModal({ isOpen, onClose, onImport }: ImportModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-2xl relative animate-in zoom-in-95 duration-300">
                <button
                    onClick={onClose}
                    className="absolute -top-12 right-0 w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.03] text-zinc-500 hover:text-white transition-all hover:bg-white/[0.08] border border-white/[0.05] z-10 cursor-pointer"
                    aria-label="Close"
                >
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <ImportWizard onComplete={onImport} onClose={onClose} />
            </div>
        </div>
    );
}
