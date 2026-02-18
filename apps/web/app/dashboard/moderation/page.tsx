"use client";

import React, { useState, useEffect } from 'react';
import ModerationRuleModal from '../../../components/dashboard/ModerationRuleModal';

interface ModRule {
    id: string;
    type: string;
    displayName: string;
    description: string;
    enabled: boolean;
    settings: {
        threshold?: number;
        duration: number;
        words?: string[];
        strictness?: 'LOW' | 'MEDIUM' | 'HIGH';
    };
}

export default function ModerationPage() {
    const [rules, setRules] = useState<ModRule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedRule, setSelectedRule] = useState<ModRule | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const API_BASE = '/api/moderation';

    const fetchRules = async () => {
        try {
            setIsLoading(true);
            const res = await fetch(API_BASE, { credentials: 'include' });
            const data = await res.json();

            if (!Array.isArray(data)) {
                setRules([]);
                return;
            }

            const metadata: Record<string, { label: string, description: string }> = {
                'CAPS': { label: 'Caps Protection', description: 'Prevents excessive use of capital letters in chat.' },
                'LINKS': { label: 'Link Protection', description: 'Auto-deletes unauthorized URLs to prevent spam and phishing.' },
                'SPAM': { label: 'Spam Filter', description: 'Blocks repetitive messages and common spam patterns.' },
                'SYMBOLS': { label: 'Symbol Protection', description: 'Deletes messages with excessive non-alphanumeric characters.' },
                'EMOTES': { label: 'Emote Protection', description: 'Limits the number of emotes allowed per message.' },
                'BANNED_WORDS': { label: 'Banned Words', description: 'Blacklist specific words or phrases from your chat.' },
            };

            const enrichedRules = data.map(rule => ({
                ...rule,
                displayName: metadata[rule.type]?.label || rule.type,
                description: metadata[rule.type]?.description || 'Automated moderation rule.',
            }));

            setRules(enrichedRules);
        } catch (err) {
            console.error('Failed to fetch moderation rules', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRules();
    }, []);

    const toggleRule = async (id: string, enabled: boolean) => {
        setRules(rules.map(r => r.id === id ? { ...r, enabled } : r));
        try {
            await fetch(`${API_BASE}/${id}/toggle`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled }),
                credentials: 'include',
            });
        } catch (err) {
            console.error('Failed to toggle rule', err);
            fetchRules();
        }
    };

    const updateSettings = async (id: string, settings: any) => {
        setRules(rules.map(r => r.id === id ? { ...r, settings } : r));
        try {
            await fetch(`${API_BASE}/${id}/settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
                credentials: 'include',
            });
        } catch (err) {
            console.error('Failed to update rule settings', err);
            fetchRules();
        }
    };

    const openSettings = (rule: ModRule) => {
        setSelectedRule(rule);
        setIsModalOpen(true);
    };

    if (isLoading) return (
        <div className="flex items-center justify-center h-64 text-zinc-500 font-black uppercase tracking-[0.4em] text-[10px] animate-pulse">
            Initializing Safety Protocols...
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col gap-2 border-l-4 border-brand-primary pl-6 py-2">
                <h1 className="text-3xl font-black tracking-tight text-white uppercase">Bot Filters</h1>
                <p className="text-zinc-500 text-sm font-bold tracking-wide">Configure automated chat moderation and safety rules.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {rules.map((rule) => (
                    <div key={rule.id} className={`glass-card rounded-xl p-6 transition-all border ${!rule.enabled ? 'opacity-40 grayscale-[0.5] border-white/5' : 'border-white/[0.08] hover:border-brand-primary/20'}`}>
                        <div className="flex items-start justify-between gap-4 mb-6">
                            <div className="flex items-start gap-4">
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl bg-white/[0.03] border border-white/[0.05] ${rule.enabled ? 'text-brand-primary shadow-lg shadow-brand-primary/10' : 'text-zinc-600'}`}>
                                    {rule.id.includes('spam') ? '🚫' : rule.id.includes('links') ? '🔗' : '🛡️'}
                                </div>
                                <div className="space-y-1">
                                    <h3 className="font-black text-sm tracking-tight text-white uppercase">{rule.displayName}</h3>
                                    <p className="text-[10px] text-zinc-500 font-bold leading-relaxed">{rule.description}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => toggleRule(rule.id, !rule.enabled)}
                                className={`w-12 h-6 rounded-lg relative transition-all duration-300 border border-white/10 ${rule.enabled ? 'bg-brand-primary' : 'bg-surface-bright'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-md transition-all shadow-md ${rule.enabled ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>

                        {rule.enabled && (
                            <div className="pt-6 border-t border-white/[0.05] grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 block">Strictness</label>
                                    <div className="flex gap-1">
                                        {['LOW', 'MEDIUM', 'HIGH'].map((level) => (
                                            <button
                                                key={level}
                                                onClick={() => updateSettings(rule.id, { ...rule.settings, strictness: level as any })}
                                                className={`flex-1 py-1.5 rounded-md text-[8px] font-black transition-all border ${rule.settings.strictness === level
                                                    ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20'
                                                    : 'bg-white/[0.02] text-zinc-600 border-white/[0.05] hover:text-zinc-400'
                                                    }`}
                                            >
                                                {level}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 block">Sanction</label>
                                    <select
                                        value={rule.settings.duration > 0 ? 'TIMEOUT' : 'DELETE'}
                                        onChange={(e) => updateSettings(rule.id, { ...rule.settings, duration: e.target.value === 'DELETE' ? 0 : 600 })}
                                        className="w-full bg-white/[0.02] border border-white/[0.05] rounded-md py-1.5 px-3 text-[9px] font-black text-white focus:outline-none focus:ring-1 focus:ring-brand-primary/40 uppercase"
                                    >
                                        <option value="DELETE">Purge Only</option>
                                        <option value="TIMEOUT">Time Out</option>
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <button
                                        onClick={() => openSettings(rule)}
                                        className="w-full py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-all"
                                    >
                                        Detailed Configuration
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {selectedRule && (
                <ModerationRuleModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSave={(settings) => {
                        updateSettings(selectedRule.id, settings);
                        setIsModalOpen(false);
                    }}
                    rule={selectedRule as any}
                />
            )}
        </div>
    );
}
