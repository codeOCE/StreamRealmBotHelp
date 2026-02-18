"use client";

import React, { useState, useEffect } from 'react';
import TimerModal from '../../../components/dashboard/TimerModal';

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

    const API_BASE = '/api/timers';

    const fetchTimers = async () => {
        try {
            setIsLoading(true);
            const res = await fetch(API_BASE);
            const data = await res.json();
            setTimers(data);
        } catch (err) {
            console.error('Failed to fetch timers', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTimers();
    }, []);

    const handleSave = async (timerData: Partial<Timer>) => {
        try {
            if (editingTimer) {
                await fetch(`${API_BASE}/${editingTimer.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(timerData),
                });
            } else {
                await fetch(API_BASE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(timerData),
                });
            }
            fetchTimers();
            setIsModalOpen(false);
        } catch (err) {
            console.error('Failed to save timer', err);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this timer?')) return;
        try {
            await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
            fetchTimers();
        } catch (err) {
            console.error('Failed to delete timer', err);
        }
    };

    const toggleTimer = async (id: string, enabled: boolean) => {
        try {
            await fetch(`${API_BASE}/${id}/toggle`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled }),
            });
            setTimers(timers.map(t => t.id === id ? { ...t, enabled } : t));
        } catch (err) {
            console.error('Failed to toggle timer', err);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between border-l-4 border-brand-primary pl-6 py-2">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-black tracking-tight text-white uppercase">Announcement Timers</h1>
                    <p className="text-zinc-500 text-sm font-bold tracking-wide">Automated messages broadcasted to chat on a recurring basis.</p>
                </div>
                <button
                    onClick={() => {
                        setEditingTimer(undefined);
                        setIsModalOpen(true);
                    }}
                    className="bg-brand-primary text-white font-black text-xs px-6 py-3 rounded-lg hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20 uppercase tracking-widest"
                >
                    + Add New Timer
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {isLoading ? (
                    <div className="col-span-full py-20 text-center text-zinc-600 font-black uppercase tracking-[0.4em] text-[10px] animate-pulse">Syncing Timer Schedules...</div>
                ) : timers.map((timer) => (
                    <div key={timer.id} className={`glass-card rounded-xl p-6 transition-all border ${!timer.enabled ? 'opacity-40 grayscale-[0.5] border-white/5' : 'border-white/[0.08] hover:border-brand-primary/20'}`}>
                        <div className="flex items-start justify-between gap-4 mb-6">
                            <div className="flex items-start gap-4">
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl bg-white/[0.03] border border-white/[0.05] ${timer.enabled ? 'text-brand-primary shadow-lg shadow-brand-primary/10' : 'text-zinc-600'}`}>
                                    ⏱️
                                </div>
                                <div className="space-y-1">
                                    <h3 className="font-black text-sm tracking-tight text-white uppercase">{timer.name}</h3>
                                    <p className="text-[10px] text-zinc-400 font-bold italic line-clamp-1">"{timer.message}"</p>
                                </div>
                            </div>
                            <button
                                onClick={() => toggleTimer(timer.id, !timer.enabled)}
                                className={`w-12 h-6 rounded-lg relative transition-all duration-300 border border-white/10 ${timer.enabled ? 'bg-brand-primary' : 'bg-surface-bright'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-md transition-all shadow-md ${timer.enabled ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>

                        {timer.enabled && (
                            <div className="pt-6 border-t border-white/[0.05] grid grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-500 block">Frequency</label>
                                    <p className="text-white font-black text-xs">{Math.floor(timer.intervalSeconds / 60)}m</p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-500 block">Min Lines</label>
                                    <p className="text-white font-black text-xs">{timer.chatLines} msgs</p>
                                </div>
                                <div className="flex justify-end items-end gap-2">
                                    <button
                                        onClick={() => {
                                            setEditingTimer(timer);
                                            setIsModalOpen(true);
                                        }}
                                        className="p-2 rounded-md bg-white/[0.03] border border-white/[0.05] text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-all"
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        onClick={() => handleDelete(timer.id)}
                                        className="p-2 rounded-md bg-white/[0.03] border border-white/[0.05] text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <TimerModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingTimer}
            />
        </div>
    );
}
