import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import * as tmi from 'tmi.js';

@Injectable()
export class XPService {
    private readonly logger = new Logger(XPService.name);

    constructor(private prisma: PrismaService) { }

    async trackActivity(tenantId: string, twitchUserId: string, username: string) {
        const now = new Date();
        const profile = await this.prisma.viewerProfile.findUnique({
            where: { tenantId_twitchUserId: { tenantId, twitchUserId } }
        });

        if (!profile) {
            return this.prisma.viewerProfile.create({
                data: {
                    tenantId,
                    twitchUserId,
                    username,
                    xp: 10,
                    level: 1,
                    watchTime: 1, // Start with 1 min
                    lastActiveAt: now,
                }
            });
        }

        const minutesSinceLastActive = (now.getTime() - profile.lastActiveAt.getTime()) / (1000 * 60);

        // Only grant XP and watchTime every minute of activity
        if (minutesSinceLastActive >= 1) {
            const xpGain = 10;
            const newXp = profile.xp + xpGain;
            const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;
            const watchTimeGain = Math.floor(minutesSinceLastActive);

            return this.prisma.viewerProfile.update({
                where: { id: profile.id },
                data: {
                    username, // Update username if they changed it
                    xp: newXp,
                    level: newLevel,
                    watchTime: { increment: watchTimeGain },
                    lastActiveAt: now,
                }
            });
        }

        return profile;
    }

    async getTopUsers(tenantId: string, limit: number = 5) {
        return this.prisma.viewerProfile.findMany({
            where: { tenantId },
            orderBy: { xp: 'desc' },
            take: limit,
            select: {
                username: true,
                xp: true,
                level: true,
                watchTime: true
            }
        });
    }

    async getUserStats(tenantId: string, twitchUserId: string): Promise<{ xp: number; level: number; watchTime: number } | null> {
        try {
            const profile = await this.prisma.viewerProfile.findUnique({
                where: {
                    tenantId_twitchUserId: {
                        tenantId,
                        twitchUserId,
                    },
                },
            });

            if (!profile) return null;

            return {
                xp: profile.xp,
                level: profile.level,
                watchTime: profile.watchTime || 0
            };
        } catch (err) {
            this.logger.error('Failed to get user stats', err);
            return null;
        }
    }
}
