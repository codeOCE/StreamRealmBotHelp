import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { nanoid } from 'nanoid';

@Injectable()
export class OverlayService {
    private readonly logger = new Logger(OverlayService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Create a new overlay for a tenant
     */
    async createOverlay(tenantId: string, data: {
        name: string;
        description?: string;
        width?: number;
        height?: number;
    }) {
        // Generate unique URL slug
        const urlSlug = nanoid(10);

        const overlay = await this.prisma.overlay.create({
            data: {
                tenantId,
                name: data.name,
                description: data.description,
                width: data.width || 1920,
                height: data.height || 1080,
                urlSlug,
                config: {},
            },
            include: {
                widgets: true,
            },
        });

        this.logger.log(`Created overlay ${overlay.id} for tenant ${tenantId}`);
        return overlay;
    }

    /**
     * Get all overlays for a tenant
     */
    async getOverlays(tenantId: string) {
        return this.prisma.overlay.findMany({
            where: { tenantId },
            include: {
                widgets: {
                    orderBy: { zIndex: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Get a single overlay by ID (tenant-scoped)
     */
    async getOverlay(id: string, tenantId: string) {
        const overlay = await this.prisma.overlay.findFirst({
            where: { id, tenantId },
            include: {
                widgets: {
                    orderBy: { zIndex: 'asc' },
                },
            },
        });

        if (!overlay) {
            throw new NotFoundException('Overlay not found');
        }

        return overlay;
    }

    /**
     * Get overlay by public URL slug (no auth required)
     */
    async getOverlayBySlug(urlSlug: string) {
        const overlay = await this.prisma.overlay.findUnique({
            where: { urlSlug },
            include: {
                widgets: {
                    orderBy: { zIndex: 'asc' },
                },
                tenant: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        if (!overlay) {
            throw new NotFoundException('Overlay not found');
        }

        if (!overlay.isPublic) {
            throw new BadRequestException('This overlay is not public');
        }

        return overlay;
    }

    /**
     * Update overlay settings
     */
    async updateOverlay(id: string, tenantId: string, data: {
        name?: string;
        description?: string;
        width?: number;
        height?: number;
        config?: any;
        isPublic?: boolean;
    }) {
        // Verify ownership
        await this.getOverlay(id, tenantId);

        const overlay = await this.prisma.overlay.update({
            where: { id },
            data,
            include: {
                widgets: {
                    orderBy: { zIndex: 'asc' },
                },
            },
        });

        this.logger.log(`Updated overlay ${id}`);
        return overlay;
    }

    /**
     * Delete an overlay
     */
    async deleteOverlay(id: string, tenantId: string) {
        // Verify ownership
        await this.getOverlay(id, tenantId);

        await this.prisma.overlay.delete({
            where: { id },
        });

        this.logger.log(`Deleted overlay ${id}`);
        return { success: true };
    }

    /**
     * Get browser source URL for an overlay
     */
    getBrowserSourceUrl(urlSlug: string): string {
        const baseUrl = process.env.WEB_URL || 'http://localhost:3000';
        return `${baseUrl}/overlay/${urlSlug}`;
    }
}
