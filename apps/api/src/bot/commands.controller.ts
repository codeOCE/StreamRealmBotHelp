import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { CommandsService } from './commands.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { ExternalBotService } from './external-bot.service';
import { AuthenticatedGuard } from '../auth/authenticated.guard';

@Controller('commands')
@UseGuards(AuthenticatedGuard)
export class CommandsController {
    constructor(
        private commandsService: CommandsService,
        private prisma: PrismaService,
        private externalBotService: ExternalBotService
    ) { }

    private async getTenantId(request: any): Promise<string> {
        const user = request.user;
        if (!user) {
            throw new UnauthorizedException('User not authenticated');
        }
        // Assuming user.tenants is populated or we fetch the tenant based on ownership
        // For simplicity in this iteration, we fetch the tenant owned by the user
        const tenant = await this.prisma.tenant.findFirst({
            where: { ownerId: user.id }
        });

        if (!tenant) {
            throw new UnauthorizedException('No tenant found for user');
        }
        return tenant.id;
    }

    @Get()
    async getCommands(@Req() req: any) {
        const tenantId = await this.getTenantId(req);
        return this.commandsService.findAll(tenantId);
    }

    @Post()
    async createCommand(@Req() req: any, @Body() data: any) {
        const tenantId = await this.getTenantId(req);
        return this.commandsService.create(tenantId, data);
    }

    @Patch(':id')
    async updateCommand(@Param('id') id: string, @Body() data: any) {
        // ideally verify ownership here too 
        return this.commandsService.update(id, data);
    }

    @Delete('bulk')
    async deleteBulk(@Req() req: any) {
        const tenantId = await this.getTenantId(req);
        return this.commandsService.deleteAll(tenantId);
    }

    @Delete(':id')
    async deleteCommand(@Param('id') id: string) {
        return this.commandsService.delete(id);
    }

    @Post('import')
    async importCommands(@Req() req: any, @Body() data: { commands: any[] }) {
        const tenantId = await this.getTenantId(req);
        return this.commandsService.importBulk(tenantId, data.commands);
    }

    @Post('import/external')
    async importExternal(@Req() req: any, @Body() data: { bot: 'nightbot' | 'se', token: string, channelId?: string }) {
        const tenantId = await this.getTenantId(req);

        let commands = [];
        if (data.bot === 'nightbot') {
            commands = await this.externalBotService.fetchNightbotCommands(data.token);
        } else if (data.bot === 'se') {
            if (!data.channelId) {
                throw new BadRequestException('channelId is required for se bot');
            }
            commands = await this.externalBotService.fetchSECommands(data.channelId, data.token);
        }

        return this.commandsService.importBulk(tenantId, commands);
    }

    @Post('import/integrated')
    async importIntegrated(@Req() req: any, @Body() data: { bot: 'nightbot' | 'se', seChannelId?: string }) {
        const tenantId = await this.getTenantId(req);

        const commands = await this.externalBotService.syncIntegrated(tenantId, data.bot, data.seChannelId);
        return this.commandsService.importBulk(tenantId, commands);
    }
}
