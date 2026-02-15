import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Controller('audit')
export class AuditController {
    constructor(
        private auditService: AuditService,
        private prisma: PrismaService
    ) { }

    @Get()
    async getLogs(@Query('tenantId') tenantId: string) {
        let finalTenantId = tenantId;
        if (!finalTenantId) {
            const tenant = await this.prisma.tenant.findFirst();
            finalTenantId = tenant?.id || 'default';
        }
        return this.auditService.getRecentLogs(finalTenantId);
    }
}
