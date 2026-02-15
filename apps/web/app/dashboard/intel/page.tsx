'use client';

import React, { useState, useEffect } from 'react';

interface CommandStat {
    trigger: string;
    usages: number;
    enabled: boolean;
}

interface LoyaltySummary {
    totalUsers: number;
    sumXP: number;
    topViewers: { username: string, xp: number, level: number }[];
}

export default function IntelPage() {
    const [commandStats, setCommandStats] = useState<CommandStat[]>([]);
    const [loyalty, setLoyalty] = useState<LoyaltySummary | null>(null);
    const [trends, setTrends] = useState<{ hour: number, count: number }[]>([]);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [cmdRes, trendRes, loyaltyRes] = await Promise.all([
                    fetch('http://localhost:3001/analytics/commands?tenantId=default'),
                    fetch('http://localhost:3001/analytics/trends?tenantId=default'),
                    fetch('http://localhost:3001/analytics/loyalty?tenantId=default')
                ]);

                setCommandStats(await cmdRes.json());
                setTrends(await trendRes.json());
                setLoyalty(await loyaltyRes.json());
            } catch (err) {
                console.error('Failed to fetch analytics', err);
            }
        };

        fetchAll();
    }, []);

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-white">Intel HUD</h1>
                    <p className="text-sm text-zinc-500 font-medium">Measurement and engagement intelligence protocols.</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary/5 border border-brand-primary/10">
                    <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">Protocol Active</span>
                </div>
            </div>

            {/* Grid Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Engagement Mass"
                    value={loyalty?.totalUsers.toLocaleString() || '0'}
                    subValue="Unique Identities Identified"
                    icon="👥"
                    trend="+12% vs last week"
                />
                <StatCard
                    title="Command Resonance"
                    value={(commandStats.reduce((acc, curr) => acc + curr.usages, 0)).toLocaleString()}
                    subValue="Total Protocol Executions"
                    icon="⌨️"
                    trend="+5.4% efficiency"
                />
                <StatCard
                    title="Loyalty Accumulation"
                    value={((loyalty?.sumXP || 0) / 1000).toFixed(1) + 'k'}
                    subValue="Total XP Harvested"
                    icon="✨"
                    trend="Growth stable"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Trend Chart */}
                <div className="lg:col-span-2 bg-surface-base border border-white/[0.05] rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-tr from-brand-primary/[0.02] to-transparent pointer-events-none" />
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse shadow-[0_0_8px_rgba(0,163,255,0.6)]" />
                            <h3 className="text-xs font-black text-white uppercase tracking-widest">Interactive Pulse (24h)</h3>
                        </div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase">Live Telemetry</span>
                    </div>

                    <div className="h-48 flex items-end gap-1 px-2 relative">
                        {trends.map((t, i) => (
                            <div
                                key={i}
                                className="flex-1 bg-brand-primary/10 rounded-t-sm hover:bg-brand-primary/40 transition-all relative group/bar"
                                style={{ height: `${Math.max(10, (t.count / (Math.max(...trends.map(x => x.count)) || 1)) * 100)}%` }}
                            >
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white text-black text-[9px] font-black px-1.5 py-0.5 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap z-20 shadow-xl">
                                    {t.count} Events
                                </div>
                            </div>
                        ))}
                        {/* Grid Lines */}
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-[0.03]">
                            <div className="w-full h-px bg-white" />
                            <div className="w-full h-px bg-white" />
                            <div className="w-full h-px bg-white" />
                        </div>
                    </div>
                    <div className="flex justify-between mt-4 text-[9px] font-bold text-zinc-600 uppercase tracking-tighter">
                        <span>00:00</span>
                        <span>06:00</span>
                        <span>12:00</span>
                        <span>18:00</span>
                        <span>24:00</span>
                    </div>
                </div>

                {/* Top Commands */}
                <div className="bg-surface-base border border-white/[0.05] rounded-2xl p-6 shadow-xl flex flex-col">
                    <h3 className="text-xs font-black text-white uppercase tracking-widest mb-6 px-1">Trigger Resonance</h3>
                    <div className="space-y-5 flex-1 overflow-y-auto custom-scrollbar pr-1">
                        {commandStats.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-20 text-center gap-2">
                                <span className="text-2xl">📡</span>
                                <span className="text-[10px] font-black uppercase">No telemetry found</span>
                            </div>
                        ) : (
                            commandStats.map((cmd, i) => (
                                <div key={cmd.trigger} className="group/item relative">
                                    <div className="flex items-center gap-4 mb-2">
                                        <div className="w-6 h-6 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center text-[10px] font-black text-zinc-500 group-hover/item:text-brand-primary transition-colors">
                                            {i + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-end mb-1">
                                                <span className="text-xs font-black text-white group-hover/item:translate-x-0.5 transition-transform truncate">!{cmd.trigger}</span>
                                                <span className="text-[10px] font-bold text-zinc-500 italic">{cmd.usages} hit</span>
                                            </div>
                                            <div className="h-1 bg-white/[0.02] rounded-full overflow-hidden border border-white/[0.02]">
                                                <div
                                                    className="h-full bg-gradient-to-r from-brand-primary/40 to-brand-primary group-hover/item:from-brand-primary/60 transition-all duration-1000"
                                                    style={{ width: `${(cmd.usages / (commandStats[0]?.usages || 1)) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Loyalty Leaderboard (Mini) */}
            <div className="bg-surface-base border border-white/[0.05] rounded-2xl p-6 shadow-xl">
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xs font-black text-white uppercase tracking-widest">Identify Hierarchy</h3>
                    <button className="text-[10px] font-black text-zinc-500 hover:text-white uppercase tracking-widest transition-colors">Full Roster →</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {loyalty?.topViewers.map((user, idx) => (
                        <div key={user.username} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-all group">
                            <div className="flex items-center justify-between mb-3">
                                <div className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-zinc-300' : idx === 2 ? 'bg-orange-700' : 'bg-brand-primary/40'}`} />
                                <span className="text-[9px] font-black text-zinc-600 uppercase">Tier {user.level}</span>
                            </div>
                            <p className="text-xs font-black text-white truncate mb-1">{user.username}</p>
                            <p className="text-[11px] font-bold text-brand-primary">{(user.xp).toLocaleString()} XP</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, subValue, icon, trend }: { title: string, value: string, subValue: string, icon: string, trend?: string }) {
    return (
        <div className="bg-surface-base border border-white/[0.05] rounded-2xl p-6 shadow-xl group hover:border-brand-primary/30 transition-all relative overflow-hidden flex flex-col gap-4">
            <div className="absolute -right-6 -top-6 text-7xl opacity-[0.02] group-hover:scale-110 group-hover:rotate-6 transition-all duration-700 pointer-events-none select-none">{icon}</div>
            <div className="flex flex-col gap-1 relative z-10">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">{title}</span>
                <span className="text-3xl font-black text-white tracking-tight">{value}</span>
            </div>
            <div className="flex flex-col gap-0.5 relative z-10">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{subValue}</span>
                {trend && <span className="text-[9px] font-black text-brand-primary/60 uppercase">{trend}</span>}
            </div>
        </div>
    );
}
