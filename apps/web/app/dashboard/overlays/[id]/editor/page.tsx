'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Save } from 'lucide-react';

interface Widget {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    config: any;
    styles: any;
}

interface Overlay {
    id: string;
    name: string;
    width: number;
    height: number;
    widgets: Widget[];
}

export default function OverlayEditorPage() {
    const params = useParams();
    const router = useRouter();
    const overlayId = params.id as string;


    const [overlay, setOverlay] = useState<Overlay | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedWidget, setSelectedWidget] = useState<Widget | null>(null);

    useEffect(() => {
        fetchOverlay();
    }, [overlayId]);

    const fetchOverlay = async () => {
        try {
            const userRes = await fetch('/api/user/me');
            const userData = await userRes.json();
            const tenantId = userData.tenantId;

            const res = await fetch(`/api/overlays/${overlayId}?tenantId=${tenantId}`);
            const data = await res.json();
            setOverlay(data);
        } catch (error) {
            console.error('Failed to fetch overlay:', error);
        } finally {
            setLoading(false);
        }
    };

    const addWidget = async (type: string) => {
        try {
            const userRes = await fetch('/api/user/me');
            const userData = await userRes.json();
            const tenantId = userData.tenantId;

            const res = await fetch(`/api/overlays/${overlayId}/widgets?tenantId=${tenantId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    x: 100,
                    y: 100,
                    width: type === 'chat' ? 400 : 600,
                    height: type === 'chat' ? 500 : 200,
                    config: type === 'chat' ? { maxMessages: 10 } : { message: 'Thanks for the {type}!' },
                    styles: {},
                }),
            });

            if (res.ok) {
                fetchOverlay();
            }
        } catch (error) {
            console.error('Failed to add widget:', error);
        }
    };

    const updateWidget = async (widgetId: string, updates: Partial<Widget>) => {
        try {
            const userRes = await fetch('/api/user/me');
            const userData = await userRes.json();
            const tenantId = userData.tenantId;

            await fetch(`/api/overlays/widgets/${widgetId}?tenantId=${tenantId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            fetchOverlay();
        } catch (error) {
            console.error('Failed to update widget:', error);
        }
    };

    const deleteWidget = async (widgetId: string) => {
        try {
            const userRes = await fetch('/api/user/me');
            const userData = await userRes.json();
            const tenantId = userData.tenantId;

            await fetch(`/api/overlays/widgets/${widgetId}?tenantId=${tenantId}`, {
                method: 'DELETE',
            });
            fetchOverlay();
            setSelectedWidget(null);
        } catch (error) {
            console.error('Failed to delete widget:', error);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-screen">Loading...</div>;
    }

    if (!overlay) {
        return <div className="flex items-center justify-center h-screen">Overlay not found</div>;
    }

    return (
        <div className="flex h-screen bg-slate-900">
            {/* Sidebar - Widget Library */}
            <div className="w-64 bg-slate-800 border-r border-slate-700 p-4">
                <button
                    onClick={() => router.push('/dashboard/overlays')}
                    className="flex items-center gap-2 text-gray-400 hover:text-white mb-6"
                >
                    <ArrowLeft size={20} />
                    Back to Overlays
                </button>

                <h2 className="text-xl font-bold mb-4">{overlay.name}</h2>

                <div className="space-y-2 mb-6">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase">Add Widget</h3>
                    <button
                        onClick={() => addWidget('chat')}
                        className="w-full bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded transition text-left"
                    >
                        💬 Chat Widget
                    </button>
                    <button
                        onClick={() => addWidget('alert')}
                        className="w-full bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded transition text-left"
                    >
                        🔔 Alert Widget
                    </button>
                </div>

                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase">Widgets ({overlay.widgets.length})</h3>
                    {overlay.widgets.map((widget) => (
                        <div
                            key={widget.id}
                            onClick={() => setSelectedWidget(widget)}
                            className={`p-3 rounded cursor-pointer transition ${selectedWidget?.id === widget.id
                                ? 'bg-purple-600'
                                : 'bg-slate-700 hover:bg-slate-600'
                                }`}
                        >
                            <div className="font-medium capitalize">{widget.type} Widget</div>
                            <div className="text-xs text-gray-400 mt-1">
                                {widget.width}x{widget.height} at ({widget.x}, {widget.y})
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 p-8 overflow-auto">
                <div
                    className="relative bg-black/50 border-2 border-dashed border-slate-600 mx-auto"
                    style={{
                        width: `${overlay.width}px`,
                        height: `${overlay.height}px`,
                        transform: 'scale(0.5)',
                        transformOrigin: 'top left',
                    }}
                >
                    {overlay.widgets.map((widget) => (
                        <div
                            key={widget.id}
                            onClick={() => setSelectedWidget(widget)}
                            className={`absolute border-2 cursor-move ${selectedWidget?.id === widget.id
                                ? 'border-purple-500'
                                : 'border-white/30'
                                }`}
                            style={{
                                left: `${widget.x}px`,
                                top: `${widget.y}px`,
                                width: `${widget.width}px`,
                                height: `${widget.height}px`,
                            }}
                        >
                            <div className="bg-slate-800/90 p-4 h-full">
                                <div className="font-semibold capitalize">{widget.type} Widget</div>
                                <div className="text-sm text-gray-400 mt-2">
                                    Click to edit properties
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Properties Panel */}
            {selectedWidget && (
                <div className="w-80 bg-slate-800 border-l border-slate-700 p-4">
                    <h3 className="text-xl font-bold mb-4 capitalize">{selectedWidget.type} Widget</h3>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">X Position</label>
                            <input
                                type="number"
                                value={selectedWidget.x}
                                onChange={(e) =>
                                    updateWidget(selectedWidget.id, { x: parseInt(e.target.value) })
                                }
                                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Y Position</label>
                            <input
                                type="number"
                                value={selectedWidget.y}
                                onChange={(e) =>
                                    updateWidget(selectedWidget.id, { y: parseInt(e.target.value) })
                                }
                                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Width</label>
                            <input
                                type="number"
                                value={selectedWidget.width}
                                onChange={(e) =>
                                    updateWidget(selectedWidget.id, { width: parseInt(e.target.value) })
                                }
                                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Height</label>
                            <input
                                type="number"
                                value={selectedWidget.height}
                                onChange={(e) =>
                                    updateWidget(selectedWidget.id, { height: parseInt(e.target.value) })
                                }
                                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
                            />
                        </div>

                        <button
                            onClick={() => deleteWidget(selectedWidget.id)}
                            className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-400 px-4 py-2 rounded transition"
                        >
                            Delete Widget
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
