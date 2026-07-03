"use client";

import React, { useState, useEffect } from 'react';
import { Clock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import TimerModal from '../../../components/dashboard/TimerModal';
import { DeleteButton, EmptyState, FeatureHeader, FeaturePage, LoadingGrid } from '@/components/dashboard/FeatureUI';

interface Timer {
    id: string;
    name: string;
    message: string;
    intervalSeconds: number;
    chatLines: number;
    enabled: boolean;
}

export default function TimersPage() {
    const [timers, setTimers] = useState<Timer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTimer, setEditingTimer] = useState<Timer | undefined>(undefined);

    const API_BASE = apiUrl('/api/timers');

    const fetchTimers = async () => {
        try {
            setIsLoading(true);
            const res = await fetch(API_BASE, { credentials: 'include' });
            setTimers(await res.json());
        } catch (err) {
            console.error('Failed to fetch timers', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchTimers(); }, []);

    const handleSave = async (timerData: Partial<Timer>) => {
        try {
            if (editingTimer) {
                await fetch(`${API_BASE}/${editingTimer.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(timerData),
                    credentials: 'include',
                });
            } else {
                await fetch(API_BASE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(timerData),
                    credentials: 'include',
                });
            }
            fetchTimers();
            setIsModalOpen(false);
        } catch (err) {
            console.error('Failed to save timer', err);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this timer?')) return;
        await fetch(`${API_BASE}/${id}`, { method: 'DELETE', credentials: 'include' });
        fetchTimers();
    };

    const toggleTimer = async (id: string, enabled: boolean) => {
        setTimers(timers.map((t) => (t.id === id ? { ...t, enabled } : t)));
        try {
            await fetch(`${API_BASE}/${id}/toggle`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled }),
                credentials: 'include',
            });
        } catch {
            fetchTimers();
        }
    };

    return (
        <FeaturePage>
            <FeatureHeader
                icon={Clock}
                title="Timers"
                subtitle="Send automated messages to chat at set intervals."
            >
                <button
                    type="button"
                    onClick={() => { setEditingTimer(undefined); setIsModalOpen(true); }}
                    className="saas-button"
                >
                    + New Timer
                </button>
            </FeatureHeader>

            {isLoading ? (
                <LoadingGrid />
            ) : timers.length === 0 ? (
                <EmptyState
                    icon={Clock}
                    title="No timers yet"
                    description="Create a timer to automatically post messages in chat on a schedule."
                    action={
                        <button type="button" onClick={() => setIsModalOpen(true)} className="saas-button mt-4">
                            + New Timer
                        </button>
                    }
                />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {timers.map((timer) => (
                        <div
                            key={timer.id}
                            className={cn(
                                'bento-card holo-card p-7 group',
                                !timer.enabled && 'opacity-45 grayscale',
                            )}
                        >
                            <div className="flex items-start justify-between gap-4 mb-6">
                                <div className="flex items-start gap-4 min-w-0">
                                    <div className={cn(
                                        'w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border',
                                        timer.enabled
                                            ? 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary'
                                            : 'bg-white/[0.03] border-white/8 text-zinc-600',
                                    )}>
                                        {timer.enabled ? <Sparkles className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-black text-base text-white group-hover:text-brand-primary transition-colors truncate">{timer.name}</h3>
                                        <p className="text-[11px] text-zinc-600 font-medium mt-1 line-clamp-2">&ldquo;{timer.message}&rdquo;</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => toggleTimer(timer.id, !timer.enabled)}
                                    className={cn(
                                        'w-12 h-7 rounded-full relative border shrink-0 cursor-pointer transition-colors',
                                        timer.enabled ? 'bg-brand-primary border-brand-primary/20 shadow-glow-p' : 'bg-zinc-900 border-white/8',
                                    )}
                                    aria-label={timer.enabled ? 'Disable timer' : 'Enable timer'}
                                >
                                    <div className={cn(
                                        'absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all shadow-md',
                                        timer.enabled ? 'left-[1.35rem]' : 'left-0.5 bg-zinc-500',
                                    )} />
                                </button>
                            </div>

                            <div className="pt-5 border-t border-white/[0.06] flex items-center justify-between gap-4">
                                <div className="flex gap-6">
                                    <div>
                                        <p className="text-[9px] font-black  text-zinc-600 mb-1">Interval</p>
                                        <p className="text-sm font-black text-white tabular-nums">
                                            {Math.floor(timer.intervalSeconds / 60)}<span className="text-[10px] text-zinc-600 ml-1">min</span>
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black  text-zinc-600 mb-1">Min messages</p>
                                        <p className="text-sm font-black text-white tabular-nums">{timer.chatLines}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { setEditingTimer(timer); setIsModalOpen(true); }}
                                        className="p-2.5 rounded-xl bg-white/[0.03] border border-white/8 text-zinc-500 hover:text-white hover:border-brand-primary/20 transition-colors cursor-pointer"
                                        aria-label="Edit timer"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                                    </button>
                                    <DeleteButton onClick={() => handleDelete(timer.id)} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <TimerModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingTimer}
            />
        </FeaturePage>
    );
}
