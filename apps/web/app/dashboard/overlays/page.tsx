'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Edit, ExternalLink, Layers, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { apiUrl } from '@/lib/api';
import { OVERLAY_THEMES, ThemeWidget } from '@/lib/overlay-themes';
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
    const [themeId, setThemeId] = useState<string | null>(null);
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
            const overlay = await res.json();

            // Stamp the chosen theme's widgets onto the new overlay.
            const theme = OVERLAY_THEMES.find((t) => t.id === themeId);
            if (theme) {
                for (const w of theme.widgets) {
                    await fetch(apiUrl(`/api/overlays/${overlay.id}/widgets`), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify(w),
                    });
                }
            }

            toast.success(theme ? `Overlay created with the ${theme.name} theme` : 'Overlay created');
            setShowCreateModal(false);
            setNewOverlayName('');
            setNewOverlayDescription('');
            setThemeId(null);
            if (theme) {
                router.push(`/editor/${overlay.id}`);
            } else {
                fetchOverlays();
            }
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
        setThemeId(null);
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
                    <Panel className="w-full max-w-2xl !rounded-[2rem] animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto" title="New Overlay">
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
                                    rows={2}
                                    placeholder="Optional…"
                                />
                            </Field>

                            <Field label="Theme">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    <ThemeCard
                                        selected={themeId === null}
                                        accent="#71717a"
                                        name="Blank"
                                        description="Start from an empty canvas."
                                        widgets={[]}
                                        onClick={() => setThemeId(null)}
                                    />
                                    {OVERLAY_THEMES.map((t) => (
                                        <ThemeCard
                                            key={t.id}
                                            selected={themeId === t.id}
                                            accent={t.accent}
                                            name={t.name}
                                            description={t.description}
                                            widgets={t.widgets}
                                            onClick={() => setThemeId(t.id)}
                                        />
                                    ))}
                                </div>
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
                                {creating ? 'Creating…' : themeId ? 'Create & open editor' : 'Create Overlay'}
                            </button>
                        </div>
                    </Panel>
                </div>
            )}
        </FeaturePage>
    );
}

/** Gallery card: accent swatch, name, and a miniature 16:9 map of the theme's widget layout. */
function ThemeCard({
    selected,
    accent,
    name,
    description,
    widgets,
    onClick,
}: {
    selected: boolean;
    accent: string;
    name: string;
    description: string;
    widgets: ThemeWidget[];
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={description}
            className={`text-left rounded-2xl border p-3 transition-all cursor-pointer ${
                selected
                    ? 'border-brand-primary/60 bg-brand-primary/[0.08] ring-1 ring-brand-primary/40'
                    : 'border-white/8 bg-white/[0.02] hover:border-white/20'
            }`}
        >
            {/* Mini 1920x1080 layout map */}
            <div className="relative w-full aspect-video rounded-lg bg-black/40 border border-white/[0.06] overflow-hidden mb-2.5">
                {widgets.length === 0 ? (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black uppercase tracking-widest text-zinc-700">
                        Empty
                    </span>
                ) : (
                    widgets.map((w, i) => (
                        <span
                            key={i}
                            className="absolute rounded-[3px]"
                            style={{
                                left: `${(w.x / 1920) * 100}%`,
                                top: `${(w.y / 1080) * 100}%`,
                                width: `${(w.width / 1920) * 100}%`,
                                height: `${(w.height / 1080) * 100}%`,
                                background: w.type === 'alert' ? 'transparent' : `${accent}33`,
                                border: `1px ${w.type === 'alert' ? 'dashed' : 'solid'} ${accent}${w.type === 'alert' ? 'aa' : '66'}`,
                            }}
                        />
                    ))
                )}
            </div>
            <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: accent }} />
                <span className="text-[11px] font-black text-white truncate">{name}</span>
            </div>
            <p className="text-[9px] text-zinc-600 mt-1 line-clamp-2 leading-relaxed">{description}</p>
        </button>
    );
}
