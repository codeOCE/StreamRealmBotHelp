import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

interface PendingChallenge {
    challenger: string;
    opponent: string;
    tenantId: string;
    timestamp: number;
}

@Injectable()
export class BattleService {
    private readonly logger = new Logger(BattleService.name);
    private pendingChallenges = new Map<string, PendingChallenge>();
    private readonly CHALLENGE_TIMEOUT = 90000; // 90 seconds

    constructor(private prisma: PrismaService) {
        // Clean up expired challenges every 30 seconds
        setInterval(() => this.cleanupExpiredChallenges(), 30000);
    }

    /**
     * Initiate a battle between two players
     * Returns the battle result with winner and MMR changes
     */
    async initiateBattle(challengerUsername: string, opponentUsername: string, tenantId: string) {
        // Get or create both players
        const challenger = await this.prisma.viewerProfile.upsert({
            where: {
                tenantId_twitchUserId: {
                    tenantId,
                    twitchUserId: `twitch_${challengerUsername}` // Placeholder, will be replaced with actual ID
                }
            },
            create: {
                tenantId,
                twitchUserId: `twitch_${challengerUsername}`,
                username: challengerUsername,
                mmr: 1000
            },
            update: {}
        });

        const opponent = await this.prisma.viewerProfile.upsert({
            where: {
                tenantId_twitchUserId: {
                    tenantId,
                    twitchUserId: `twitch_${opponentUsername}`
                }
            },
            create: {
                tenantId,
                twitchUserId: `twitch_${opponentUsername}`,
                username: opponentUsername,
                mmr: 1000
            },
            update: {}
        });

        // Roll random numbers (1-100)
        const challengerRoll = Math.floor(Math.random() * 100) + 1;
        const opponentRoll = Math.floor(Math.random() * 100) + 1;

        // Determine winner
        const winnerId = challengerRoll > opponentRoll ? challenger.id : opponent.id;
        const isChallengerWinner = challengerRoll > opponentRoll;

        // Calculate MMR change
        const mmrDiff = Math.abs(challenger.mmr - opponent.mmr);
        let mmrChange = 25;

        if (isChallengerWinner) {
            // Challenger won
            mmrChange = Math.min(50, 25 + Math.floor((opponent.mmr - challenger.mmr) / 50));
        } else {
            // Opponent won
            mmrChange = Math.min(50, 25 + Math.floor((challenger.mmr - opponent.mmr) / 50));
        }

        mmrChange = Math.max(5, mmrChange); // Minimum 5 MMR change

        // Update MMR
        if (isChallengerWinner) {
            await this.prisma.viewerProfile.update({
                where: { id: challenger.id },
                data: { mmr: challenger.mmr + mmrChange }
            });
            await this.prisma.viewerProfile.update({
                where: { id: opponent.id },
                data: { mmr: Math.max(0, opponent.mmr - mmrChange) }
            });
        } else {
            await this.prisma.viewerProfile.update({
                where: { id: opponent.id },
                data: { mmr: opponent.mmr + mmrChange }
            });
            await this.prisma.viewerProfile.update({
                where: { id: challenger.id },
                data: { mmr: Math.max(0, challenger.mmr - mmrChange) }
            });
        }

        // Create battle record
        const battle = await this.prisma.battle.create({
            data: {
                tenantId,
                challengerId: challenger.id,
                opponentId: opponent.id,
                challengerRoll,
                opponentRoll,
                winnerId,
                mmrChange
            },
            include: {
                challenger: true,
                opponent: true,
                winner: true
            }
        });

        this.logger.log(`Battle: ${challengerUsername}(${challengerRoll}) vs ${opponentUsername}(${opponentRoll}) - Winner: ${battle.winner.username}`);

        return {
            battle,
            challengerRoll,
            opponentRoll,
            winner: battle.winner.username,
            mmrChange,
            challengerNewMMR: isChallengerWinner ? challenger.mmr + mmrChange : Math.max(0, challenger.mmr - mmrChange),
            opponentNewMMR: !isChallengerWinner ? opponent.mmr + mmrChange : Math.max(0, opponent.mmr - mmrChange)
        };
    }

