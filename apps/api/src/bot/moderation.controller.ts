import { Controller, Get, Patch, Body, Param, Query } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Controller('moderation')
export class ModerationController {
    constructor(private prisma: PrismaService) { }


    @Get()
    async getRules(@Query('tenantId') tenantId: string) {
        let finalTenantId = tenantId;
        if (!finalTenantId) {
            const tenant = await this.prisma.tenant.findFirst();
            finalTenantId = tenant?.id || 'default';
        }
        return this.prisma.modRule.findMany({
            where: {
                tenantId: finalTenantId
            },
        });
    }

    @Patch(':id')
    async updateRule(@Param('id') id: string, @Body() data: any) {
        return this.prisma.modRule.update({
            where: { id },
            data,
        });
    }
}
