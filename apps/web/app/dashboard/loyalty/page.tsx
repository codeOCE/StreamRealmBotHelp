"use client";

import React, { useState, useEffect } from 'react';

interface LoyaltyUser {
    id: string;
    username: string;
    xp: number;
    level: number;
    points: number;
}

export default function LoyaltyPage() {
    const [users, setUsers] = useState<LoyaltyUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const API_BASE = 'http://localhost:3001/loyalty';

    const fetchLeaderboard = async () => {
        try {
            setIsLoading(true);
            const res = await fetch(`${API_BASE}/leaderboard`);
            const data = await res.json();
            setUsers(data);
        } catch (err) {
            console.error('Failed to fetch leaderboard', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchLeaderboard();
    }, []);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col gap-2 border-l-4 border-brand-primary pl-6 py-2">
                <h1 className="text-3xl font-black tracking-tight text-white uppercase">Loyalty Pipeline</h1>
                <p className="text-zinc-500 text-sm font-bold tracking-wide">Viewer engagement tracking and reward distribution management.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Stats Dashboard */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="glass-card rounded-xl p-6 border border-white/[0.05]">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-6">Distribution Config</h3>
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-zinc-600 uppercase">XP per 5 minutes</label>
                                <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.05] rounded-md px-4 py-2">
                                    <span className="text-white font-black">10 XP</span>
                                    <button className="text-brand-primary text-[10px] font-black uppercase">Edit</button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-zinc-600 uppercase">Sub Multiplier</label>
                                <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.05] rounded-md px-4 py-2">
                                    <span className="text-white font-black">2.0x</span>
                                    <button className="text-brand-primary text-[10px] font-black uppercase">Edit</button>
                                </div>
                            </div>
                            <div className="pt-6">
                                <button className="w-full py-3 rounded-lg bg-brand-primary text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all">
                                    Update Loyalty Logic
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card rounded-xl p-6 border border-white/[0.05] bg-brand-primary/[0.02]">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary">Pipeline Status</h3>
                        </div>
                        <p className="text-xs text-zinc-500 font-bold leading-relaxed mb-4">
                            Streaming engagement data is currently being processed by the local ledger.
                        </p>
                        <div className="flex justify-between items-center text-[10px] font-black uppercase border-t border-white/[0.05] pt-4">
                            <span className="text-zinc-600">Active Sessions</span>
                            <span className="text-white">1,242 users</span>
                        </div>
                    </div>
                </div>

                {/* Leaderboard Table */}
                <div className="lg:col-span-2">
                    <div className="glass-card rounded-xl overflow-hidden border border-white/[0.05]">
                        <div className="bg-white/[0.02] px-6 py-4 border-b border-white/[0.05] flex items-center justify-between">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Live Leaderboard</h3>
                            <button onClick={fetchLeaderboard} className="text-zinc-500 hover:text-white transition-colors">
                                🔄
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white/[0.01] border-b border-white/[0.05]">
                                        <th className="px-6 py-4 text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em]">Rank</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em]">Viewer</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em]">Level</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] text-right">Accumulated XP</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.05]">
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-20 text-center text-zinc-600 font-black uppercase tracking-[0.4em] text-[10px] animate-pulse">Scanning Engagement Ledger...</td>
                                        </tr>
                                    ) : users.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-20 text-center text-zinc-600 font-black uppercase tracking-[0.4em] text-[10px]">No engagement data recorded.</td>
                                        </tr>
                                    ) : (
                                        users.map((user, idx) => (
                                            <tr key={user.id} className="hover:bg-white/[0.01] transition-all group">
                                                <td className="px-6 py-4 align-middle">
                                                    <span className={`text-xs font-black tabular-nums ${idx < 3 ? 'text-brand-primary' : 'text-zinc-600'}`}>
                                                        #{idx + 1}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 align-middle">
                                                    <span className="font-black text-white text-sm tracking-tight">{user.username}</span>
                                                </td>
                                                <td className="px-6 py-4 align-middle">
                                                    <span className="text-[10px] font-black text-brand-primary bg-brand-primary/5 px-2 py-0.5 rounded border border-brand-primary/20 uppercase">LVL {user.level}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right align-middle">
                                                    <span className="text-sm font-black text-white tabular-nums">{user.xp.toLocaleString()}</span>
                                                    <span className="text-[9px] font-black text-zinc-600 ml-2 uppercase">XP</span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
