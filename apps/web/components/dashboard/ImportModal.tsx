"use client";

import React from 'react';
import { ImportWizard } from './importer/ImportWizard';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (commands: any[]) => void;
}

export default function ImportModal({ isOpen, onClose, onImport }: ImportModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-2xl relative animate-in zoom-in-95 duration-300">
                <button
                    onClick={onClose}
                    className="absolute -top-12 right-0 w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.03] text-zinc-500 hover:text-white transition-all hover:bg-white/[0.08] border border-white/[0.05] z-10"
                >
                    ✕
                </button>
                <ImportWizard onComplete={onImport} onClose={onClose} />
            </div>
        </div>
    );
}
