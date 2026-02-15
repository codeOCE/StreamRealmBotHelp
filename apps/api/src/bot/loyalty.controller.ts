import { Controller, Get, Patch, Body, Param } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Controller('loyalty')
export class LoyaltyController {
    constructor(private prisma: PrismaService) { }

    @Get('leaderboard')
    async getLeaderboard() {
        const tenant = await this.prisma.tenant.findFirst();
        if (!tenant) return [];

        return this.prisma.viewerProfile.findMany({
            where: { tenantId: tenant.id },
            orderBy: [
                { xp: 'desc' },
                { points: 'desc' }
            ],
            take: 100
        });
    }

    @Get('settings')
    async getSettings() {
        const tenant = await this.prisma.tenant.findFirst();
        const settings = (tenant?.settings as any) || {};
        return settings.loyalty || {
            enabled: true,
            pointsPerInterval: 10,
            intervalMinutes: 5,
            subMultiplier: 2
        };
    }

    @Patch('settings')
    async updateSettings(@Body() loyalty: any) {
        const tenant = await this.prisma.tenant.findFirst();
        if (!tenant) return;

        const settings = (tenant.settings as any) || {};
        const updatedSettings = { ...settings, loyalty };

        return this.prisma.tenant.update({
            where: { id: tenant.id },
            data: { settings: updatedSettings }
        });
    }
}
