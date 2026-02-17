import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Req,
    Logger,
} from '@nestjs/common';
import { OverlayService } from './overlay.service';
import { OverlayWidgetService } from './overlay-widget.service';
import { TwitchAuthGuard } from '../auth/twitch-auth.guard';

@Controller('overlays')
export class OverlayController {
    private readonly logger = new Logger(OverlayController.name);

    constructor(
        private overlayService: OverlayService,
        private widgetService: OverlayWidgetService,
    ) { }

    // ===== Overlay Management =====

    @Get()
    @UseGuards(TwitchAuthGuard)
    async getOverlays(@Query('tenantId') tenantId: string) {
        return this.overlayService.getOverlays(tenantId);
    }

    @Post()
    @UseGuards(TwitchAuthGuard)
    async createOverlay(
        @Query('tenantId') tenantId: string,
        @Body() data: {
            name: string;
            description?: string;
            width?: number;
            height?: number;
        }
    ) {
        return this.overlayService.createOverlay(tenantId, data);
    }

    @Get(':id')
    @UseGuards(TwitchAuthGuard)
    async getOverlay(
        @Param('id') id: string,
        @Query('tenantId') tenantId: string
    ) {
        return this.overlayService.getOverlay(id, tenantId);
    }

    @Patch(':id')
    @UseGuards(TwitchAuthGuard)
    async updateOverlay(
        @Param('id') id: string,
        @Query('tenantId') tenantId: string,
        @Body() data: {
            name?: string;
            description?: string;
            width?: number;
            height?: number;
            config?: any;
            isPublic?: boolean;
        }
    ) {
        return this.overlayService.updateOverlay(id, tenantId, data);
    }

    @Delete(':id')
    @UseGuards(TwitchAuthGuard)
    async deleteOverlay(
        @Param('id') id: string,
        @Query('tenantId') tenantId: string
    ) {
        return this.overlayService.deleteOverlay(id, tenantId);
    }

    @Get(':id/browser-source-url')
    @UseGuards(TwitchAuthGuard)
    async getBrowserSourceUrl(
        @Param('id') id: string,
        @Query('tenantId') tenantId: string
    ) {
        const overlay = await this.overlayService.getOverlay(id, tenantId);
        const url = this.overlayService.getBrowserSourceUrl(overlay.urlSlug);
        return { url };
    }

    // ===== Widget Management =====

    @Post(':id/widgets')
    @UseGuards(TwitchAuthGuard)
    async addWidget(
        @Param('id') overlayId: string,
        @Query('tenantId') tenantId: string,
        @Body() data: {
            type: string;
            x?: number;
            y?: number;
            width?: number;
            height?: number;
            config?: any;
            styles?: any;
        }
    ) {
        return this.widgetService.addWidget(overlayId, tenantId, data);
    }

    @Patch('widgets/:widgetId')
    @UseGuards(TwitchAuthGuard)
    async updateWidget(
        @Param('widgetId') widgetId: string,
        @Query('tenantId') tenantId: string,
        @Body() data: {
            x?: number;
            y?: number;
            width?: number;
            height?: number;
            zIndex?: number;
            config?: any;
            styles?: any;
        }
    ) {
        return this.widgetService.updateWidget(widgetId, tenantId, data);
    }

    @Delete('widgets/:widgetId')
    @UseGuards(TwitchAuthGuard)
    async deleteWidget(
        @Param('widgetId') widgetId: string,
        @Query('tenantId') tenantId: string
    ) {
        return this.widgetService.deleteWidget(widgetId, tenantId);
    }

    @Post(':id/widgets/reorder')
    @UseGuards(TwitchAuthGuard)
    async reorderWidgets(
        @Param('id') overlayId: string,
        @Query('tenantId') tenantId: string,
        @Body() data: { widgetOrder: string[] }
    ) {
        return this.widgetService.reorderWidgets(overlayId, tenantId, data.widgetOrder);
    }

    // ===== Public Browser Source Endpoint (No Auth) =====

    @Get('public/:urlSlug')
    async getPublicOverlay(@Param('urlSlug') urlSlug: string) {
        return this.overlayService.getOverlayBySlug(urlSlug);
    }
}
