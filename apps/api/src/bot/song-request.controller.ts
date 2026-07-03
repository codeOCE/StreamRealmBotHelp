import { Controller, Get, Post, Query, Body, Param } from '@nestjs/common';
import { SongRequestService } from './song-request.service';

@Controller('song-requests')
export class SongRequestController {
    constructor(private songRequestService: SongRequestService) { }

    @Get(':tenantId/queue')
    async getQueue(@Param('tenantId') tenantId: string) {
        return this.songRequestService.getQueue(tenantId);
    }

    @Post(':tenantId/skip')
    async skip(@Param('tenantId') tenantId: string) {
        return { success: await this.songRequestService.skipSong(tenantId) };
    }
}
