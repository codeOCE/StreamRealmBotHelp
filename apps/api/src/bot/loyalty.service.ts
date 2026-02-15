import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class LoyaltyService implements OnModuleInit {
    private readonly logger = new Logger(LoyaltyService.name);
    private interval: NodeJS.Timeout | null = null;

    constructor(private prisma: PrismaService) { }

    onModuleInit() {
        this.startLoyaltyLoop();
    }

    private startLoyaltyLoop() {
        // Run every minute to check for tenants that need awarding
        // In a real production app, we might use a robust scheduler or separate worker
        this.interval = setInterval(() => {
            this.processLoyaltyAwarding();
        }, 60000);
    }

    private async processLoyaltyAwarding() {
        const now = new Date();
        const activeTenants = await this.prisma.tenant.findMany({
            where: { isConnected: true }
        });

        for (const tenant of activeTenants) {
            const settings = (tenant.settings as any) || {};
            const loyalty = settings.loyalty || {
                enabled: true,
                pointsPerInterval: 10,
                intervalMinutes: 5,
                subMultiplier: 2
            };

            if (!loyalty.enabled) continue;

            // Check if it's time to award points (simple interval check based on current minute)
            if (now.getMinutes() % loyalty.intervalMinutes === 0) {
                await this.awardPoints(tenant.id, loyalty);
            }
        }
    }

    private async awardPoints(tenantId: string, loyalty: any) {
        try {
            // Find viewers active in the last X minutes
            const activeThreshold = new Date(Date.now() - loyalty.intervalMinutes * 60000);

            const activeViewers = await this.prisma.viewerProfile.findMany({
                where: {
                    tenantId,
                    lastActiveAt: { gte: activeThreshold }
                }
            });

            if (activeViewers.length === 0) return;

            this.logger.log(`Awarding points to ${activeViewers.length} viewers in tenant ${tenantId}`);

            for (const viewer of activeViewers) {
                // In a real app, we'd check if they are a subscriber for the multiplier
                // For now, we'll give standard points
                await this.prisma.viewerProfile.update({
                    where: { id: viewer.id },
                    data: {
                        points: { increment: loyalty.pointsPerInterval },
                        xp: { increment: Math.floor(loyalty.pointsPerInterval / 2) }
                    }
                });
            }
        } catch (err) {
            this.logger.error(`Failed to award points for tenant ${tenantId}`, err);
        }
    }

    async getPoints(tenantId: string, twitchUserId: string): Promise<number> {
        const profile = await this.prisma.viewerProfile.findUnique({
            where: { tenantId_twitchUserId: { tenantId, twitchUserId } }
        });
        return profile?.points || 0;
    }
}
