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
        rotation?: number;
        zIndex?: number;
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

        // Get max z-index for this overlay if not provided
        let zIndex = data.zIndex;
        if (zIndex === undefined) {
            const maxZIndex = await this.prisma.overlayWidget.aggregate({
                where: { overlayId },
                _max: { zIndex: true },
            });
            zIndex = (maxZIndex._max.zIndex || 0) + 1;
        }

        const widget = await this.prisma.overlayWidget.create({
            data: {
                overlayId,
                type: data.type,
                x: data.x || 0,
                y: data.y || 0,
                width: data.width || 300,
                height: data.height || 200,
                rotation: data.rotation || 0,
                zIndex: zIndex,
                config: JSON.stringify(data.config || {}),
                styles: JSON.stringify(data.styles || {}),
            } as any,
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
        rotation?: number;
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
            data: {
                ...data,
                config: data.config ? JSON.stringify(data.config) : undefined,
                styles: data.styles ? JSON.stringify(data.styles) : undefined,
            } as any,
        });

        this.logger.log(`Updated widget ${widgetId}`);
        return updated;
    }

    /**
     * Sync all widgets for an overlay (Bulk save)
     */
    async syncWidgets(overlayId: string, tenantId: string, widgets: any[]) {
        try {
            // 1. Verify overlay ownership
            const overlay = await this.prisma.overlay.findFirst({
                where: { id: overlayId, tenantId },
                include: { widgets: true }
            });

            if (!overlay) {
                throw new NotFoundException('Overlay not found');
            }

            this.logger.log(`Syncing ${widgets.length} widgets for overlay ${overlayId}`);

            // 2. Identify widgets to delete (in DB but not in new list)
            const incomingIds = widgets.map(w => w.id).filter(id => id && !id.includes('nanoid_')); // Filter out temp IDs
            const existingIds = overlay.widgets.map(w => w.id);
            const idsToDelete = existingIds.filter(id => !incomingIds.includes(id));

            // 3. Perform sync in a transaction
            return await this.prisma.$transaction(async (tx) => {
                // Delete removed widgets
                if (idsToDelete.length > 0) {
                    await tx.overlayWidget.deleteMany({
                        where: { id: { in: idsToDelete } }
                    });
                }

                // Upsert remaining widgets
                const results = [];
                for (const [index, w] of widgets.entries()) {
                    const widgetData: any = {
                        type: w.type,
                        x: Math.round(w.x || 0),
                        y: Math.round(w.y || 0),
                        width: Math.round(w.width || 300),
                        height: Math.round(w.height || 200),
                        rotation: Math.round(w.rotation || 0),
                        zIndex: w.zIndex ?? index,
                        config: JSON.stringify(w.config || {}),
                        styles: JSON.stringify(w.styles || {}),
                    };

                    if (w.id && !w.id.includes('nanoid_') && existingIds.includes(w.id)) {
                        // Update
                        const updated = await tx.overlayWidget.update({
                            where: { id: w.id },
                            data: widgetData
                        });
                        results.push(updated);
                    } else {
                        // Create
                        const created = await tx.overlayWidget.create({
                            data: {
                                ...widgetData,
                                overlayId
                            }
                        });
                        results.push(created);
                    }
                }
                return results;
            });
        } catch (error) {
            this.logger.error(`Sync widgets failed: ${error.message}`);
            throw error;
        }
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
