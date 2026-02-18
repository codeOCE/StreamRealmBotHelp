'use client';

import React from 'react';
import { useEditor } from '../store';
import { ArrowLeft, Undo2, Redo2, Save, MonitorPlay } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function TopToolbar() {
    const { state, dispatch } = useEditor();
    const router = useRouter();

    const canUndo = state.historyIndex > 0;
    const canRedo = state.historyIndex < state.history.length - 1;

    return (
        <div className="h-14 bg-neutral-900 border-b border-white/10 flex items-center justify-between px-4">
            <div className="flex items-center gap-4">
                <button
                    onClick={() => router.back()}
                    className="p-2 hover:bg-white/5 rounded-lg transition-colors text-neutral-400 hover:text-white"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="h-6 w-px bg-white/10" />
                <h1 className="font-bold text-sm tracking-wide">{state.overlay?.name || 'Untitled Overlay'}</h1>
            </div>

            <div className="flex items-center gap-2">
                <div className="flex bg-black/20 rounded-lg p-1 border border-white/5">
                    <button
                        onClick={() => dispatch({ type: 'UNDO' })}
                        disabled={!canUndo}
                        className={`p-2 rounded transition-colors ${canUndo ? 'hover:bg-white/10 text-neutral-200' : 'text-neutral-700 cursor-not-allowed'
                            }`}
                        title="Undo (Ctrl+Z)"
                    >
                        <Undo2 size={16} />
                    </button>
                    <button
                        onClick={() => dispatch({ type: 'REDO' })}
                        disabled={!canRedo}
                        className={`p-2 rounded transition-colors ${canRedo ? 'hover:bg-white/10 text-neutral-200' : 'text-neutral-700 cursor-not-allowed'
                            }`}
                        title="Redo (Ctrl+Shift+Z)"
                    >
                        <Redo2 size={16} />
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <div className="text-xs text-neutral-500 font-medium">
                    {state.widgets.length} Widgets
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-colors">
                    <Save size={14} />
                    Save
                </button>
                <button className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-purple-400">
                    <MonitorPlay size={16} />
                </button>
            </div>
        </div>
    );
}
