import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
    constructor(private analyticsService: AnalyticsService) { }

    @Get('commands')
    async getCommandStats(@Query('tenantId') tenantId: string) {
        return this.analyticsService.getCommandStats(tenantId || 'default');
    }

    @Get('trends')
    async getActivityTrends(@Query('tenantId') tenantId: string) {
        return this.analyticsService.getActivityTrends(tenantId || 'default');
    }

    @Get('loyalty')
    async getLoyaltySummary(@Query('tenantId') tenantId: string) {
        return this.analyticsService.getLoyaltySummary(tenantId || 'default');
    }
}
