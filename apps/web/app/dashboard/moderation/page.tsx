"use client";

import React, { useState, useEffect } from 'react';
import { Shield, ShieldCheck } from 'lucide-react';
import ModerationRuleModal from '../../../components/dashboard/ModerationRuleModal';
import { VoidSelect } from '../../../components/dashboard/VoidSelect';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import { FeatureHeader, FeaturePage, LoadingGrid, Panel } from '@/components/dashboard/FeatureUI';

function ModRuleIcon({ type }: { type: string }) {
    const p = { width: 24, height: 24, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    switch (type) {
        case 'SPAM':        return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
        case 'LINKS':       return <svg {...p}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>;
        case 'CAPS':        return <svg {...p}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>;
        case 'SYMBOLS':     return <svg {...p}><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>;
        case 'EMOTES':      return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>;
        case 'BANNED_WORDS': return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>;
        default:            return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    }
}

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

interface ShieldState {
    enabled: boolean;
    maxAccountAgeDays: number;
    requireFollow: boolean;
    action: 'timeout' | 'delete' | 'ban';
    duration: number;
    silent: boolean;
}

/** Hate-raid / follow-bot lockdown. Channel-wide mode, not a per-message rule. */
function ShieldPanel() {
    const [s, setS] = useState<ShieldState | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch(apiUrl('/api/moderation/shield'), { credentials: 'include' })
            .then((r) => r.json())
            .then(setS)
            .catch(() => { });
    }, []);

    const save = async (patch: Partial<ShieldState>) => {
        setSaving(true);
        try {
            const res = await fetch(apiUrl('/api/moderation/shield'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            if (res.ok) setS(await res.json());
        } finally {
            setSaving(false);
        }
    };

    if (!s) return null;
    const on = s.enabled;

    return (
        <Panel className={cn(on ? '!bg-rose-500/[0.04] !border-rose-500/25' : '')}>
            <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className={cn('w-14 h-14 rounded-2xl border flex items-center justify-center shrink-0', on ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-white/[0.03] border-white/10 text-zinc-500')}>
                    <ShieldCheck className="w-7 h-7" />
                </div>
                <div className="flex-1">
                    <p className={cn('text-[10px] font-black  mb-1', on ? 'text-rose-400' : 'text-zinc-500')}>
                        Shield Mode {on ? '· Active' : ''}
                    </p>
                    <p className="text-sm text-zinc-500 font-medium leading-relaxed">
                        One tap during a hate-raid: brand-new accounts {s.requireFollow ? 'and non-followers ' : ''}are auto-{s.action}d. Trusted regulars, subs, VIPs, and mods are never touched.
                    </p>
                </div>
                <button
                    type="button"
                    disabled={saving}
                    onClick={() => save({ enabled: !on })}
                    className={cn('px-6 py-3 rounded-xl font-black text-[11px]  transition-all shrink-0 disabled:opacity-50', on ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'bg-white/5 border border-white/10 text-zinc-400 hover:text-white')}
                >
                    {on ? 'Disable' : 'Enable Shield'}
                </button>
            </div>

            {on && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/5">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black  text-zinc-500">Min account age (days)</label>
                        <input
                            type="number"
                            min={0}
                            defaultValue={s.maxAccountAgeDays}
                            onBlur={(e) => save({ maxAccountAgeDays: Number(e.target.value) })}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-rose-500/50"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black  text-zinc-500">Action</label>
                        <VoidSelect value={s.action} onChange={(e) => save({ action: e.target.value as ShieldState['action'] })}>
                            <option value="timeout">Timeout</option>
                            <option value="delete">Delete message</option>
                            <option value="ban">Ban</option>
                        </VoidSelect>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black  text-zinc-500">Require follow</label>
                        <button
                            type="button"
                            onClick={() => save({ requireFollow: !s.requireFollow })}
                            className={cn('w-full py-3 rounded-xl text-[11px] font-black  border transition-all', s.requireFollow ? 'bg-rose-500/15 border-rose-500/30 text-rose-300' : 'bg-zinc-950/50 border-white/10 text-zinc-500')}
                        >
                            {s.requireFollow ? 'On — block non-followers' : 'Off'}
                        </button>
                    </div>
                </div>
            )}
        </Panel>
    );
}

export default function ModerationPage() {
    const [rules, setRules] = useState<ModRule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedRule, setSelectedRule] = useState<ModRule | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const API_BASE = apiUrl('/api/moderation');

    const fetchRules = async () => {
        try {
            setIsLoading(true);
            const res = await fetch(API_BASE, { credentials: 'include' });
            const data = await res.json();

            if (!Array.isArray(data)) {
                setRules([]);
                return;
            }

            const metadata: Record<string, { label: string; description: string }> = {
                CAPS: { label: 'Caps Protection', description: 'Prevents excessive use of capital letters in chat.' },
                LINKS: { label: 'Link Protection', description: 'Auto-deletes unauthorized URLs to prevent spam and phishing.' },
                SPAM: { label: 'Spam Filter', description: 'Blocks repetitive messages and common spam patterns.' },
                SYMBOLS: { label: 'Symbol Protection', description: 'Deletes messages with excessive non-alphanumeric characters.' },
                EMOTES: { label: 'Emote Protection', description: 'Limits the number of emotes allowed per message.' },
                BANNED_WORDS: { label: 'Banned Words', description: 'Blacklist specific words or phrases from your chat.' },
            };

            setRules(data.map((rule) => ({
                ...rule,
                displayName: metadata[rule.type]?.label || rule.type,
                description: metadata[rule.type]?.description || 'Automated moderation rule.',
            })));
        } catch (err) {
            console.error('Failed to fetch moderation rules', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchRules(); }, []);

    const toggleRule = async (id: string, enabled: boolean) => {
        setRules(rules.map((r) => (r.id === id ? { ...r, enabled } : r)));
        try {
            await fetch(`${API_BASE}/${id}/toggle`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled }),
                credentials: 'include',
            });
        } catch {
            fetchRules();
        }
    };

    const updateSettings = async (id: string, settings: ModRule['settings']) => {
        setRules(rules.map((r) => (r.id === id ? { ...r, settings } : r)));
        try {
            await fetch(`${API_BASE}/${id}/settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
                credentials: 'include',
            });
        } catch {
            fetchRules();
        }
    };

    if (isLoading) {
        return (
            <FeaturePage>
                <div className="space-y-2">
                    <div className="skeleton h-9 w-40 rounded-2xl" />
                    <div className="skeleton h-4 w-72 rounded-lg" />
                </div>
                <LoadingGrid />
            </FeaturePage>
        );
    }

    return (
        <FeaturePage>
            <FeatureHeader
                icon={Shield}
                title="Moderation"
                subtitle="Configure auto-mod rules and chat safety standards."
            />

            <ShieldPanel />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {rules.map((rule) => (
                    <div
                        key={rule.id}
                        className={cn(
                            'bento-card holo-card p-7 group',
                            !rule.enabled && 'opacity-45 grayscale',
                        )}
                    >
                        <div className="flex items-start justify-between gap-4 mb-6">
                            <div className="flex items-start gap-4 min-w-0">
                                <div className={cn(
                                    'w-14 h-14 rounded-xl flex items-center justify-center shrink-0 border',
                                    rule.enabled
                                        ? 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary'
                                        : 'bg-white/[0.03] border-white/8 text-zinc-600',
                                )}>
                                    <ModRuleIcon type={rule.type} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-base font-black text-white group-hover:text-brand-primary transition-colors">{rule.displayName}</h3>
                                    <p className="text-[11px] text-zinc-600 font-medium mt-1 leading-relaxed">{rule.description}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => toggleRule(rule.id, !rule.enabled)}
                                className={cn(
                                    'w-12 h-7 rounded-full relative border shrink-0 cursor-pointer transition-colors',
                                    rule.enabled ? 'bg-brand-primary border-brand-primary/20 shadow-glow-p' : 'bg-zinc-900 border-white/8',
                                )}
                                aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
                            >
                                <div className={cn(
                                    'absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all shadow-md',
                                    rule.enabled ? 'left-[1.35rem]' : 'left-0.5 bg-zinc-500',
                                )} />
                            </button>
                        </div>

                        {rule.enabled && (
                            <div className="pt-6 border-t border-white/[0.06] space-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black  text-zinc-600">Strictness</label>
                                        <div className="flex p-1 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                                            {(['LOW', 'MEDIUM', 'HIGH'] as const).map((level) => (
                                                <button
                                                    key={level}
                                                    type="button"
                                                    onClick={() => updateSettings(rule.id, { ...rule.settings, strictness: level })}
                                                    className={cn(
                                                        'flex-1 py-2 rounded-lg text-[9px] font-black  cursor-pointer transition-colors',
                                                        rule.settings.strictness === level
                                                            ? 'bg-brand-primary text-[#05070a]'
                                                            : 'text-zinc-600 hover:text-white',
                                                    )}
                                                >
                                                    {level}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black  text-zinc-600">Action</label>
                                        <VoidSelect
                                            compact
                                            value={rule.settings.duration > 0 ? 'TIMEOUT' : 'DELETE'}
                                            onChange={(e) => updateSettings(rule.id, { ...rule.settings, duration: e.target.value === 'DELETE' ? 0 : 600 })}
                                            className="!py-2.5 !text-[10px] font-black uppercase"
                                        >
                                            <option value="DELETE">Delete Message</option>
                                            <option value="TIMEOUT">Timeout</option>
                                        </VoidSelect>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedRule(rule); setIsModalOpen(true); }}
                                    className="w-full py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-[10px] font-black  text-zinc-500 hover:text-white hover:border-brand-primary/20 transition-colors cursor-pointer"
                                >
                                    Configure Rule
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {selectedRule && (
                <ModerationRuleModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSave={(id, settings) => {
                        updateSettings(id, settings);
                        setIsModalOpen(false);
                    }}
                    rule={selectedRule as any}
                />
            )}

            <Panel className="!bg-rose-500/[0.03] !border-rose-500/15 flex flex-col md:flex-row items-center gap-6">
                <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                    <ShieldCheck className="w-7 h-7" />
                </div>
                <div className="flex-1 text-center md:text-left">
                    <p className="text-[10px] font-black text-rose-400  mb-2">Auto-Mod Status</p>
                    <p className="text-sm text-zinc-500 font-medium leading-relaxed">
                        Safety filters are <span className="text-white">active</span>. Disabling core rules may allow spam and harmful content through your chat.
                    </p>
                </div>
                <span className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 font-black text-[10px]  shrink-0">
                    Security Critical
                </span>
            </Panel>
        </FeaturePage>
    );
}
