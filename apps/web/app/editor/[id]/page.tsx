'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { EditorLayout } from './components/EditorLayout';
import { useEditor } from './store';
import { EditorProvider } from './store';

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

    useEffect(() => {
        const fetchOverlay = async () => {
            try {
                setLoading(true);
                setError(null);

                // Fetch overlay data - standard session cookies will be sent
                // The backend automatically scopes this to the authenticated user's tenant
                const res = await fetch(`/api/overlays/${overlayId}`);

                if (res.status === 401) {
                    throw new Error('Not authenticated');
                }

                if (!res.ok) {
                    throw new Error(`Failed to fetch overlay: ${res.statusText}`);
                }

                const data = await res.json();

                // Initialize Store
                dispatch({
                    type: 'SET_OVERLAY',
                    payload: {
                        id: data.id,
                        name: data.name,
                        width: data.width || 1920,
                        height: data.height || 1080
                    }
                });

                if (data.widgets && Array.isArray(data.widgets)) {
                    dispatch({ type: 'SET_WIDGETS', payload: data.widgets });
                }

            } catch (err: any) {
                console.error('Failed to init editor:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (overlayId) {
            fetchOverlay();
        }
    }, [overlayId, dispatch]);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-neutral-950 text-white font-sans">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">Initializing Workspace</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-screen items-center justify-center bg-neutral-950 text-white font-sans p-8">
                <div className="max-w-md w-full bg-neutral-900 border border-red-500/20 rounded-2xl p-8 text-center shadow-2xl">
                    <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor font-white"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <h2 className="text-xl font-black uppercase tracking-tight mb-2">Access Denied</h2>
                    <p className="text-neutral-400 text-sm mb-8">{error === 'Not authenticated' ? 'Please sign in to access the overlay editor.' : error}</p>
                    <button
                        onClick={() => window.location.href = '/dashboard'}
                        className="px-8 py-3 bg-white text-black rounded-lg text-xs font-black uppercase tracking-wider hover:bg-neutral-200 transition-colors"
                    >
                        Return to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return <EditorLayout />;
}
