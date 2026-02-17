'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Swords, TrendingUp } from 'lucide-react';

interface LeaderboardEntry {
    rank: number;
    username: string;
    mmr: number;
    totalBattles: number;
    wins: number;
}

interface BattleHistory {
    id: string;
    challenger: { username: string };
    opponent: { username: string };
    challengerRoll: number;
    opponentRoll: number;
    winner: { username: string };
    mmrChange: number;
    createdAt: string;
}

/**
 * Renders the Interactions page with MMR leaderboard and recent battle history organized in tabs.
 *
 * Fetches leaderboard and history on mount, shows loading and empty states, and formats rank colors and win rates for presentation.
 *
 * @returns The React element containing the leaderboard and battle history views.
 */
export default function InteractionsPage() {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [battleHistory, setBattleHistory] = useState<BattleHistory[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const tenantId = 'default'; // Replace with actual tenant ID from context/session

            const [leaderboardRes, historyRes] = await Promise.all([
                fetch(`/api/battles/leaderboard/${tenantId}`),
                fetch(`/api/battles/history/${tenantId}`)
            ]);

            if (leaderboardRes.ok) {
                const data = await leaderboardRes.json();
                setLeaderboard(data);
            }

            if (historyRes.ok) {
                const data = await historyRes.json();
                setBattleHistory(data);
            }
        } catch (error) {
            console.error('Failed to fetch battle data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getRankColor = (rank: number) => {
        if (rank === 1) return 'text-yellow-500';
        if (rank === 2) return 'text-gray-400';
        if (rank === 3) return 'text-amber-600';
        return 'text-gray-600';
    };

    const getWinRate = (wins: number, total: number) => {
        if (total === 0) return '0.0';
        return ((wins / total) * 100).toFixed(1);
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center gap-3">
                <Swords className="h-8 w-8 text-primary" />
                <div>
                    <h1 className="text-3xl font-bold">Interactions</h1>
                    <p className="text-muted-foreground">Viewer battles and competitive rankings</p>
                </div>
            </div>

            <Tabs defaultValue="leaderboard" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="leaderboard" className="flex items-center gap-2">
                        <Trophy className="h-4 w-4" />
                        Leaderboard
                    </TabsTrigger>
                    <TabsTrigger value="history" className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Battle History
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="leaderboard" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>MMR Leaderboard</CardTitle>
                            <CardDescription>
                                Top players ranked by Match Making Rating
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="text-center py-8 text-muted-foreground">Loading...</div>
                            ) : leaderboard.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    No battles yet. Use !battle @username in chat to start!
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {leaderboard.map((entry) => (
                                        <div
                                            key={entry.rank}
                                            className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`text-2xl font-bold ${getRankColor(entry.rank)} min-w-[2rem]`}>
                                                    #{entry.rank}
                                                </div>
                                                <div>
                                                    <div className="font-semibold">{entry.username}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {entry.totalBattles} battles • {getWinRate(entry.wins, entry.totalBattles)}% win rate
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-2xl font-bold text-primary">{entry.mmr}</div>
                                                <div className="text-xs text-muted-foreground">MMR</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Battles</CardTitle>
                            <CardDescription>
                                Latest competitive matches
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="text-center py-8 text-muted-foreground">Loading...</div>
                            ) : battleHistory.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    No battle history yet
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {battleHistory.map((battle) => (
                                        <div
                                            key={battle.id}
                                            className="flex items-center justify-between p-4 rounded-lg border bg-card"
                                        >
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className="text-sm">
                                                    <span className={battle.winner.username === battle.challenger.username ? 'font-bold text-green-500' : ''}>
                                                        {battle.challenger.username}
                                                    </span>
                                                    <span className="text-muted-foreground mx-2">({battle.challengerRoll})</span>
                                                    <span className="text-muted-foreground">vs</span>
                                                    <span className="text-muted-foreground mx-2">({battle.opponentRoll})</span>
                                                    <span className={battle.winner.username === battle.opponent.username ? 'font-bold text-green-500' : ''}>
                                                        {battle.opponent.username}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-semibold text-green-500">
                                                    {battle.winner.username} wins
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    ±{battle.mmrChange} MMR
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}