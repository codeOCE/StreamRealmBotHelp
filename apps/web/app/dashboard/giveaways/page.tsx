"use client";

import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import { connectRealtime } from '@/lib/realtime';
import { toast } from 'sonner';
import {
    ActionChip, CommandChip, DeleteButton, EmptyState, FeatureHeader, FeaturePage,
    Field, LiveBanner, LoadingGrid, Panel, StatusPill, WinnerModal,
} from '@/components/dashboard/FeatureUI';

interface Winner { name: string; drawnAt: string; }
interface Giveaway {
    id: string; title: string; entryCost: number; subLuck: number; winnerCount: number;
    status: 'open' | 'closed' | 'drawn'; entryCount: number; winners: Winner[]; createdAt: string;
}

const BASE = apiUrl('/api/giveaways');

export default function GiveawaysPage() {
    const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
    const [streamerId, setStreamerId] = useState('');
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [drawn, setDrawn] = useState<{ id: string; name: string } | null>(null);
    const [title, setTitle] = useState('');
    const [entryCost, setEntryCost] = useState(0);
    const [subLuck, setSubLuck] = useState(1);
    const [winnerCount, setWinnerCount] = useState(1);

    const load = async () => {
        const r = await fetch(BASE, { credentials: 'include' }).then((x) => x.json()).catch(() => ({}));
        setGiveaways(Array.isArray(r.giveaways) ? r.giveaways : []);
    };

    useEffect(() => {
        (async () => {
            setLoading(true);
            const me = await fetch(apiUrl('/api/user/me'), { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
            setStreamerId(me?.tenantId ?? me?.id ?? '');
            await load();
            setLoading(false);
        })();
    }, []);

    useEffect(() => {
        if (!streamerId) return;
        return connectRealtime(`giveaway:${streamerId}`, (event) => {
            if (event === 'entry' || event === 'winner') load();
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streamerId]);

    const open = giveaways.find((g) => g.status === 'open');

    const create = async () => {
        setCreating(true);
        try {
            const res = await fetch(BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ title: title.trim() || 'Giveaway', entryCost, subLuck, winnerCount }),
            });
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                toast.error(e.message || 'Could not create giveaway');
            } else {
                toast.success('Giveaway is live — tell chat to type !enter');
                setTitle(''); setEntryCost(0); setSubLuck(1); setWinnerCount(1);
                await load();
            }
        } finally { setCreating(false); }
    };

    const act = async (id: string, path: string, label?: string) => {
        const res = await fetch(`${BASE}/${id}/${path}`, { method: 'POST', credentials: 'include' });
        if (!res.ok) { toast.error((await res.json().catch(() => ({}))).message || 'Action failed'); return; }
        if (label) toast.success(label);
        await load();
    };

    const draw = async (id: string) => {
        const res = await fetch(`${BASE}/${id}/draw`, { method: 'POST', credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { toast.error(data.message || 'Could not draw'); return; }
        if (data.winner?.name) setDrawn({ id, name: data.winner.name });
        await load();
    };

    const remove = async (id: string) => {
        if (!confirm('Delete this giveaway and all its entries?')) return;
        await fetch(`${BASE}/${id}`, { method: 'DELETE', credentials: 'include' });
        setGiveaways((xs) => xs.filter((g) => g.id !== id));
    };

    return (
        <FeaturePage>
            <FeatureHeader
                icon={Gift}
                title="Giveaways"
                subtitle={<>Run raffles viewers join with <CommandChip>!enter</CommandChip>. Draw weighted-random winners live on stream.</>}
            />

            {open && (
                <LiveBanner
                    icon={Gift}
                    title={open.title}
                    meta={<>{open.entryCount} entered · chat uses <CommandChip>!enter</CommandChip></>}
                    action={<ActionChip variant="amber" onClick={() => act(open.id, 'close', 'Entries closed')}>Close entries</ActionChip>}
                />
            )}

            {!open && (
                <Panel title="Start a giveaway">
                    <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 items-end">
                        <Field label="Prize / Title">
                            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. $50 Steam Gift Card" className="void-input w-full" />
                        </Field>
                        <Field label="Entry cost (Points)">
                            <input type="number" min={0} value={entryCost} onChange={(e) => setEntryCost(Math.max(0, Number(e.target.value) || 0))} className="void-input w-full" />
                        </Field>
                        <Field label="Sub luck (×)">
                            <input type="number" min={1} max={100} value={subLuck} onChange={(e) => setSubLuck(Math.max(1, Number(e.target.value) || 1))} className="void-input w-full" />
                        </Field>
                        <Field label="Winners">
                            <input type="number" min={1} max={100} value={winnerCount} onChange={(e) => setWinnerCount(Math.max(1, Number(e.target.value) || 1))} className="void-input w-full" />
                        </Field>
                        <button type="button" onClick={create} disabled={creating} className="saas-button h-12 whitespace-nowrap disabled:opacity-50">
                            {creating ? 'Opening…' : 'Open Giveaway'}
                        </button>
                    </div>
                    <p className="text-[11px] text-zinc-600 mt-4">Free when cost is 0. Sub luck gives subscribers extra weight in the draw.</p>
                </Panel>
            )}

            {loading ? <LoadingGrid /> : giveaways.length === 0 ? (
                <EmptyState icon={Gift} title="No giveaways yet" description="Open one above and tell chat to type !enter to join." />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {giveaways.map((g) => (
                        <div key={g.id} className={cn('bento-card holo-card p-7', g.status === 'open' && 'bento-card-active')}>
                            <div className="flex items-start justify-between gap-3 mb-5">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <StatusPill status={g.status} />
                                        {g.entryCost > 0 && <span className="void-badge void-badge-muted text-[9px]">{g.entryCost} pts</span>}
                                        {g.subLuck > 1 && <span className="void-badge void-badge-muted text-[9px]">{g.subLuck}× sub</span>}
                                    </div>
                                    <h3 className="text-xl font-black text-white truncate font-heading">{g.title}</h3>
                                </div>
                                <DeleteButton onClick={() => remove(g.id)} />
                            </div>

                            <div className="flex items-end gap-3 mb-6 py-4 px-5 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                                <div className="metric-value !text-5xl">{g.entryCount}</div>
                                <div className="text-[10px] font-black  text-zinc-500 pb-1">entries</div>
                            </div>

                            {g.winners.length > 0 && (
                                <div className="mb-5 space-y-2">
                                    <p className="text-[10px] font-black  text-brand-primary">
                                        Winners{g.winnerCount > 1 ? ` · ${g.winners.length}/${g.winnerCount}` : ''}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {g.winners.map((w, i) => (
                                            <span key={i} className="px-3 py-1.5 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-white text-xs font-bold">
                                                {w.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2 pt-4 border-t border-white/[0.05]">
                                {g.status === 'open' && <ActionChip variant="amber" onClick={() => act(g.id, 'close', 'Entries closed')}>Close entries</ActionChip>}
                                {g.status === 'closed' && <ActionChip variant="emerald" onClick={() => act(g.id, 'open', 'Giveaway re-opened')}>Re-open</ActionChip>}
                                <ActionChip
                                    variant="primary"
                                    onClick={() => draw(g.id)}
                                    disabled={g.entryCount === 0 || g.winners.length >= g.winnerCount}
                                >
                                    {g.winners.length > 0 && g.winners.length < g.winnerCount ? 'Draw another' : 'Draw winner'}
                                </ActionChip>
                                <ActionChip variant="ghost" onClick={() => act(g.id, 'reset', 'Giveaway reset')}>Reset</ActionChip>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {drawn && (
                <WinnerModal
                    name={drawn.name}
                    onDrawAnother={() => draw(drawn.id)}
                    onClose={() => setDrawn(null)}
                />
            )}
        </FeaturePage>
    );
}
