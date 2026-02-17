import { Controller, Get, Post, Patch, Delete, Body, Param, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { TimerService } from './timer.service';

@Controller('timers')
export class TimerController {
    private readonly logger = new Logger(TimerController.name);

    constructor(
        private prisma: PrismaService,
        private timerService: TimerService
    ) { }

    @Get()
    async getAll() {
        // For now, returning first tenant's timers for demo
        const tenant = await this.prisma.tenant.findFirst();
        if (!tenant) return [];
        return (this.prisma as any).timer.findMany({
            where: { tenantId: tenant.id },
            orderBy: { createdAt: 'desc' }
        });
    }

    @Post()
    async create(@Body() data: any) {
        const tenant = await this.prisma.tenant.findFirst();
        if (!tenant) throw new Error("No tenant found");

        const timer = await (this.prisma as any).timer.create({
            data: {
                tenantId: tenant.id,
                name: data.name,
                message: data.message,
                intervalSeconds: Number(data.intervalSeconds) || 300,
                chatLines: Number(data.chatLines) || 0,
                enabled: data.enabled ?? true
            }
        });

        await this.timerService.reloadTimers(tenant.id);
        return timer;
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() data: any) {
        const timer = await (this.prisma as any).timer.update({
            where: { id },
            data: {
                name: data.name,
                message: data.message,
                intervalSeconds: data.intervalSeconds ? Number(data.intervalSeconds) : undefined,
                chatLines: data.chatLines ? Number(data.chatLines) : undefined,
                enabled: data.enabled
            }
        });

        await this.timerService.reloadTimers(timer.tenantId);
        return timer;
    }

    @Delete(':id')
    async delete(@Param('id') id: string) {
        const timer = await (this.prisma as any).timer.delete({
            where: { id }
        });

        await this.timerService.reloadTimers(timer.tenantId);
        return timer;
    }
}
