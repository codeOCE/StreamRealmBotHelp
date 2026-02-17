import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { CommandsService } from './commands.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { ExternalBotService } from './external-bot.service';

@Controller('commands')
export class CommandsController {
    constructor(
        private commandsService: CommandsService,
        private prisma: PrismaService,
        private externalBotService: ExternalBotService
    ) { }

    // NOTE: In production, tenantId would be extracted from the JWT/Session

    @Get()
    async getCommands(@Query('tenantId') tenantId: string) {
        let finalTenantId = tenantId;
        if (!finalTenantId) {
            const tenant = await this.prisma.tenant.findFirst();
            finalTenantId = tenant?.id || 'default';
        }
        return this.commandsService.findAll(finalTenantId);
    }

    @Post()
    async createCommand(@Body() data: any) {
        let tenantId = data.tenantId;
        if (!tenantId) {
            const tenant = await this.prisma.tenant.findFirst();
            tenantId = tenant?.id || 'default';
        }
        return this.commandsService.create(tenantId, data);
    }

    @Patch(':id')
    async updateCommand(@Param('id') id: string, @Body() data: any) {
        return this.commandsService.update(id, data);
    }

    @Delete('bulk')
    async deleteBulk(@Query('tenantId') tenantId: string) {
        let finalTenantId = tenantId;
        if (!finalTenantId) {
            const tenant = await this.prisma.tenant.findFirst();
            finalTenantId = tenant?.id || 'default';
        }
        return this.commandsService.deleteAll(finalTenantId);
    }

    @Delete(':id')
    async deleteCommand(@Param('id') id: string) {
        return this.commandsService.delete(id);
    }

    @Post('import')
    async importCommands(@Body() data: { tenantId: string, commands: any[] }) {
        let tenantId = data.tenantId;
        if (!tenantId) {
            const tenant = await this.prisma.tenant.findFirst();
            tenantId = tenant?.id || 'default';
        }
        return this.commandsService.importBulk(tenantId, data.commands);
    }

    @Post('import/external')
    async importExternal(@Body() data: { tenantId: string, bot: 'nightbot' | 'se', token: string, channelId?: string }) {
        let tenantId = data.tenantId;
        if (!tenantId) {
            const tenant = await this.prisma.tenant.findFirst();
            tenantId = tenant?.id || 'default';
        }

        let commands = [];
        if (data.bot === 'nightbot') {
            commands = await this.externalBotService.fetchNightbotCommands(data.token);
        } else if (data.bot === 'se') {
            commands = await this.externalBotService.fetchSECommands(data.channelId!, data.token);
        }

        return this.commandsService.importBulk(tenantId, commands);
    }

    @Post('import/integrated')
    async importIntegrated(@Body() data: { tenantId: string, bot: 'nightbot' | 'se', seChannelId?: string }) {
        let tenantId = data.tenantId;
        if (!tenantId) {
            const tenant = await this.prisma.tenant.findFirst();
            tenantId = tenant?.id || 'default';
        }

        const commands = await this.externalBotService.syncIntegrated(tenantId, data.bot, data.seChannelId);
        return this.commandsService.importBulk(tenantId, commands);
    }
}
