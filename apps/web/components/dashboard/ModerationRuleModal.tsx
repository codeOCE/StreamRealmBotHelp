"use client";

import React, { useState, useEffect } from 'react';
import { VoidSelect } from './VoidSelect';

interface ModRule {
    id: string;
    type: string;
    label: string;
    settings: {
        threshold?: number;
        duration: number;
        action?: 'DELETE' | 'TIMEOUT' | 'BAN' | 'WARN';
        bypassLevel?: 'VIEWER' | 'SUBSCRIBER' | 'MODERATOR' | 'BROADCASTER';
        minLength?: number;
        customMsg?: string;
        silent?: boolean;
        words?: string[];
        allowedDomains?: string[];
    };
}

interface ModerationRuleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (id: string, settings: any) => void;
    rule: ModRule | null;
}

export default function ModerationRuleModal({ isOpen, onClose, onSave, rule }: ModerationRuleModalProps) {
    const [action, setAction] = useState<'DELETE' | 'TIMEOUT' | 'BAN' | 'WARN'>('TIMEOUT');
    const [duration, setDuration] = useState(600);
    const [bypassLevel, setBypassLevel] = useState<'VIEWER' | 'SUBSCRIBER' | 'MODERATOR' | 'BROADCASTER'>('VIEWER');
    const [minLength, setMinLength] = useState(0);
    const [customMsg, setCustomMsg] = useState('');
    const [silent, setSilent] = useState(false);
    const [wordsText, setWordsText] = useState('');
    const [domainsText, setDomainsText] = useState('');

    useEffect(() => {
        if (rule) {
            setAction(rule.settings.action || 'TIMEOUT');
            setDuration(rule.settings.duration || 600);
            setBypassLevel(rule.settings.bypassLevel || 'VIEWER');
            setMinLength(rule.settings.minLength || 0);
            setCustomMsg(rule.settings.customMsg || '');
            setSilent(rule.settings.silent || false);
            setWordsText((rule.settings.words || []).join('\n'));
            setDomainsText((rule.settings.allowedDomains || []).join('\n'));
        }
    }, [rule]);

    if (!isOpen || !rule) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const lines = (t: string) => t.split('\n').map((s) => s.trim()).filter(Boolean);
        onSave(rule.id, {
            ...rule.settings,
            action,
            duration,
            bypassLevel,
            minLength,
            customMsg,
            silent,
            ...(rule.type === 'BANNED_WORDS' ? { words: lines(wordsText) } : {}),
            ...(rule.type === 'LINKS' ? { allowedDomains: lines(domainsText) } : {}),
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="glass-dark w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border-white/5 bg-[#09090b]">
                <div className="px-10 py-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">Rule Settings</h2>
                        <p className="text-[10px] text-zinc-500 mt-1 font-bold ">Configuration for {rule.label} filter</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-zinc-500 hover:text-white transition-all hover:bg-white/10 cursor-pointer" aria-label="Close"><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>

                <form onSubmit={handleSubmit} className="p-10 space-y-10">
                    <div className="grid grid-cols-2 gap-10">
                        {/* Action Selector */}
                        <div className="space-y-4">
                            <label className="text-[10px] font-bold  text-zinc-500">Auto Action</label>
                            <VoidSelect
                                value={action}
                                onChange={(e) => setAction(e.target.value as typeof action)}
                            >
                                <option value="DELETE">Delete Message</option>
                                <option value="TIMEOUT">Timeout User</option>
                                <option value="BAN">Ban User</option>
                                <option value="WARN">Warn User</option>
                            </VoidSelect>
                        </div>

                        {/* Duration Selector */}
                        <div className="space-y-4">
                            <label className="text-[10px] font-bold  text-zinc-500">Timeout Duration</label>
                            <VoidSelect
                                value={String(duration)}
                                onChange={(e) => setDuration(Number(e.target.value))}
                                disabled={action !== 'TIMEOUT'}
                            >
                                <option value={60}>1 Minute</option>
                                <option value={600}>10 Minutes</option>
                                <option value={3600}>1 Hour</option>
                                <option value={86400}>24 Hours</option>
                            </VoidSelect>
                        </div>
                    </div>

                    {/* Bypass Level */}
                    <div className="space-y-5">
                        <label className="text-[10px] font-bold  text-zinc-500">Bypass Role (Immunity)</label>
                        <div className="grid grid-cols-4 gap-3">
                            {['VIEWER', 'SUBSCRIBER', 'MODERATOR', 'BROADCASTER'].map((level) => (
                                <button
                                    key={level}
                                    type="button"
                                    onClick={() => setBypassLevel(level as any)}
                                    className={`py-3 rounded-xl text-[10px] font-bold  transition-all border ${bypassLevel === level
                                        ? 'bg-brand-primary border-brand-primary text-white shadow-lg shadow-brand-primary/10'
                                        : 'bg-zinc-950/50 border-white/10 text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                                        }`}
                                >
                                    {level === 'VIEWER' ? 'None' : level.slice(0, 3)}
                                </button>
                            ))}
                        </div>
                        <p className="text-[9px] text-zinc-600 font-bold ">Users at or above this rank will be exempt from this rule.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-10">
                        {/* Min Message Length */}
                        <div className="space-y-4">
                            <label className="text-[10px] font-bold  text-zinc-500">Trigger Threshold (Min. Length)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={minLength}
                                    onChange={(e) => setMinLength(Number(e.target.value))}
                                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-5 py-4 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary/50 transition-all font-bold"
                                    placeholder="0"
                                />
                                <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-zinc-600 ">chars</div>
                            </div>
                        </div>

                        {/* Silent Mode */}
                        <div className="space-y-4 flex flex-col justify-end pb-1">
                            <label className="flex items-center gap-4 cursor-pointer group">
                                <div
                                    onClick={() => setSilent(!silent)}
                                    className={`w-12 h-6 rounded-full relative transition-all duration-300 ${silent ? 'bg-brand-primary' : 'bg-zinc-800'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${silent ? 'left-7' : 'left-1'}`} />
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold  text-zinc-400 group-hover:text-white transition-colors">Silent Mode</span>
                                    <p className="text-[9px] text-zinc-600 font-medium">No notification in chat</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Banned word list (BANNED_WORDS only) */}
                    {rule.type === 'BANNED_WORDS' && (
                        <div className="space-y-4">
                            <label className="text-[10px] font-bold  text-zinc-500">Banned Words &amp; Phrases (one per line)</label>
                            <textarea
                                value={wordsText}
                                onChange={(e) => setWordsText(e.target.value)}
                                rows={6}
                                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-5 py-4 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary/50 transition-all placeholder:text-zinc-700 font-medium font-mono resize-y"
                                placeholder={'badword\nbad*  (wildcard)\n/b[a4]d/  (regex)'}
                            />
                            <p className="text-[9px] text-zinc-600 font-bold ">Plain text matches anywhere. Use * as a wildcard, or wrap in /slashes/ for a regex.</p>
                        </div>
                    )}

                    {/* Allowed domains (LINKS only) */}
                    {rule.type === 'LINKS' && (
                        <div className="space-y-4">
                            <label className="text-[10px] font-bold  text-zinc-500">Allowed Domains (one per line)</label>
                            <textarea
                                value={domainsText}
                                onChange={(e) => setDomainsText(e.target.value)}
                                rows={5}
                                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-5 py-4 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary/50 transition-all placeholder:text-zinc-700 font-medium font-mono resize-y"
                                placeholder={'twitch.tv\nclips.twitch.tv\nyoutube.com'}
                            />
                            <p className="text-[9px] text-zinc-600 font-bold ">Links to these domains (and their subdomains) are always allowed. Empty = all links blocked.</p>
                        </div>
                    )}

                    {/* Custom Violation Message */}
                    <div className="space-y-4">
                        <label className="text-[10px] font-bold  text-zinc-500">Custom Warning Message</label>
                        <input
                            type="text"
                            value={customMsg}
                            onChange={(e) => setCustomMsg(e.target.value)}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-5 py-4 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary/50 transition-all placeholder:text-zinc-700 font-medium"
                            placeholder="Optional: Custom tip for the user..."
                        />
                    </div>

                    <div className="pt-6 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-10 rounded-xl bg-white/5 border border-white/5 text-zinc-500 font-bold text-xs  py-4 hover:bg-white/10 hover:text-white transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 bg-brand-primary text-white font-bold text-xs  py-4 rounded-xl hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/10 active:scale-[0.98]"
                        >
                            Save Settings
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
