import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { BotEventsGateway } from './bot-events.gateway';

export interface AuditLogParams {
    tenantId: string;
    action: string;
    actor: string;
    target?: string;
    metadata?: any;
}

@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);

    constructor(
        private prisma: PrismaService,
        private eventsGateway: BotEventsGateway
    ) { }

    async log(params: AuditLogParams) {
        try {
            const entry = await this.prisma.auditLog.create({
                data: {
                    tenantId: params.tenantId,
                    action: params.action,
                    actor: params.actor,
                    target: params.target,
                    metadata: params.metadata || {},
                },
            });

            // Emit to real-time gateway for dashboard updates
            this.eventsGateway.server.to(`tenant:${params.tenantId}`).emit('auditLogEntry', entry);

            return entry;
        } catch (err) {
            this.logger.error('Failed to create audit log entry', err);
        }
    }

    async getRecentLogs(tenantId: string, limit: number = 50) {
        return this.prisma.auditLog.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }
}
