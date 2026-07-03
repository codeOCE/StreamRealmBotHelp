'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { EditorLayout } from './components/EditorLayout';
import { useEditor } from './store';
import { EditorProvider } from './store';
import { useRef } from 'react';
import { apiUrl } from '@/lib/api';
import { isDevSkipAuth } from '@/lib/dev-auth';
import { connectRealtime } from '@/lib/realtime';

export default function OverlayEditorPage() {
    return (
        <EditorProvider>
            <EditorContent />
        </EditorProvider>
    );
}

function EditorContent() {
    const params = useParams();
    const overlayId = params.id as string;
    const { dispatch } = useEditor();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const socketRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        const fetchOverlay = async () => {
            try {
                setLoading(true);
                setError(null);

                const res = await fetch(apiUrl(`/api/overlays/${overlayId}`), { credentials: 'include' });

                if (res.status === 401 && !isDevSkipAuth()) throw new Error('Not authenticated');
                if (!res.ok) throw new Error(`Failed to fetch overlay: ${res.statusText}`);

                const data = await res.json();

                dispatch({
                    type: 'SET_OVERLAY',
                    payload: { id: data.id, name: data.name, width: data.width || 1920, height: data.height || 1080 }
                });

                if (data.widgets && Array.isArray(data.widgets)) {
                    dispatch({ type: 'SET_WIDGETS', payload: data.widgets });
                }

                initSocket(data.id);
            } catch (err: any) {
                console.error('Failed to init editor:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        const initSocket = (id: string) => {
            if (socketRef.current) return;
            socketRef.current = connectRealtime(`overlay:${id}`, (event, data) => {
                if (event === 'chat') {
                    dispatch({ type: 'ADD_CHAT_MESSAGE', payload: data });
                } else if (event === 'alert') {
                    dispatch({ type: 'SET_ACTIVE_ALERT', payload: data });
                    setTimeout(() => dispatch({ type: 'SET_ACTIVE_ALERT', payload: null }), 5000);
                }
            });
        };

        if (overlayId) fetchOverlay();

        return () => {
            if (socketRef.current) { socketRef.current(); socketRef.current = null; }
        };
    }, [overlayId, dispatch]);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#05070a] text-white">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">Loading editor…</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#05070a] text-white p-8">
                <div className="max-w-sm w-full bg-surface-base border border-rose-500/20 rounded-2xl p-8 text-center shadow-2xl">
                    <div className="w-14 h-14 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-5">
                        <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                    </div>
                    <h2 className="text-base font-black text-white tracking-tight mb-1">
                        {error === 'Not authenticated' ? 'Sign in required' : 'Could not load overlay'}
                    </h2>
                    <p className="text-zinc-500 text-xs mb-6 leading-relaxed">
                        {error === 'Not authenticated' ? 'Please sign in to access the overlay editor.' : error}
                    </p>
                    <button
                        onClick={() => window.location.href = '/dashboard/overlays'}
                        className="saas-button w-full"
                    >
                        Back to Overlays
                    </button>
                </div>
            </div>
        );
    }

    return <EditorLayout />;
}
