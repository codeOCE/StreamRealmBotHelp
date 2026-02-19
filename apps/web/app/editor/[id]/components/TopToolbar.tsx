'use client';

import React from 'react';
import { useEditor } from '../store';
import { ArrowLeft, Undo2, Redo2, Plus, Eye, Settings, Cloud, Zap, Triangle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function TopToolbar() {
    const { state, dispatch } = useEditor();
    const router = useRouter();

    const canUndo = state.historyIndex > 0;
    const canRedo = state.historyIndex < state.history.length - 1;

    return (
        <div className="h-16 bg-neutral-900 border-b border-white/5 flex items-center justify-between px-6">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                        <Triangle className="text-white fill-current" size={18} />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h1 className="font-black text-lg tracking-tight text-white">StreamCanvas</h1>
                        <span className="text-neutral-500 text-sm font-medium">/ {state.overlay?.name || 'Gaming Setup v2'}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-neutral-500 text-xs font-medium ml-4">
                    <Cloud size={14} className="text-neutral-600" />
                    <span>Auto-saved at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="flex items-center bg-black/40 rounded-lg p-1 border border-white/5">
                    <button
                        onClick={() => dispatch({ type: 'UNDO' })}
                        disabled={!canUndo}
                        className={`p-2 rounded transition-colors ${canUndo ? 'hover:bg-white/10 text-neutral-200' : 'text-neutral-600 cursor-not-allowed'}`}
                    >
                        <Undo2 size={18} />
                    </button>
                    <button
                        onClick={() => dispatch({ type: 'REDO' })}
                        disabled={!canRedo}
                        className={`p-2 rounded transition-colors ${canRedo ? 'hover:bg-white/10 text-neutral-200' : 'text-neutral-600 cursor-not-allowed'}`}
                    >
                        <Redo2 size={18} />
                    </button>
                </div>

                <div className="h-4 w-px bg-white/10" />

                <button className="flex items-center gap-2 px-4 py-2 border border-purple-500/30 hover:bg-purple-500/10 text-purple-400 rounded-lg text-xs font-bold transition-all">
                    <Plus size={16} />
                    Add Widget
                </button>

                <div className="h-4 w-px bg-white/10" />

                <div className="flex items-center gap-1">
                    <button className="p-2 text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                        <Eye size={20} />
                    </button>
                    <button className="p-2 text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                        <Settings size={20} />
                    </button>
                </div>

                <button className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-black shadow-lg shadow-purple-600/20 transition-all active:scale-95">
                    Publish Live
                </button>
            </div>
        </div>
    );
}
