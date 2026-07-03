'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, Sparkles } from 'lucide-react';
import SkillTree from '@/components/loyalty/SkillTree';
import { Toaster, toast } from 'sonner';
import { fetchJson } from '@/lib/api';
import { DEV_USER, fetchCurrentUser } from '@/lib/dev-auth';
import { FeaturePage, FeatureHeader, StatTile, SectionLabel } from '@/components/dashboard/FeatureUI';

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
    skillTree: any[];
}

export default function LoyaltyPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [twitchUserId, setTwitchUserId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            setIsLoading(true);

            const me = await fetchCurrentUser();
            const id = String(
                (me as { twitchId?: string; twitch_id?: string })?.twitchId
                ?? (me as { twitch_id?: string })?.twitch_id
                ?? DEV_USER.twitchId,
            );
            setTwitchUserId(id);

            const json = await fetchJson(`/api/loyalty/dashboard/${id}`);
            if (!json || typeof json !== 'object' || !('profile' in json)) {
                throw new Error('Invalid loyalty response');
            }
            setData(json as DashboardData);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load loyalty data');
            setData(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleUnlock = async (cost: number) => {
        if (!data) return;
        setData((prev) => prev ? ({
            ...prev,
            profile: {
                ...prev.profile,
                skillPoints: prev.profile.skillPoints - cost,
            },
        }) : null);
        setTimeout(fetchData, 500);
    };

    return (
        <FeaturePage>
            <Toaster position="top-right" theme="dark" />
            <FeatureHeader
                icon={Trophy}
                title="Loyalty"
                subtitle="Reward your community with XP and loyalty points."
            />

            {isLoading ? (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[0, 1, 2, 3].map((i) => <div key={i} className="stat-card"><div className="skeleton h-8 w-20 rounded-lg" /><div className="skeleton h-2 w-16 rounded mt-3" /></div>)}
                    </div>
                    <div className="bento-card !rounded-2xl overflow-hidden"><div className="skeleton h-[600px] w-full" /></div>
                </>
            ) : !data || !twitchUserId ? (
                <p className="text-zinc-400 text-sm">Could not load loyalty data. Try refreshing the page.</p>
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <StatTile label="Current Rank" value={data.profile.level.toString()} />
                        <StatTile label="Season XP" value={data.profile.seasonXp.toLocaleString()} />
                        <StatTile label="Skill Points" value={data.profile.skillPoints.toString()} />
                        <StatTile label="Points" value={data.profile.points.toLocaleString()} />
                    </div>

                    <div className="space-y-4">
                        <SectionLabel>
                            <span className="inline-flex items-center gap-2"><Sparkles className="w-3 h-3 text-brand-primary" /> Skill Tree — unlock abilities for your community</span>
                        </SectionLabel>
                        <div className="bento-card !rounded-2xl overflow-hidden">
                            <SkillTree
                                tenantId={data.tenantId}
                                userId={twitchUserId}
                                currentSkillPoints={data.profile.skillPoints}
                                initialSkills={data.skillTree}
                                initialUnlocked={data.profile.unlockedSkills.map((s) => s.skillNodeId)}
                                onSkillUnlock={handleUnlock}
                            />
                        </div>
                    </div>
                </>
            )}
        </FeaturePage>
    );
}
