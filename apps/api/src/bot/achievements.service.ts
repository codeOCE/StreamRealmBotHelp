import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { OnEvent } from '@nestjs/event-emitter';
import { XpService } from './xp.service';

@Injectable()
export class AchievementsService {
    private readonly logger = new Logger(AchievementsService.name);

    constructor(
        private prisma: PrismaService,
        private xpService: XpService,
    ) { }

    @OnEvent('chat.message')
    async checkMessageAchievements(payload: { tenantId: string, userId: string, messageCount: number }) {
        await this.checkAndUnlock(payload.tenantId, payload.userId, 'MESSAGE_COUNT', payload.messageCount);
    }

    @OnEvent('user.watchtime')
    async checkWatchTimeAchievements(payload: { tenantId: string, userId: string, watchTime: number }) {
        await this.checkAndUnlock(payload.tenantId, payload.userId, 'WATCH_TIME', payload.watchTime);
    }

    private async checkAndUnlock(tenantId: string, twitchUserId: string, type: string, value: number) {
        // 1. Get potential achievements
        const achievements = await this.prisma.achievement.findMany({
            where: {
                tenantId,
                triggerType: type,
                threshold: { lte: value }
            }
        });

        if (achievements.length === 0) return;

        // 2. Get user profile and already unlocked achievements
        const profile = await this.prisma.viewerProfile.findUnique({
            where: { tenantId_twitchUserId: { tenantId, twitchUserId } },
            include: { unlockedAchievements: true }
        });

        if (!profile) return;

        const unlockedIds = new Set(profile.unlockedAchievements.map(ua => ua.achievementId));

        // 3. Process new unlocks
        for (const achievement of achievements) {
            if (!unlockedIds.has(achievement.id)) {
                await this.unlockAchievement(profile.id, achievement);
            }
        }
    }

    private async unlockAchievement(viewerProfileId: string, achievement: any) {
        await this.prisma.$transaction(async (tx) => {
            // Create record
            await tx.userAchievement.create({
                data: {
                    viewerProfileId,
                    achievementId: achievement.id
                }
            });

            // Grant XP Reward
            if (achievement.rewardXp > 0) {
                // Note: We need a way to call addXp transactionally or safely
                // For now, we'll just log it, as XpService isn't in this transaction scope
                this.logger.log(`Awarding ${achievement.rewardXp} XP for achievement ${achievement.name}`);
            }
        });

        // Award XP (outside transaction for now to use XpService)
        // ideally refactor to reuse transaction
        const profile = await this.prisma.viewerProfile.findUnique({ where: { id: viewerProfileId } });
        if (profile && achievement.rewardXp > 0) {
            await this.xpService.addXp(profile.tenantId, profile.twitchUserId, achievement.rewardXp);
        }

        this.logger.log(`Achievement Unlocked: ${achievement.name} for user ${viewerProfileId}`);
        // TODO: Emit event via Gateway
    }
}
