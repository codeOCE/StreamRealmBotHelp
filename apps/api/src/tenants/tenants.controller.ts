import { Controller, Post, Body, Patch, Param, Get } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { Prisma } from '@stream-realm/database';

@Controller('tenants')
export class TenantsController {
    constructor(private readonly tenantsService: TenantsService) { }

    @Post()
    create(@Body() data: Prisma.TenantCreateInput) {
        return this.tenantsService.createTenant(data);
    }

    @Patch(':id/settings')
    updateSettings(@Param('id') id: string, @Body() settings: Prisma.InputJsonValue) {
        return this.tenantsService.updateTenant({
            where: { id },
            data: { settings },
        });
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.tenantsService.tenant({ id });
    }
}
