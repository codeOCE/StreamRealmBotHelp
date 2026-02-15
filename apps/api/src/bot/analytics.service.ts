import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
    private readonly logger = new Logger(AnalyticsService.name);

    constructor(private prisma: PrismaService) { }

    async getCommandStats(tenantId: string) {
        return this.prisma.command.findMany({
            where: { tenantId },
            select: {
                trigger: true,
                usages: true,
                enabled: true
            },
            orderBy: { usages: 'desc' },
            take: 10
        });
    }

    async getActivityTrends(tenantId: string) {
        // Aggregate chat logs by hour for the last 24 hours
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const logs = await this.prisma.chatLog.findMany({
            where: {
                tenantId,
                timestamp: { gte: last24h }
            },
            select: { timestamp: true }
        });

        const hourlyData = Array(24).fill(0).map((_, i) => ({
            hour: i,
            count: 0
        }));

        logs.forEach(log => {
            const hour = new Date(log.timestamp).getHours();
            hourlyData[hour].count++;
        });

        return hourlyData;
    }

    async getLoyaltySummary(tenantId: string) {
        const totalXP = await this.prisma.viewerProfile.aggregate({
            where: { tenantId },
            _sum: { xp: true },
            _count: { id: true }
        });

        const topViewers = await this.prisma.viewerProfile.findMany({
            where: { tenantId },
            orderBy: { xp: 'desc' },
            take: 5,
            select: { username: true, xp: true, level: true }
        });

        return {
            totalUsers: totalXP._count.id,
            sumXP: totalXP._sum.xp || 0,
            topViewers
        };
    }
}
