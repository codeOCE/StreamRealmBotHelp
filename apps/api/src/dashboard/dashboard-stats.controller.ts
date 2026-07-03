import { Body, Controller, Get, Logger, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import { DashboardStatsService } from './dashboard-stats.service';

const EMPTY_STATS = {
    followers: 0,
    subscribers: null,
    viewers: 0,
    isLive: false,
    streamTitle: null,
    gameName: null,
    channelName: null,
};

@Controller('dashboard')
@UseGuards(AuthenticatedGuard)
export class DashboardStatsController {
    private readonly logger = new Logger(DashboardStatsController.name);

    constructor(private dashboardStats: DashboardStatsService) {}

    @Get('stats')
    async getStats(@Req() req: { user?: { id: string } }) {
        const userId = req.user?.id;
        if (!userId) return EMPTY_STATS;

        try {
            return await this.dashboardStats.getTwitchStats(userId);
        } catch (err) {
            this.logger.error('Failed to load dashboard stats', err);
            return EMPTY_STATS;
        }
    }

    @Patch('channel')
    async updateChannel(
        @Req() req: { user?: { id: string } },
        @Body() body: { title?: string; game?: string },
    ) {
        const userId = req.user?.id;
        if (!userId) return { success: false, error: 'Not authenticated' };

        try {
            return await this.dashboardStats.updateChannel(userId, body.title, body.game);
        } catch (err) {
            this.logger.error('Failed to update channel', err);
            return { success: false, error: 'Could not update stream' };
        }
    }
}
