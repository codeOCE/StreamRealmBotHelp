'use client';

import React, { useState, useEffect } from 'react';
import SkillTree from '@/components/loyalty/SkillTree';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Toaster, toast } from 'sonner';

interface DashboardData {
    tenantId: string;
    profile: {
        id: string;
        username: string;
        level: number;
        points: number;
        seasonXp: number;
        skillPoints: number;
        unlockedSkills: { skillNodeId: string }[];
    };
    skillTree: any[]; // Typing handled in component
}

/**
 * Render the Loyalty & Progression dashboard that displays user stats and an interactive talent tree.
 *
 * Fetches dashboard data on mount, shows loading and error states, and allows unlocking skills with an optimistic
 * local update followed by a background refresh to reconcile server state.
 *
 * @returns The React element for the loyalty dashboard containing stats cards, a talent tree, and notification handling.
 */
export default function LoyaltyPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Hardcoded for demo/dev as per previous steps
    const USER_ID = '96085876';
    const API_BASE = 'http://localhost:3001/loyalty';

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const res = await fetch(`${API_BASE}/dashboard/${USER_ID}`);
            if (!res.ok) throw new Error('Failed to fetch data');
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load loyalty data');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleUnlock = async (cost: number) => {
        if (!data) return;
        // Optimistic update
        setData(prev => prev ? ({
            ...prev,
            profile: {
                ...prev.profile,
                skillPoints: prev.profile.skillPoints - cost
            }
        }) : null);

        // Background refresh to get exact server state
        setTimeout(fetchData, 500);
    };

    if (isLoading) {
        return <div className="text-white p-8">Loading Loyalty System...</div>;
    }

    if (!data) {
        return <div className="text-white p-8">Error loading data.</div>;
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <Toaster position="top-right" theme="dark" />

            <div className="flex flex-col gap-2 border-l-4 border-brand-primary pl-6 py-2">
                <h1 className="text-3xl font-black tracking-tight text-white uppercase">Loyalty & Progression</h1>
                <p className="text-zinc-500 text-sm font-bold tracking-wide">Manage skill trees, viewer levels, and season rewards.</p>
            </div>

            {/* Stats Header */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard title="Current Level" value={data.profile.level.toString()} icon="⚡" />
                <StatCard title="Season XP" value={data.profile.seasonXp.toLocaleString()} icon="✨" />
                <StatCard title="Skill Points" value={data.profile.skillPoints.toString()} icon="🔮" highlight />
                <StatCard title="Points Balance" value={data.profile.points.toLocaleString()} icon="💎" />
            </div>

            {/* Skill Tree */}
            <div className="space-y-4">
                <h2 className="text-xl font-bold text-white">Talent Tree</h2>
                <SkillTree
                    tenantId={data.tenantId}
                    userId={USER_ID}
                    currentSkillPoints={data.profile.skillPoints}
                    initialSkills={data.skillTree}
                    initialUnlocked={data.profile.unlockedSkills.map((s: any) => s.skillNodeId)}
                    onSkillUnlock={handleUnlock}
                />
            </div>
        </div>
    );
}

/**
 * Renders a small statistic card with a title, prominent value, and supporting icon.
 *
 * The card applies an alternate visual style when `highlight` is true to draw attention to the value.
 *
 * @param title - Short label shown in the card header (e.g., "Current Level")
 * @param value - Primary value displayed prominently (e.g., "42")
 * @param icon - Single-character or icon string rendered in the header as a visual cue
 * @param highlight - When true, uses the highlighted color and border styles to emphasize the card
 * @returns A JSX element representing the stat card
 */
function StatCard({ title, value, icon, highlight = false }: { title: string, value: string, icon: string, highlight?: boolean }) {
    return (
        <Card className={`bg-surface-base border-white/[0.05] ${highlight ? 'border-brand-primary/50 bg-brand-primary/5' : ''}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400 font-bold uppercase tracking-wider">
                    {title}
                </CardTitle>
                <div className="text-2xl opacity-50">{icon}</div>
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-black ${highlight ? 'text-brand-primary' : 'text-white'}`}>{value}</div>
            </CardContent>
        </Card>
    );
}