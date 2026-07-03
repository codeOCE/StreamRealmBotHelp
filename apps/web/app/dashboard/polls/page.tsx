"use client";

import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import { connectRealtime } from '@/lib/realtime';
import { toast } from 'sonner';
import {
    ActionChip, CommandChip, DeleteButton, EmptyState, FeatureHeader, FeaturePage,
    LiveBanner, LoadingGrid, Panel, ProgressRow, StatusPill,
} from '@/components/dashboard/FeatureUI';

interface Poll {
    id: string; question: string; options: string[]; counts: number[];
    status: 'open' | 'closed'; createdAt: string;
}

const BASE = apiUrl('/api/polls');

export default function PollsPage() {
    const [polls, setPolls] = useState<Poll[]>([]);
    const [streamerId, setStreamerId] = useState('');
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState<string[]>(['', '']);

    const load = async () => {
        const r = await fetch(BASE, { credentials: 'include' }).then((x) => x.json()).catch(() => ({}));
        setPolls(Array.isArray(r.polls) ? r.polls : []);
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
        return connectRealtime(`poll:${streamerId}`, (event, data) => {
            if (event === 'vote' && data?.pollId) {
                setPolls((ps) => ps.map((p) => (p.id === data.pollId ? { ...p, counts: data.counts ?? p.counts } : p)));
            } else if (event === 'closed') load();
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streamerId]);

    const open = polls.find((p) => p.status === 'open');
    const setOpt = (i: number, v: string) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));
    const addOpt = () => setOptions((o) => (o.length >= 6 ? o : [...o, '']));
    const removeOpt = (i: number) => setOptions((o) => (o.length <= 2 ? o : o.filter((_, j) => j !== i)));

    const create = async () => {
        const opts = options.map((o) => o.trim()).filter(Boolean);
        if (opts.length < 2) { toast.error('Add at least 2 options'); return; }
        setCreating(true);
        try {
            const res = await fetch(BASE, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ question: question.trim() || 'Poll', options: opts }),
            });
            if (!res.ok) toast.error((await res.json().catch(() => ({}))).message || 'Could not create poll');
            else {
                toast.success('Poll is live — tell chat to vote with !vote 1, !vote 2…');
                setQuestion(''); setOptions(['', '']);
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

    const remove = async (id: string) => {
        if (!confirm('Delete this poll?')) return;
        await fetch(`${BASE}/${id}`, { method: 'DELETE', credentials: 'include' });
        setPolls((xs) => xs.filter((p) => p.id !== id));
    };

    return (
        <FeaturePage>
            <FeatureHeader
                icon={BarChart3}
                title="Polls"
                subtitle={<>Ask chat a question. Viewers vote with <CommandChip>!vote 1</CommandChip> and results update live.</>}
            />

            {open && (
                <LiveBanner
                    icon={BarChart3}
                    title={open.question}
                    meta={<>{open.counts.reduce((a, b) => a + b, 0)} votes · <CommandChip>!vote 1</CommandChip> … <CommandChip>!vote {open.options.length}</CommandChip></>}
                    action={<ActionChip variant="amber" onClick={() => act(open.id, 'close', 'Poll closed')}>Close poll</ActionChip>}
                />
            )}

            {!open && (
                <Panel title="New poll">
                    <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What should we play next?" className="void-input w-full mb-4" />
                    <div className="space-y-2 mb-5">
                        {options.map((o, i) => (
                            <div key={i} className="flex gap-2 items-center">
                                <span className="w-7 h-7 rounded-lg bg-white/[0.03] border border-white/8 flex items-center justify-center text-[11px] font-black text-zinc-600">{i + 1}</span>
                                <input value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Option ${i + 1}`} className="void-input flex-1" />
                                {options.length > 2 && (
                                    <button type="button" onClick={() => removeOpt(i)} className="p-2 rounded-lg text-zinc-600 hover:text-rose-400 transition-colors cursor-pointer" aria-label="Remove">✕</button>
                                )}
                            </div>
                        ))}
                        {options.length < 6 && (
                            <button type="button" onClick={addOpt} className="text-[11px] font-black  text-brand-primary hover:text-white transition-colors ml-9 cursor-pointer">+ Add option</button>
                        )}
                    </div>
                    <button type="button" onClick={create} disabled={creating} className="saas-button disabled:opacity-50">{creating ? 'Opening…' : 'Open Poll'}</button>
                </Panel>
            )}

            {loading ? <LoadingGrid /> : polls.length === 0 ? (
                <EmptyState icon={BarChart3} title="No polls yet" description="Create a question above and let chat vote in real time." />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {polls.map((p) => {
                        const total = p.counts.reduce((a, b) => a + b, 0);
                        const leader = Math.max(...p.counts, 0);
                        return (
                            <div key={p.id} className={cn('bento-card holo-card p-7', p.status === 'open' && 'bento-card-active')}>
                                <div className="flex items-start justify-between gap-3 mb-5">
                                    <div className="min-w-0">
                                        <StatusPill status={p.status} />
                                        <h3 className="text-xl font-black text-white mt-2 break-words font-heading">{p.question}</h3>
                                    </div>
                                    <DeleteButton onClick={() => remove(p.id)} />
                                </div>
                                <div className="space-y-4 mb-6">
                                    {p.options.map((opt, i) => {
                                        const c = p.counts[i] ?? 0;
                                        const pct = total ? Math.round((c / total) * 100) : 0;
                                        return (
                                            <ProgressRow
                                                key={i}
                                                label={`${i + 1}. ${opt}`}
                                                pct={pct}
                                                count={c}
                                                leading={c > 0 && c === leader}
                                            />
                                        );
                                    })}
                                </div>
                                <div className="flex flex-wrap gap-2 items-center pt-4 border-t border-white/[0.05]">
                                    <span className="text-[10px] font-black  text-zinc-600 mr-auto">{total} votes</span>
                                    {p.status === 'open' ? (
                                        <ActionChip variant="amber" onClick={() => act(p.id, 'close', 'Poll closed')}>Close</ActionChip>
                                    ) : (
                                        <ActionChip variant="ghost" onClick={() => act(p.id, 'reset', 'Poll reset')}>Reset & re-open</ActionChip>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </FeaturePage>
    );
}
