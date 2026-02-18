'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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

    useEffect(() => {
        const fetchOverlay = async () => {
            try {
                // 1. Get Tenant ID
                const userRes = await fetch('/api/user/me');
                if (!userRes.ok) throw new Error('Not authenticated');
                const userData = await userRes.json();
                const tenantId = userData.tenantId;

                // 2. Get Overlay Data
                const res = await fetch(`/api/overlays/${overlayId}?tenantId=${tenantId}`);
                if (!res.ok) throw new Error('Failed to fetch overlay');
                const data = await res.json();

                // 3. Initialize Store
                dispatch({
                    type: 'SET_OVERLAY',
                    payload: {
                        id: data.id,
                        name: data.name,
                        width: data.width || 1920,
                        height: data.height || 1080
                    }
                });

                // If the API returned widgets, load them. Otherwise start empty or with defaults.
                if (data.widgets && Array.isArray(data.widgets)) {
                    dispatch({ type: 'SET_WIDGETS', payload: data.widgets });
                }

            } catch (error) {
                console.error('Failed to init editor:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchOverlay();
    }, [overlayId, dispatch]);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-neutral-950 text-white">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-medium text-neutral-400">Loading StreamCanvas...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-neutral-950 text-white overflow-hidden">
            {/* We manually compose the layout components here since we are already inside the Provider */}
            <div className="h-14 bg-neutral-900 border-b border-white/10">
                <TopBarProxy />
            </div>
            <div className="flex-1 flex overflow-hidden">
                <LeftPanelProxy />
                <CanvasProxy />
            </div>
        </div>
    );
}

// Proxies to strict lazy loading or just cleanliness
import { TopToolbar } from './components/TopToolbar';
import { LeftSidebar } from './components/LeftSidebar';
import { CanvasArea } from './components/CanvasArea';

function TopBarProxy() { return <TopToolbar />; }
function LeftPanelProxy() { return <LeftSidebar />; }
function CanvasProxy() { return <CanvasArea />; }
