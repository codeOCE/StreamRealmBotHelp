"use client";

import React, { useState, useEffect } from 'react';
import { apiUrl } from '@/lib/api';

interface Viewer {
    id: string;
    rank: number;
    username: string;
    level: number;
    xp: number;
    points: number;
    lastActive: string;
}

interface LoyaltySettings {
    enabled: boolean;
    pointsPerInterval: number;
    intervalMinutes: number;
    subMultiplier: number;
    currencyName: string;
}

export default function XPPage() {
    const [viewers, setViewers] = useState<Viewer[]>([]);
    const [settings, setSettings] = useState<LoyaltySettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [streamerId, setStreamerId] = useState('');
    const [copied, setCopied] = useState(false);

    const API_BASE = apiUrl('/api/loyalty');

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const [lbRes, setRes, meRes] = await Promise.all([
                fetch(`${API_BASE}/leaderboard`, { credentials: 'include' }),
                fetch(`${API_BASE}/settings`, { credentials: 'include' }),
                fetch(apiUrl('/api/user/me'), { credentials: 'include' }),
            ]);
            const lbData = await lbRes.json();
            const setData = await setRes.json();
            const me = await meRes.json().catch(() => ({}));
            setStreamerId(me?.tenantId ?? me?.id ?? '');

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

    useEffect(() => { fetchData(); }, []);

    const updateLoyaltySetting = async (key: string, value: any) => {
        if (!settings) return;
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        try {
            await fetch(`${API_BASE}/settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSettings),
                credentials: 'include',
            });
        } catch (err) {
            console.error('Failed to update loyalty settings', err);
        }
    };

    const rankDisplay = (rank: number) => {
        if (rank === 1) return <span className="inline-flex w-6 h-6 rounded-full bg-yellow-400/20 border border-yellow-400/40 items-center justify-center text-[9px] font-black text-yellow-400">1</span>;
        if (rank === 2) return <span className="inline-flex w-6 h-6 rounded-full bg-zinc-400/20 border border-zinc-400/40 items-center justify-center text-[9px] font-black text-zinc-300">2</span>;
        if (rank === 3) return <span className="inline-flex w-6 h-6 rounded-full bg-orange-400/20 border border-orange-400/40 items-center justify-center text-[9px] font-black text-orange-400">3</span>;
        return <span className="text-zinc-700 tabular-nums">#{rank}</span>;
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-black tracking-tight text-white font-heading">Leaderboard</h1>
                <p className="text-brand-muted text-sm font-medium mt-1">Track your community's XP and loyalty progress.</p>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="stat-card">
                    <p className="text-[10px] font-black text-zinc-600  mb-3">Total XP</p>
                    <p className="text-2xl font-black text-white tabular-nums tracking-tight">
                        {viewers.reduce((acc, v) => acc + v.xp, 0).toLocaleString()}
                    </p>
                </div>
                <div className="stat-card">
                    <p className="text-[10px] font-black text-zinc-600  mb-3">Active Viewers</p>
                    <p className="text-2xl font-black text-white tabular-nums tracking-tight">{viewers.length}</p>
                </div>
                <div className="stat-card border-brand-primary/20 relative overflow-hidden">
                    <div className="absolute -right-2 -top-2 w-16 h-16 bg-brand-primary/10 blur-2xl rounded-full" />
                    <p className="text-[10px] font-black text-brand-primary  mb-3">Top Level</p>
                    <p className="text-2xl font-black text-white tracking-tight">
                        Level <span className="text-brand-primary">{viewers.length > 0 ? Math.max(...viewers.map(v => v.level)) : 1}</span>
                    </p>
                </div>
            </div>

            {/* Public leaderboard share link */}
            {streamerId && (
                <div className="glass-card rounded-2xl p-4 border border-white/5 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black  text-zinc-400">Public leaderboard link</p>
                        <p className="text-xs text-zinc-500 truncate">Share so viewers can see the rankings and brag about their points</p>
                    </div>
                    <button
                        onClick={() => {
                            navigator.clipboard?.writeText(`${window.location.origin}/leaderboard/${streamerId}`);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                        }}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-brand-primary/15 text-brand-primary border border-brand-primary/20 hover:bg-brand-primary/25 transition-colors shrink-0"
                    >
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                </div>
            )}

            {/* Settings */}
            {settings && (
                <div className="glass-card rounded-2xl p-6 space-y-6">
                    <div className="flex items-center justify-between border-b border-white/5 pb-5">
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-tight font-heading">Loyalty Settings</h3>
                            <p className="text-[10px] font-black text-zinc-600  mt-1">Configure XP and point rewards</p>
                        </div>
                        <button
                            onClick={() => updateLoyaltySetting('enabled', !settings.enabled)}
                            className={`saas-toggle ${settings.enabled ? 'on' : ''}`}
                            aria-label="Toggle loyalty"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500  block">Currency Name</label>
                            <input
                                type="text"
                                value={settings.currencyName}
                                maxLength={24}
                                onChange={(e) => setSettings({ ...settings, currencyName: e.target.value })}
                                onBlur={(e) => updateLoyaltySetting('currencyName', e.target.value || 'Points')}
                                className="void-input"
                                placeholder="Points"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500  block">Points per Interval</label>
                            <input
                                type="number"
                                value={settings.pointsPerInterval}
                                onChange={(e) => updateLoyaltySetting('pointsPerInterval', Number(e.target.value))}
                                className="void-input"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500  block">Interval (Minutes)</label>
                            <input
                                type="number"
                                value={settings.intervalMinutes}
                                onChange={(e) => updateLoyaltySetting('intervalMinutes', Number(e.target.value))}
                                className="void-input"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500  block">Subscriber Multiplier</label>
                            <input
                                type="number"
                                step="0.5"
                                value={settings.subMultiplier}
                                onChange={(e) => updateLoyaltySetting('subMultiplier', Number(e.target.value))}
                                className="void-input"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Leaderboard table */}
            <div className="glass-card rounded-2xl overflow-hidden">
                <div className="px-6 py-5 border-b border-white/5 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg>
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-tight font-heading">Leaderboard</h3>
                        <p className="text-[10px] font-black text-zinc-600 ">Community rankings</p>
                    </div>
                </div>

                {isLoading ? (
                    <div className="p-6 space-y-3">
                        {[0,1,2,3,4].map(i => (
                            <div key={i} className="flex items-center gap-4 px-2 py-2">
                                <div className="skeleton w-8 h-5 rounded-lg shrink-0" />
                                <div className="skeleton h-4 w-32 rounded-lg" />
                                <div className="skeleton h-5 w-14 rounded-lg" />
                                <div className="skeleton h-4 w-16 rounded-lg ml-auto" />
                                <div className="skeleton h-4 w-16 rounded-lg" />
                            </div>
                        ))}
                    </div>
                ) : viewers.length === 0 ? (
                    <div className="py-20 text-center text-zinc-700 font-black text-[10px] ">
                        No viewers yet. Start streaming to build your leaderboard.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[700px]">
                            <thead>
                                <tr className="border-b border-white/[0.04]">
                                    <th className="px-6 py-4 text-[10px] font-black text-zinc-600  w-16">Rank</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-zinc-600 ">Viewer</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-zinc-600 ">Level</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-zinc-600 ">XP</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-zinc-600 ">{settings?.currencyName || 'Points'}</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-zinc-600  text-right">Last Active</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03]">
                                {viewers.map((viewer) => (
                                    <tr key={viewer.id} className="hover:bg-white/[0.02] transition-colors duration-150 group/row">
                                        <td className="px-6 py-4 font-black text-sm text-center">
                                            {rankDisplay(viewer.rank)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-black text-white text-sm group-hover/row:text-brand-primary transition-colors">
                                                {viewer.username}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="void-badge void-badge-blue">Lvl {viewer.level}</span>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-black text-zinc-500 tabular-nums">
                                            {viewer.xp.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-sm font-black text-brand-primary tabular-nums">
                                            {viewer.points.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-right text-[10px] font-black text-zinc-700 ">
                                            {viewer.lastActive}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
