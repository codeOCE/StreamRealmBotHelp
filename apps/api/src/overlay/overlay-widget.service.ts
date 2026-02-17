import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class OverlayWidgetService {
    private readonly logger = new Logger(OverlayWidgetService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Add a widget to an overlay
     */
    async addWidget(overlayId: string, tenantId: string, data: {
        type: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        config?: any;
        styles?: any;
    }) {
        // Verify overlay ownership
        const overlay = await this.prisma.overlay.findFirst({
            where: { id: overlayId, tenantId },
        });

        if (!overlay) {
            throw new NotFoundException('Overlay not found');
        }

        // Get max z-index for this overlay
        const maxZIndex = await this.prisma.overlayWidget.aggregate({
            where: { overlayId },
            _max: { zIndex: true },
        });

        const widget = await this.prisma.overlayWidget.create({
            data: {
                overlayId,
                type: data.type,
                x: data.x || 0,
                y: data.y || 0,
                width: data.width || 300,
                height: data.height || 200,
                zIndex: (maxZIndex._max.zIndex || 0) + 1,
                config: data.config || {},
                styles: data.styles || {},
            },
        });

        this.logger.log(`Added ${data.type} widget to overlay ${overlayId}`);
        return widget;
    }

    /**
     * Update a widget
     */
    async updateWidget(widgetId: string, tenantId: string, data: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        zIndex?: number;
        config?: any;
        styles?: any;
    }) {
        // Verify ownership through overlay
        const widget = await this.prisma.overlayWidget.findUnique({
            where: { id: widgetId },
            include: { overlay: true },
        });

        if (!widget || widget.overlay.tenantId !== tenantId) {
            throw new NotFoundException('Widget not found');
        }

        const updated = await this.prisma.overlayWidget.update({
            where: { id: widgetId },
            data,
        });

        this.logger.log(`Updated widget ${widgetId}`);
        return updated;
    }

    /**
     * Delete a widget
     */
    async deleteWidget(widgetId: string, tenantId: string) {
        // Verify ownership through overlay
        const widget = await this.prisma.overlayWidget.findUnique({
            where: { id: widgetId },
            include: { overlay: true },
        });

        if (!widget || widget.overlay.tenantId !== tenantId) {
            throw new NotFoundException('Widget not found');
        }

        await this.prisma.overlayWidget.delete({
            where: { id: widgetId },
        });

        this.logger.log(`Deleted widget ${widgetId}`);
        return { success: true };
    }

    /**
     * Reorder widgets (update z-index)
     */
    async reorderWidgets(overlayId: string, tenantId: string, widgetOrder: string[]) {
        // Verify overlay ownership
        const overlay = await this.prisma.overlay.findFirst({
            where: { id: overlayId, tenantId },
        });

        if (!overlay) {
            throw new NotFoundException('Overlay not found');
        }

        // Update z-index for each widget
        const updates = widgetOrder.map((widgetId, index) =>
            this.prisma.overlayWidget.update({
                where: { id: widgetId },
                data: { zIndex: index },
            })
        );

        await this.prisma.$transaction(updates);

        this.logger.log(`Reordered widgets for overlay ${overlayId}`);
        return { success: true };
    }
}
