'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Edit, ExternalLink, Layers, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { apiUrl } from '@/lib/api';
import {
    ActionChip, DeleteButton, EmptyState, FeatureHeader, FeaturePage,
    Field, LoadingGrid, Panel, ProgressRow,
} from '@/components/dashboard/FeatureUI';

interface Overlay {
    id: string;
    name: string;
    description?: string;
    urlSlug: string;
    createdAt: string;
    widgets: unknown[];
}

export default function OverlaysPage() {
    const router = useRouter();
    const [overlays, setOverlays] = useState<Overlay[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newOverlayName, setNewOverlayName] = useState('');
    const [newOverlayDescription, setNewOverlayDescription] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => { fetchOverlays(); }, []);

    const fetchOverlays = async () => {
        try {
            const res = await fetch(apiUrl('/api/overlays'), { credentials: 'include' });
            if (!res.ok) { setOverlays([]); return; }
            const data = await res.json();
            setOverlays(Array.isArray(data) ? data : []);
        } catch {
            setOverlays([]);
        } finally {
            setLoading(false);
        }
    };

    const createOverlay = async () => {
        if (!newOverlayName.trim()) return;
        setCreating(true);
        try {
            const res = await fetch(apiUrl('/api/overlays'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name: newOverlayName, description: newOverlayDescription }),
            });
            if (!res.ok) { toast.error('Could not create overlay'); return; }
            toast.success('Overlay created');
            setShowCreateModal(false);
            setNewOverlayName('');
            setNewOverlayDescription('');
            fetchOverlays();
        } finally {
            setCreating(false);
        }
    };

    const deleteOverlay = async (id: string) => {
        if (!confirm('Delete this overlay?')) return;
        const res = await fetch(apiUrl(`/api/overlays/${id}`), { method: 'DELETE', credentials: 'include' });
        if (!res.ok) { toast.error('Could not delete'); return; }
        toast.success('Overlay deleted');
        fetchOverlays();
    };

    const copyBrowserSourceUrl = (urlSlug: string) => {
        const url = `${window.location.origin}/overlay/${urlSlug}`;
        navigator.clipboard.writeText(url);
        toast.success('Browser source URL copied');
    };

    const closeModal = () => {
        setShowCreateModal(false);
        setNewOverlayName('');
        setNewOverlayDescription('');
    };

    if (loading) {
        return (
            <FeaturePage>
                <div className="flex items-start justify-between gap-6">
                    <div className="space-y-2">
                        <div className="skeleton h-9 w-40 rounded-2xl" />
                        <div className="skeleton h-4 w-72 rounded-lg" />
                    </div>
                    <div className="skeleton h-10 w-36 rounded-xl" />
                </div>
                <LoadingGrid cols={3} />
            </FeaturePage>
        );
    }

    return (
        <FeaturePage>
            <FeatureHeader
                icon={Layers}
                title="Overlays"
                subtitle="Create and manage browser source overlays for OBS, Streamlabs, and more."
            >
                <button type="button" onClick={() => setShowCreateModal(true)} className="saas-button gap-2">
                    <Plus size={16} /> New Overlay
                </button>
            </FeatureHeader>

            {overlays.length === 0 ? (
                <EmptyState
                    icon={Layers}
                    title="No overlays yet"
                    description="Create your first overlay to add alerts, goals, and widgets to your stream."
                    action={
                        <button type="button" onClick={() => setShowCreateModal(true)} className="saas-button mt-4">
                            Create Overlay
                        </button>
                    }
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {overlays.map((overlay) => (
                        <div key={overlay.id} className="bento-card holo-card p-7 flex flex-col gap-6 group">
                            <div className="flex justify-between items-start gap-4">
                                <div className="min-w-0">
                                    <h3 className="text-lg font-black text-white tracking-tight group-hover:text-brand-primary transition-colors truncate">
                                        {overlay.name}
                                    </h3>
                                    {overlay.description && (
                                        <p className="text-[11px] text-zinc-600 font-medium mt-1 line-clamp-2">{overlay.description}</p>
                                    )}
                                </div>
                                <div className="w-11 h-11 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
                                    <Layers className="w-5 h-5" strokeWidth={2} />
                                </div>
                            </div>

                            <ProgressRow
                                label="Widgets"
                                pct={Math.min(100, (overlay.widgets.length / 10) * 100)}
                                count={overlay.widgets.length}
                                leading
                            />

                            <div className="grid grid-cols-4 gap-2">
                                <button
                                    type="button"
                                    onClick={() => router.push(`/editor/${overlay.id}`)}
                                    className="col-span-2 saas-button !py-3 !text-[10px] gap-2 cursor-pointer"
                                >
                                    <Edit size={14} /> Edit
                                </button>
                                <button
                                    type="button"
                                    onClick={() => copyBrowserSourceUrl(overlay.urlSlug)}
                                    className="flex items-center justify-center rounded-xl bg-white/[0.03] border border-white/8 text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                                    title="Copy URL"
                                    aria-label="Copy browser source URL"
                                >
                                    <Copy size={16} />
                                </button>
                                <DeleteButton onClick={() => deleteOverlay(overlay.id)} />
                            </div>

                            <ActionChip
                                variant="ghost"
                                className="w-full !py-3 gap-2"
                                onClick={() => window.open(`/overlay/${overlay.urlSlug}`, '_blank')}
                            >
                                <ExternalLink size={14} /> Preview
                            </ActionChip>
                        </div>
                    ))}
                </div>
            )}

            {showCreateModal && (
                <div
                    className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[700] p-4 animate-in fade-in duration-200"
                    onClick={(e) => e.target === e.currentTarget && closeModal()}
                >
                    <Panel className="w-full max-w-md !rounded-[2rem] animate-in zoom-in-95 duration-200" title="New Overlay">
                        <div className="space-y-4">
                            <Field label="Overlay name">
                                <input
                                    type="text"
                                    value={newOverlayName}
                                    onChange={(e) => setNewOverlayName(e.target.value)}
                                    className="void-input"
                                    placeholder="My overlay…"
                                    autoFocus
                                />
                            </Field>
                            <Field label="Description">
                                <textarea
                                    value={newOverlayDescription}
                                    onChange={(e) => setNewOverlayDescription(e.target.value)}
                                    className="void-input resize-none"
                                    rows={3}
                                    placeholder="Optional…"
                                />
                            </Field>
                        </div>
                        <div className="flex gap-3 mt-6 pt-6 border-t border-white/[0.06]">
                            <button type="button" onClick={closeModal} className="saas-button-secondary flex-1">Cancel</button>
                            <button
                                type="button"
                                onClick={createOverlay}
                                disabled={!newOverlayName.trim() || creating}
                                className="saas-button flex-[2] disabled:opacity-50"
                            >
                                {creating ? 'Creating…' : 'Create Overlay'}
                            </button>
                        </div>
                    </Panel>
                </div>
            )}
        </FeaturePage>
    );
}
