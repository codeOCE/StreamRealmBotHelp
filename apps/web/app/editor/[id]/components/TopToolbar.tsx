'use client';

import React from 'react';
import { useEditor } from '../store';
import { Undo2, Redo2, Eye, Cloud } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/api';

export function TopToolbar() {
    const { state, dispatch } = useEditor();
    const router = useRouter();

    const [isSaving, setIsSaving] = React.useState(false);
    const [saveStatus, setSaveStatus] = React.useState<'idle' | 'success' | 'error'>('idle');

    const canUndo = state.historyIndex > 0;
    const canRedo = state.historyIndex < state.history.length - 1;

    // Change-detection key: ignore `id` so reconciling temp ids -> server ids after a
    // save doesn't look like a new edit and re-trigger autosave.
    const serialize = (ws: typeof state.widgets) =>
        JSON.stringify(ws, (k, v) => (k === 'id' ? undefined : v));

    const lastSavedRef = React.useRef<string>('');
    const initRef = React.useRef(false);

    const saveWidgets = React.useCallback(async (): Promise<boolean> => {
        if (!state.overlay?.id) return false;
        const sentIds = state.widgets.map(w => w.id);
        setIsSaving(true);
        setSaveStatus('idle');
        try {
            const res = await fetch(apiUrl(`/api/overlays/${state.overlay.id}/sync`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ widgets: state.widgets }),
            });
            if (!res.ok) throw new Error('Failed to save overlay');
            const saved = await res.json();
            // sync returns records in the same order it received them — map temp ids
            // to the server ids so the next save updates instead of duplicating.
            const remap = sentIds
                .map((from, i) => ({ from, to: saved[i]?.id }))
                .filter((r): r is { from: string; to: string } => !!r.to && r.from !== r.to);
            if (remap.length) dispatch({ type: 'RECONCILE_WIDGET_IDS', payload: remap });
            setSaveStatus('success');
            setTimeout(() => setSaveStatus('idle'), 2000);
            return true;
        } catch (error) {
            console.error('Save failed:', error);
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 3000);
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [state.overlay?.id, state.widgets, dispatch]);

    // Debounced auto-save: 1s after the last widget change. Skips the initial load
    // and no-op changes.
    React.useEffect(() => {
        if (!state.overlay?.id) return;
        const snap = serialize(state.widgets);
        if (!initRef.current) { initRef.current = true; lastSavedRef.current = snap; return; }
        if (snap === lastSavedRef.current) return;
        const t = setTimeout(async () => {
            if (await saveWidgets()) lastSavedRef.current = snap;
        }, 1000);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.widgets, state.overlay?.id]);

    const handlePublish = async () => {
        if (isSaving) return;
        if (await saveWidgets()) lastSavedRef.current = serialize(state.widgets);
    };

    return (
        <div className="h-14 bg-surface-base border-b border-white/5 flex items-center justify-between px-4 shrink-0 z-10">
            {/* Left — back + name */}
            <div className="flex items-center gap-3 min-w-0">
                <button
                    onClick={() => router.push('/dashboard/overlays')}
                    className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 transition-colors duration-150 cursor-pointer shrink-0"
                    aria-label="Back to overlays"
                >
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <polyline points="15 18 9 12 15 6"/>
                    </svg>
                </button>

                <div className="w-px h-5 bg-white/8 shrink-0" />

                {/* CC monogram */}
                <div className="w-7 h-7 rounded-lg bg-brand-primary/15 border border-brand-primary/20 flex items-center justify-center shrink-0">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#3faaff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                    </svg>
                </div>

                <div className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 shrink-0">Overlay</span>
                    <span className="text-zinc-700 text-xs shrink-0">/</span>
                    <span className="text-sm font-bold text-white truncate">{state.overlay?.name || 'Untitled'}</span>
                </div>

                {/* Save status */}
                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    {isSaving ? (
                        <div className="w-3 h-3 border border-brand-primary/40 border-t-brand-primary rounded-full animate-spin" />
                    ) : saveStatus === 'success' ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    ) : saveStatus === 'error' ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    ) : null}
                    {(isSaving || saveStatus !== 'idle') && (
                        <span className="text-[10px] text-zinc-600 font-medium">
                            {isSaving ? 'Saving…' : saveStatus === 'success' ? 'Saved' : 'Failed'}
                        </span>
                    )}
                </div>
            </div>

            {/* Center — undo / redo */}
            <div className="flex items-center gap-1 bg-white/[0.03] border border-white/5 rounded-xl p-1">
                <button
                    onClick={() => dispatch({ type: 'UNDO' })}
                    disabled={!canUndo}
                    aria-label="Undo"
                    className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors duration-150 ${canUndo ? 'text-zinc-400 hover:text-white hover:bg-white/8 cursor-pointer' : 'text-zinc-700 cursor-not-allowed'}`}
                >
                    <Undo2 size={15} />
                </button>
                <button
                    onClick={() => dispatch({ type: 'REDO' })}
                    disabled={!canRedo}
                    aria-label="Redo"
                    className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors duration-150 ${canRedo ? 'text-zinc-400 hover:text-white hover:bg-white/8 cursor-pointer' : 'text-zinc-700 cursor-not-allowed'}`}
                >
                    <Redo2 size={15} />
                </button>
            </div>

            {/* Right — preview + publish */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => window.open(apiUrl(`/api/overlays/${state.overlay?.id}/browser-source-url`), '_blank')}
                    className="flex items-center gap-2 px-3 h-9 rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/8 text-xs font-semibold transition-[color,background-color,border-color] duration-150 cursor-pointer"
                >
                    <Eye size={14} />
                    Preview
                </button>

                <button
                    onClick={handlePublish}
                    disabled={isSaving}
                    className={`flex items-center gap-2 px-4 h-9 rounded-xl text-xs font-black uppercase tracking-wide transition-[opacity,background-color] duration-150 active:scale-95 cursor-pointer ${
                        isSaving
                            ? 'bg-white/5 text-zinc-600 cursor-not-allowed'
                            : 'bg-brand-primary text-[#05070a] hover:opacity-90 shadow-[0_4px_20px_rgba(63,170,255,0.25)]'
                    }`}
                >
                    {isSaving ? (
                        <>
                            <div className="w-3 h-3 border border-zinc-600/40 border-t-zinc-500 rounded-full animate-spin" />
                            Saving
                        </>
                    ) : (
                        <>
                            <Cloud size={13} />
                            Publish
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