    /**
     * Get battle history for a tenant
     */
    async getBattleHistory(tenantId: string, limit: number = 10) {
        return this.prisma.battle.findMany({
            where: { tenantId },
            include: {
                challenger: true,
                opponent: true,
                winner: true
            },
            orderBy: { createdAt: 'desc' },
            take: limit
        });
    }

    /**
     * Get MMR leaderboard
     */
    async getLeaderboard(tenantId: string, limit: number = 10) {
        return this.prisma.viewerProfile.findMany({
            where: { tenantId },
            orderBy: { mmr: 'desc' },
            take: limit,
            select: {
                username: true,
                mmr: true,
                battlesWon: {
                    select: { id: true }
                },
                battlesAsChallenger: {
                    select: { id: true }
                },
                battlesAsOpponent: {
                    select: { id: true }
                }
            }
        });
    }

    /**
     * Get player stats
     */
    async getPlayerStats(tenantId: string, username: string) {
        const profile = await this.prisma.viewerProfile.findFirst({
            where: {
                tenantId,
                username
            },
            include: {
                battlesWon: true,
                battlesAsChallenger: true,
                battlesAsOpponent: true
            }
        });

        if (!profile) {
            return null;
        }

        const totalBattles = profile.battlesAsChallenger.length + profile.battlesAsOpponent.length;
        const wins = profile.battlesWon.length;
        const losses = totalBattles - wins;
        const winRate = totalBattles > 0 ? (wins / totalBattles) * 100 : 0;

        return {
            username: profile.username,
            mmr: profile.mmr,
            totalBattles,
            wins,
            losses,
            winRate: winRate.toFixed(1)
        };
    }

    /**
     * Create a pending battle challenge
     */
    createChallenge(challenger: string, opponent: string, tenantId: string): boolean {
        const key = `${tenantId}:${opponent.toLowerCase()}`;

        // Check if opponent already has a pending challenge
        if (this.pendingChallenges.has(key)) {
            return false;
        }

        this.pendingChallenges.set(key, {
            challenger,
            opponent,
            tenantId,
            timestamp: Date.now()
        });

        this.logger.log(`Challenge created: ${challenger} -> ${opponent}`);
        return true;
    }

    /**
     * Accept a pending challenge and execute the battle
     */
    async acceptChallenge(username: string, tenantId: string) {
        const key = `${tenantId}:${username.toLowerCase()}`;
        const challenge = this.pendingChallenges.get(key);

        if (!challenge) {
            return null;
        }

        // Check if challenge has expired
        if (Date.now() - challenge.timestamp > this.CHALLENGE_TIMEOUT) {
            this.pendingChallenges.delete(key);
            return { expired: true };
        }

        // Remove challenge and execute battle
        this.pendingChallenges.delete(key);

        try {
            const result = await this.initiateBattle(challenge.challenger, challenge.opponent, tenantId);
            return { ...result, expired: false };
        } catch (error) {
            this.logger.error('Failed to execute battle:', error);
            throw error;
        }
    }

    /**
     * Decline a pending challenge
     */
    declineChallenge(username: string, tenantId: string): PendingChallenge | null {
        const key = `${tenantId}:${username.toLowerCase()}`;
        const challenge = this.pendingChallenges.get(key);

        if (!challenge) {
            return null;
        }

        this.pendingChallenges.delete(key);
        this.logger.log(`Challenge declined: ${challenge.challenger} -> ${challenge.opponent}`);
        return challenge;
    }

    /**
     * Clean up expired challenges
     */
    private cleanupExpiredChallenges() {
        const now = Date.now();
        const expiredKeys: string[] = [];

        for (const [key, challenge] of this.pendingChallenges.entries()) {
            if (now - challenge.timestamp > this.CHALLENGE_TIMEOUT) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            this.pendingChallenges.delete(key);
            this.logger.log(`Challenge expired: ${key}`);
        }
    }
}
