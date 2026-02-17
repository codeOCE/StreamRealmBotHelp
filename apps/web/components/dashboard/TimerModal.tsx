"use client";

import React, { useState, useEffect } from 'react';

interface Timer {
    id?: string;
    name: string;
    message: string;
    intervalSeconds: number;
    chatLines: number;
    enabled: boolean;
}

interface TimerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (timer: Timer) => void;
    initialData?: Timer | null;
}

export default function TimerModal({ isOpen, onClose, onSave, initialData }: TimerModalProps) {
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [intervalMinutes, setIntervalMinutes] = useState(5);
    const [minMessages, setMinMessages] = useState(1);
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
            setMessage(initialData.message);
            setIntervalMinutes(Math.floor(initialData.intervalSeconds / 60));
            setMinMessages(initialData.chatLines);
            setEnabled(initialData.enabled);
        } else {
            setName('');
            setMessage('');
            setIntervalMinutes(5);
            setMinMessages(1);
            setEnabled(true);
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            id: initialData?.id,
            name,
            message,
            intervalSeconds: intervalMinutes * 60,
            chatLines: minMessages,
            enabled
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="glass-dark w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border-white/5 bg-[#09090b]">
                <div className="px-10 py-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">{initialData ? 'Edit' : 'Create'} Timer</h2>
                        <p className="text-[10px] text-zinc-500 mt-1 font-bold uppercase tracking-widest">Automation settings and schedule</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-zinc-500 hover:text-white transition-all hover:bg-white/10">✕</button>
                </div>

                <form onSubmit={handleSubmit} className="p-10 space-y-8">
                    <div className="space-y-4">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Timer Name</label>
                        <input
                            required
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-5 py-4 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary/50 transition-all font-bold placeholder:text-zinc-700"
                            placeholder="e.g. Socials Shoutout"
                        />
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Message Content</label>
                        <textarea
                            required
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-5 py-4 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary/50 transition-all min-h-[120px] resize-none font-medium placeholder:text-zinc-700"
                            placeholder="Supports variables: {user}, {channel}, {points}..."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-10">
                        <div className="space-y-4">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Interval (Minutes)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min={1}
                                    value={intervalMinutes}
                                    onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-5 py-4 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary/50 transition-all font-bold"
                                />
                                <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-zinc-600 uppercase tracking-widest">min</div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Activity Requirement</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min={0}
                                    value={minMessages}
                                    onChange={(e) => setMinMessages(Number(e.target.value))}
                                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-5 py-4 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary/50 transition-all font-bold"
                                />
                                <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-zinc-600 uppercase tracking-widest">msg</div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-10 rounded-xl bg-white/5 border border-white/5 text-zinc-500 font-bold text-xs uppercase tracking-widest py-4 hover:bg-white/10 hover:text-white transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 bg-brand-primary text-white font-bold text-xs uppercase tracking-widest py-4 rounded-xl hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/10 active:scale-[0.98]"
                        >
                            {initialData ? 'Save Changes' : 'Create Timer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
