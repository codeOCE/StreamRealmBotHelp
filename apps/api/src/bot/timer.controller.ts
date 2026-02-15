import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Controller('timers')
export class TimerController {
    constructor(private prisma: PrismaService) { }

    @Get()
    async getAll() {
        // For now, returning first tenant's timers for demo
        const tenant = await this.prisma.tenant.findFirst();
        if (!tenant) return [];
        return this.prisma.timer.findMany({
            where: { tenantId: tenant.id },
            orderBy: { createdAt: 'desc' }
        });
    }

    @Post()
    async create(@Body() data: any) {
        const tenant = await this.prisma.tenant.findFirst();
        return this.prisma.timer.create({
            data: {
                ...data,
                tenantId: tenant!.id
            }
        });
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() data: any) {
        return this.prisma.timer.update({
            where: { id },
            data
        });
    }

    @Delete(':id')
    async delete(@Param('id') id: string) {
        return this.prisma.timer.delete({
            where: { id }
        });
    }
}
