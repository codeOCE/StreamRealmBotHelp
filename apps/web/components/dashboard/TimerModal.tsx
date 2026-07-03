"use client";

import { VoidNumberInput } from './VoidNumberInput';

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
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-[#050508]/85 backdrop-blur-xl animate-in fade-in duration-200"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-md bg-surface-base border border-white/8 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">

                {/* Header */}
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-white tracking-tight">
                            {initialData ? 'Edit Timer' : 'New Timer'}
                        </h2>
                        <p className="text-xs text-zinc-500 mt-0.5">Sends a message to chat on a schedule</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-11 h-11 flex items-center justify-center rounded-xl text-zinc-500 hover:text-white hover:bg-white/8 transition-colors duration-150 cursor-pointer"
                        aria-label="Close"
                    >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400 block">Name</label>
                        <input
                            required
                            autoFocus
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="void-input"
                            placeholder="Give it a name..."
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400 block">Message</label>
                        <textarea
                            required
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="void-input min-h-[96px] resize-none"
                            placeholder="What should the bot say?"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-zinc-400 block">Interval</label>
                            <VoidNumberInput
                                value={intervalMinutes}
                                onChange={setIntervalMinutes}
                                min={1}
                                suffix="min"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-zinc-400 block">Min Messages</label>
                            <VoidNumberInput
                                value={minMessages}
                                onChange={setMinMessages}
                                min={0}
                                suffix="msgs"
                            />
                        </div>
                    </div>

                    {/* Help text */}
                    <p className="text-[11px] text-zinc-600 leading-relaxed">
                        The bot will post this message every <strong className="text-zinc-500">{intervalMinutes} minute{intervalMinutes !== 1 ? 's' : ''}</strong>, as long as at least <strong className="text-zinc-500">{minMessages} message{minMessages !== 1 ? 's' : ''}</strong> have been sent in chat.
                    </p>

                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="saas-button-secondary flex-1"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="saas-button flex-[2]"
                        >
                            {initialData ? 'Save Changes' : 'Create Timer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
