"use client";

import React, { useState, useEffect } from 'react';

interface Viewer {
    id: string;
    rank: number;
    username: string;
    level: number;
    xp: number;
    points: number;
    lastActive: string;
}

export default function XPPage() {
    const [viewers, setViewers] = useState<Viewer[]>([]);
    const [settings, setSettings] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    const API_BASE = '/api/loyalty';

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const [lbRes, setRes] = await Promise.all([
                fetch(`${API_BASE}/leaderboard`),
                fetch(`${API_BASE}/settings`)
            ]);
            const lbData = await lbRes.json();
            const setData = await setRes.json();

            setViewers(lbData.map((v: any, i: number) => ({
                id: v.id,
                rank: i + 1,
                username: v.username,
                level: v.level,
                xp: v.xp,
                points: v.points,
                lastActive: new Date(v.lastActiveAt).toLocaleString()
            })));
            setSettings(setData);
        } catch (err) {
            console.error('Failed to fetch loyalty data', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const updateLoyaltySetting = async (key: string, value: any) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        try {
            await fetch(`${API_BASE}/settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSettings),
            });
        } catch (err) {
            console.error('Failed to update loyalty settings', err);
        }
    };

    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="flex flex-col gap-2">
                <h1 className="text-4xl font-extrabold tracking-tight text-white">Loyalty & Rewards</h1>
                <p className="text-zinc-500 text-base font-medium max-w-2xl">Manage viewer experience points and automated currency distribution to reward your most active members.</p>
            </div>

            {/* Loyalty Configuration */}
            {settings && (
                <div className="glass-card rounded-4xl p-10 space-y-10 relative overflow-hidden border border-white/[0.08]">
                    <div className="flex items-center justify-between border-b border-white/[0.05] pb-10 relative z-10 w-full">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-2xl font-bold text-white">Reward Configuration</h3>
                            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-[0.3em]">Automated Distribution Engine</p>
                        </div>
                        <button
                            onClick={() => updateLoyaltySetting('enabled', !settings.enabled)}
                            className={`w-14 h-7 rounded-full relative transition-all duration-500 border border-white/[0.05] ${settings.enabled ? 'bg-brand-primary shadow-premium' : 'bg-surface-bright'}`}
                        >
                            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all duration-500 shadow-xl ${settings.enabled ? 'left-8' : 'left-1'}`} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative z-10">
                        <div className="space-y-4">
                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 px-1">Points Per Interval</label>
                            <input
                                type="number"
                                value={settings.pointsPerInterval}
                                onChange={(e) => updateLoyaltySetting('pointsPerInterval', Number(e.target.value))}
                                className="w-full bg-black/40 border border-white/[0.05] rounded-2xl px-6 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-bold shadow-premium"
                            />
                        </div>
                        <div className="space-y-4">
                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 px-1">Interval (Minutes)</label>
                            <input
                                type="number"
                                value={settings.intervalMinutes}
                                onChange={(e) => updateLoyaltySetting('intervalMinutes', Number(e.target.value))}
                                className="w-full bg-black/40 border border-white/[0.05] rounded-2xl px-6 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-bold shadow-premium"
                            />
                        </div>
                        <div className="space-y-4">
                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 px-1">Subscriber Boost</label>
                            <input
                                type="number"
                                step="0.5"
                                value={settings.subMultiplier}
                                onChange={(e) => updateLoyaltySetting('subMultiplier', Number(e.target.value))}
                                className="w-full bg-black/40 border border-white/[0.05] rounded-2xl px-6 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-bold shadow-premium"
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="glass-card rounded-4xl p-10 group border border-white/[0.08] hover:border-brand-primary/20 transition-all duration-500">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-6">Community Total XP</p>
                    <p className="text-4xl font-extrabold tracking-tight text-white group-hover:text-brand-primary transition-colors">
                        {viewers.reduce((acc: number, v: Viewer) => acc + v.xp, 0).toLocaleString()}
                    </p>
                </div>
                <div className="glass-card rounded-4xl p-10 group border border-white/[0.08] hover:border-brand-primary/20 transition-all duration-500">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-6">Active Members</p>
                    <p className="text-4xl font-extrabold tracking-tight text-white group-hover:text-brand-primary transition-colors">{viewers.length}</p>
                </div>
                <div className="glass-card rounded-4xl p-10 group border-brand-primary/20 relative overflow-hidden bg-brand-primary/[0.02]">
                    <div className="absolute top-0 right-0 p-8 opacity-5 text-8xl pointer-events-none">⭐</div>
                    <p className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.2em] mb-6">Peak Level reached</p>
                    <p className="text-4xl font-extrabold tracking-tight text-brand-primary">
                        Lv. {viewers.length > 0 ? Math.max(...viewers.map(v => v.level)) : 1}
                    </p>
                </div>
            </div>

            <div className="glass-card rounded-4xl overflow-hidden border border-white/[0.08]">
                <div className="px-10 py-8 border-b border-white/[0.05] bg-white/[0.02] flex items-center justify-between">
                    <h3 className="font-bold text-xl tracking-tight text-white">Global Leaderboard</h3>
                </div>
                {isLoading ? (
                    <div className="p-32 text-center text-zinc-600 animate-pulse font-bold uppercase tracking-[0.4em] text-[10px]">Fetching Community Ranks...</div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/[0.02]">
                                <th className="px-10 py-6 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em] border-b border-white/[0.05]">Rank</th>
                                <th className="px-10 py-6 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em] border-b border-white/[0.05]">Member</th>
                                <th className="px-10 py-6 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em] border-b border-white/[0.05]">Level</th>
                                <th className="px-10 py-6 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em] border-b border-white/[0.05]">Experience</th>
                                <th className="px-10 py-6 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em] border-b border-white/[0.05]">Currency</th>
                                <th className="px-10 py-6 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em] border-b border-white/[0.05] text-right">Last Active</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.05]">
                            {viewers.map((viewer) => (
                                <tr key={viewer.id} className="hover:bg-white/[0.02] transition-all duration-300 group">
                                    <td className="px-10 py-8 font-extrabold text-sm text-zinc-500">
                                        {viewer.rank === 1 ? '🥇' : viewer.rank === 2 ? '🥈' : viewer.rank === 3 ? '🥉' : `#${viewer.rank}`}
                                    </td>
                                    <td className="px-10 py-8">
                                        <span className="font-extrabold text-white group-hover:text-brand-primary transition-colors text-base tracking-tight">{viewer.username}</span>
                                    </td>
                                    <td className="px-10 py-8">
                                        <span className="text-[10px] font-extrabold text-brand-primary bg-brand-primary/5 px-3 py-1.5 rounded-full border border-brand-primary/10 shadow-premium uppercase tracking-widest">LVL {viewer.level}</span>
                                    </td>
                                    <td className="px-10 py-8 text-sm font-bold text-zinc-400">{viewer.xp.toLocaleString()} <span className="text-[9px] uppercase tracking-widest text-zinc-600 ml-1">XP</span></td>
                                    <td className="px-10 py-8 text-base font-extrabold text-brand-primary">{viewer.points.toLocaleString()} <span className="text-[9px] uppercase tracking-widest text-brand-primary/50 ml-1">SR</span></td>
                                    <td className="px-10 py-8 text-right text-[10px] font-bold text-zinc-600 uppercase tracking-widest leading-relaxed">
                                        {viewer.lastActive}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
