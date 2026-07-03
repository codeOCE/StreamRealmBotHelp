'use client';

import React, { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FeatureHeader, FeaturePage, Panel, ProgressRow, SectionLabel, StatTile } from '@/components/dashboard/FeatureUI';

interface CommandStat {
    trigger: string;
    usages: number;
    enabled: boolean;
}

interface LoyaltySummary {
    totalUsers: number;
    sumXP: number;
    topViewers: { username: string; xp: number; level: number }[];
}

export default function IntelPage() {
    const [commandStats, setCommandStats] = useState<CommandStat[]>([]);
    const [loyalty, setLoyalty] = useState<LoyaltySummary | null>(null);
    const [trends, setTrends] = useState<{ hour: number; count: number }[]>([]);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [cmdRes, trendRes, loyaltyRes] = await Promise.all([
                    fetch('/api/analytics/commands?tenantId=default', { credentials: 'include' }),
                    fetch('/api/analytics/trends?tenantId=default', { credentials: 'include' }),
                    fetch('/api/analytics/loyalty?tenantId=default', { credentials: 'include' }),
                ]);
                const cmdData = await cmdRes.json();
                const trendData = await trendRes.json();
                const loyaltyData = await loyaltyRes.json();
                setCommandStats(Array.isArray(cmdData) ? cmdData : []);
                setTrends(Array.isArray(trendData) ? trendData : []);
                setLoyalty(loyaltyData && typeof loyaltyData === 'object' && !Array.isArray(loyaltyData) ? loyaltyData : null);
            } catch (err) {
                console.error('Failed to fetch analytics', err);
            }
        };
        fetchAll();
    }, []);

    const maxTrend = Math.max(...trends.map((x) => x.count), 1);
    const totalUsages = commandStats.reduce((acc, curr) => acc + curr.usages, 0);
    const topUsage = commandStats[0]?.usages || 1;

    return (
        <FeaturePage>
            <FeatureHeader
                icon={BarChart3}
                title="Analytics"
                subtitle="Your channel's performance, visualized."
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatTile label="Total Viewers" value={loyalty?.totalUsers.toLocaleString() || '0'} hint="Unique viewers tracked" />
                <StatTile label="Command Usages" value={totalUsages.toLocaleString()} hint="Total command triggers" />
                <StatTile label="Points Earned" value={`${((loyalty?.sumXP || 0) / 1000).toFixed(1)}K`} hint="Total engagement earned" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Panel title="Activity (24H)" className="lg:col-span-2 relative overflow-hidden">
                    <span className="absolute top-7 right-7 text-[10px] font-black text-brand-primary  flex items-center gap-2">
                        <span className="live-dot" /> Live
                    </span>
                    <div className="h-64 flex items-end gap-1.5 px-2 mt-2">
                        {trends.map((t, i) => (
                            <div
                                key={i}
                                className="flex-1 bg-brand-primary/10 rounded-t-lg hover:bg-brand-primary/35 transition-all duration-300 relative group/bar border-t border-brand-primary/20 min-h-[8px]"
                                style={{ height: `${Math.max(8, (t.count / maxTrend) * 100)}%` }}
                            >
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white text-black text-[9px] font-black px-2 py-1 rounded-lg opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                    {t.count} events
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between mt-6 px-2 text-[10px] font-black text-zinc-600 ">
                        <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
                    </div>
                </Panel>

                <Panel title="Peak Triggers">
                    <div className="space-y-5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                        {commandStats.length === 0 ? (
                            <p className="text-[10px] font-black  text-zinc-700 text-center py-12">Awaiting data…</p>
                        ) : (
                            commandStats.map((cmd) => (
                                <ProgressRow
                                    key={cmd.trigger}
                                    label={`!${cmd.trigger}`}
                                    pct={Math.round((cmd.usages / topUsage) * 100)}
                                    count={cmd.usages}
                                    leading={cmd.trigger === commandStats[0]?.trigger}
                                />
                            ))
                        )}
                    </div>
                </Panel>
            </div>

            <div className="space-y-5">
                <SectionLabel action={
                    <button type="button" className="text-[10px] font-black  text-brand-primary hover:text-white transition-colors shrink-0">
                        View Leaderboard →
                    </button>
                }>
                    Top Viewers
                </SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {(loyalty?.topViewers || []).map((user, idx) => (
                        <div key={user.username} className="bento-card holo-card p-6 group relative overflow-hidden">
                            <div className="absolute -right-2 -top-2 text-3xl opacity-[0.06] font-black select-none">#{idx + 1}</div>
                            <div className="relative z-10 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className={cn(
                                        'w-2.5 h-2.5 rounded-full',
                                        idx === 0 ? 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]' :
                                        idx === 1 ? 'bg-zinc-300' :
                                        idx === 2 ? 'bg-orange-500' : 'bg-brand-primary/40',
                                    )} />
                                    <span className="text-[9px] font-black text-zinc-600 ">LVL {user.level}</span>
                                </div>
                                <div>
                                    <p className="text-sm font-black text-white truncate group-hover:text-brand-primary transition-colors">{user.username}</p>
                                    <p className="text-[10px] font-black text-brand-primary  mt-1">{user.xp.toLocaleString()} XP</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </FeaturePage>
    );
}
