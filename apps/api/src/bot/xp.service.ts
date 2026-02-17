import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class XpService {
    private readonly logger = new Logger(XpService.name);

    // XP Formula: Level * 100 * 1.2^Level
    // Example: Lvl 1->2 = 100xp, Lvl 10->11 = ~619xp
    private readonly XP_MULTIPLIER = 100;
    private readonly XP_EXPONENT = 1.2;

    constructor(
        private prisma: PrismaService,
    ) { }

    calculateXpForNextLevel(currentLevel: number): number {
        return Math.floor(currentLevel * this.XP_MULTIPLIER * Math.pow(this.XP_EXPONENT, currentLevel));
    }

    async addXp(tenantId: string, userId: string, amount: number) {
        // 1. Get current user profile
        const profile = await this.prisma.viewerProfile.findUnique({
            where: {
                tenantId_twitchUserId: {
                    tenantId,
                    twitchUserId: userId,
                }
            }
        });

        if (!profile) return null;

        // 2. Calculate new XP
        let newXp = profile.seasonXp + amount;
        let newTotalPoints = profile.points + amount; // 1 XP = 1 Point for now
        let currentLevel = profile.level;
        let skillPointsToAdd = 0;
        let leveledUp = false;

        // 3. Level Up Loop (in case of massive XP gain)
        while (newXp >= this.calculateXpForNextLevel(currentLevel)) {
            newXp -= this.calculateXpForNextLevel(currentLevel);
            currentLevel++;
            skillPointsToAdd++;
            leveledUp = true;
        }

        // 4. Update Database
        const updatedProfile = await this.prisma.viewerProfile.update({
            where: { id: profile.id },
            data: {
                seasonXp: newXp,
                level: currentLevel,
                points: newTotalPoints,
                skillPoints: { increment: skillPointsToAdd },
                lastActiveAt: new Date(),
            }
        });

        if (leveledUp) {
            this.logger.log(`User ${profile.username} leveled up to ${currentLevel}!`);
            // TODO: Emit event via Gateway
        }

        return {
            leveledUp,
            currentLevel,
            currentXp: newXp,
            nextLevelXp: this.calculateXpForNextLevel(currentLevel),
            skillPoints: updatedProfile.skillPoints
        };
    }

    async prestige(tenantId: string, userId: string) {
        const profile = await this.prisma.viewerProfile.findUnique({
            where: { tenantId_twitchUserId: { tenantId, twitchUserId: userId } }
        });

        if (!profile || profile.level < 50) { // Example requirement
            throw new Error('Not eligible for prestige');
        }

        return this.prisma.viewerProfile.update({
            where: { id: profile.id },
            data: {
                level: 1,
                seasonXp: 0,
                prestigeLevel: { increment: 1 },
                // Bonus: Keep skill points or some other perk
            }
        });
    }
}
