'use client';

import React from 'react';
import { useEditor } from '../store';
import { Layers, Eye, Settings, Plus, Play } from 'lucide-react';

export function TopToolbar() {
    const { state } = useEditor();

    return (
        <div className="h-14 bg-[#09090b] border-b border-[#27272a] flex items-center justify-between px-4 shrink-0 z-30">
            {/* Left: Brand & Breadcrumbs */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-purple-900/20">
                        <Layers size={18} className="text-white" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-sm font-bold text-white tracking-wide">StreamCanvas</h1>
                            <span className="text-neutral-600">/</span>
                            <span className="text-sm text-neutral-400">{state.overlay?.name || 'Gaming Setup v2'}</span>
                        </div>
                    </div>
                </div>
                <div className="h-6 w-px bg-[#27272a] mx-2" />
                <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-mono">
                    <div className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
                    Auto-saved at 14:20
                </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 px-3 py-1.5 bg-[#18181b] hover:bg-[#27272a] text-purple-400 hover:text-purple-300 border border-[#27272a] rounded-md text-xs font-bold transition-all">
                    <Plus size={14} />
                    Add Widget
                </button>

                <div className="h-6 w-px bg-[#27272a]" />

                <div className="flex items-center gap-1">
                    <IconButton icon={<Eye size={16} />} title="Preview" />
                    <IconButton icon={<Settings size={16} />} title="Settings" />
                </div>

                <button className="flex items-center gap-2 px-4 py-2 bg-[#4b2bee] hover:bg-[#5b3bf0] text-white rounded-md text-xs font-bold shadow-lg shadow-purple-900/30 transition-all ml-2">
                    Publish Live
                </button>
            </div>
        </div>
    );
}

function IconButton({ icon, title }: { icon: React.ReactNode, title: string }) {
    return (
        <button
            className="p-2 text-neutral-400 hover:text-white hover:bg-[#27272a] rounded-md transition-colors"
            title={title}
        >
            {icon}
        </button>
    );
}
