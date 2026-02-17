'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, ExternalLink, Copy } from 'lucide-react';

interface Overlay {
    id: string;
    name: string;
    description?: string;
    urlSlug: string;
    createdAt: string;
    widgets: any[];
}

export default function OverlaysPage() {
    const router = useRouter();
    const [overlays, setOverlays] = useState<Overlay[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newOverlayName, setNewOverlayName] = useState('');
    const [newOverlayDescription, setNewOverlayDescription] = useState('');



    useEffect(() => {
        fetchOverlays();
    }, []);

    const fetchOverlays = async () => {
        try {
            const userRes = await fetch('/api/user/me');
            const userData = await userRes.json();
            const tenantId = userData.tenantId;

            const res = await fetch(`/api/overlays?tenantId=${tenantId}`);
            const data = await res.json();
            setOverlays(data);
        } catch (error) {
            console.error('Failed to fetch overlays:', error);
        } finally {
            setLoading(false);
        }
    };

    const createOverlay = async () => {
        if (!newOverlayName.trim()) return;

        try {
            const userRes = await fetch('/api/user/me');
            const userData = await userRes.json();
            const tenantId = userData.tenantId;

            const res = await fetch(`/api/overlays?tenantId=${tenantId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newOverlayName,
                    description: newOverlayDescription,
                }),
            });

            if (res.ok) {
                setShowCreateModal(false);
                setNewOverlayName('');
                setNewOverlayDescription('');
                fetchOverlays();
            }
        } catch (error) {
            console.error('Failed to create overlay:', error);
        }
    };

    const deleteOverlay = async (id: string) => {
        if (!confirm('Are you sure you want to delete this overlay?')) return;

        try {
            const userRes = await fetch('/api/user/me');
            const userData = await userRes.json();
            const tenantId = userData.tenantId;

            await fetch(`/api/overlays/${id}?tenantId=${tenantId}`, {
                method: 'DELETE',
            });
            fetchOverlays();
        } catch (error) {
            console.error('Failed to delete overlay:', error);
        }
    };

    const copyBrowserSourceUrl = (urlSlug: string) => {
        const url = `http://localhost:3000/overlay/${urlSlug}`;
        navigator.clipboard.writeText(url);
        alert('Browser source URL copied to clipboard!');
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-lg">Loading overlays...</div>
            </div>
        );
    }

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Overlays</h1>
                    <p className="text-gray-400 mt-2">
                        Create custom browser source overlays for your stream
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition"
                >
                    <Plus size={20} />
                    New Overlay
                </button>
            </div>

            {overlays.length === 0 ? (
                <div className="text-center py-16 bg-slate-800/50 rounded-lg border border-slate-700">
                    <h3 className="text-xl font-semibold mb-2">No overlays yet</h3>
                    <p className="text-gray-400 mb-4">Create your first overlay to get started</p>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg transition"
                    >
                        Create Overlay
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {overlays.map((overlay) => (
                        <div
                            key={overlay.id}
                            className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 hover:border-purple-500/50 transition"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-xl font-semibold">{overlay.name}</h3>
                                    {overlay.description && (
                                        <p className="text-gray-400 text-sm mt-1">
                                            {overlay.description}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="text-sm text-gray-400 mb-4">
                                {overlay.widgets.length} widget{overlay.widgets.length !== 1 ? 's' : ''}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => router.push(`/dashboard/overlays/${overlay.id}/editor`)}
                                    className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded transition"
                                >
                                    <Edit size={16} />
                                    Edit
                                </button>
                                <button
                                    onClick={() => copyBrowserSourceUrl(overlay.urlSlug)}
                                    className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded transition"
                                    title="Copy browser source URL"
                                >
                                    <Copy size={16} />
                                </button>
                                <button
                                    onClick={() => window.open(`/overlay/${overlay.urlSlug}`, '_blank')}
                                    className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded transition"
                                    title="Preview overlay"
                                >
                                    <ExternalLink size={16} />
                                </button>
                                <button
                                    onClick={() => deleteOverlay(overlay.id)}
                                    className="flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 px-3 py-2 rounded transition"
                                    title="Delete overlay"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md border border-slate-700">
                        <h2 className="text-2xl font-bold mb-4">Create New Overlay</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Name</label>
                                <input
                                    type="text"
                                    value={newOverlayName}
                                    onChange={(e) => setNewOverlayName(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 focus:outline-none focus:border-purple-500"
                                    placeholder="My Awesome Overlay"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">Description (optional)</label>
                                <textarea
                                    value={newOverlayDescription}
                                    onChange={(e) => setNewOverlayDescription(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 focus:outline-none focus:border-purple-500"
                                    placeholder="A brief description of this overlay"
                                    rows={3}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={createOverlay}
                                className="flex-1 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded transition"
                                disabled={!newOverlayName.trim()}
                            >
                                Create
                            </button>
                            <button
                                onClick={() => {
                                    setShowCreateModal(false);
                                    setNewOverlayName('');
                                    setNewOverlayDescription('');
                                }}
                                className="flex-1 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
