import { Controller, Get, Post, Delete, Body, Param, Query, Logger, Res, BadRequestException, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { IntegrationsService } from './integrations.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { BotManagerService } from './bot-manager.service';
import { VariableParserService } from './variable-parser.service';
import { SecurityService } from '../common/security/security.service';
import { TwitchAuthGuard } from '../auth/twitch-auth.guard';

@Controller('integrations')
export class IntegrationsController {
    private readonly logger = new Logger(IntegrationsController.name);

    constructor(
        private integrationsService: IntegrationsService,
        private prisma: PrismaService,
        private botManager: BotManagerService,
        private variableParser: VariableParserService,
        private security: SecurityService,
    ) { }

    @Get()
    async getIntegrations(@Query('tenantId') tenantId: string) {
        if (!tenantId) {
            throw new BadRequestException('tenantId query parameter is required');
        }
        return this.integrationsService.getIntegrations(tenantId);
    }

    @Post('link/:provider')
    async linkIntegration(
        @Param('provider') provider: string,
        @Body() data: { tenantId: string, accessToken: string, refreshToken?: string, expiresIn?: number, metadata?: any }
    ) {
        let tid = data.tenantId;
        if (!tid) {
            const tenant = await this.prisma.tenant.findFirst();
            tid = tenant?.id || 'default';
        }
        return this.integrationsService.saveIntegration(tid, provider, data);
    }

    @Delete(':provider')
    @UseGuards(TwitchAuthGuard)
    async unlinkIntegration(
        @Param('provider') provider: string,
        @Query('tenantId') tenantId: string
    ) {
        let tid = tenantId;
        if (!tid) {
            const tenant = await this.prisma.tenant.findFirst();
            tid = tenant?.id || 'default';
        }
        return this.integrationsService.unlinkIntegration(tid, provider);
    }

    @Get('authorize/:provider')
    async authorize(@Param('provider') provider: string, @Query('tenantId') tenantId: string, @Res() res: Response) {
        let tid = tenantId;
        if (!tid || tid === 'default') {
            const tenant = await this.prisma.tenant.findFirst();
            tid = tenant?.id || 'default';
        }

        const state = tid;
        const redirectUri = `http://localhost:3001/integrations/callback/${provider}`;
        const url = this.integrationsService.getAuthorizeUrl(provider, redirectUri, state);

        this.logger.log(`Redirecting to ${provider} OAuth: ${url}`);
        return res.redirect(url);
    }

    @Get('callback/:provider')
    async callback(
        @Param('provider') provider: string,
        @Query('code') code: string,
        @Query('state') state: string,
        @Res() res: Response
    ) {
        let tenantId = state;
        if (!tenantId || tenantId === 'default') {
            const tenant = await this.prisma.tenant.findFirst();
            tenantId = tenant?.id || 'default';
        }

        const redirectUri = `http://localhost:3001/integrations/callback/${provider}`;

        try {
            await this.integrationsService.exchangeCodeForTokens(tenantId, provider, code, redirectUri);
            return res.redirect('http://localhost:3002/dashboard/integrations?success=true');
        } catch (err) {
            this.logger.error(`OAuth callback failed for ${provider}`, err);
            return res.redirect(`http://localhost:3002/dashboard/integrations?error=${encodeURIComponent(err.message)}`);
        }
    }

    // Bot Presence Management
    @Post('bot/join')
    @UseGuards(TwitchAuthGuard)
    async joinBot(@Body() data: { tenantId: string }) {
        if (!data.tenantId) {
            throw new BadRequestException('tenantId is required in request body');
        }

        const tenant = await this.prisma.tenant.findUnique({ where: { id: data.tenantId } });
        if (!tenant) throw new Error('Tenant not found');

        // Mark tenant as connected (using global bot from .env)
        await this.prisma.tenant.update({
            where: { id: data.tenantId },
            data: { isConnected: true }
        });

        // Trigger bot manager to join the channel
        const channel = tenant.targetChannel || tenant.name;
        if (channel) {
            await this.botManager.joinChannel(channel);
        }

        return { success: true, message: 'Sentinel presence activated using global credentials.' };
    }

    @Post('bot/leave')
    @UseGuards(TwitchAuthGuard)
    async leaveBot(@Body() data: { tenantId: string }) {
        let tid = data.tenantId;
        if (!tid) {
            const tenant = await this.prisma.tenant.findFirst();
            tid = tenant?.id || 'default';
        }

        const tenant = await this.prisma.tenant.findUnique({ where: { id: tid } });
        if (tenant) {
            // Tell the bot to leave before updating DB or just after
            const channel = tenant.targetChannel || tenant.name;
            if (channel) {
                await this.botManager.leaveChannel(channel);
            }
        }

        await this.prisma.tenant.update({
            where: { id: tid },
            data: { isConnected: false }
        });

        return { success: true, message: 'Sentinel presence deactivated.' };
    }

    @Post('bot/unlink')
    async unlinkBot(@Body() data: { tenantId: string }) {
        let tid = data.tenantId;
        if (!tid) {
            const tenant = await this.prisma.tenant.findFirst();
            tid = tenant?.id || 'default';
        }

        const tenant = await this.prisma.tenant.findUnique({ where: { id: tid } });
        if (tenant) {
            const channel = tenant.targetChannel || tenant.name;
            if (channel) {
                await this.botManager.leaveChannel(channel);
            }
        }

        await this.prisma.tenant.update({
            where: { id: tid },
            data: {
                isConnected: false,
                encryptedBotAccessToken: null,
                encryptedBotRefreshToken: null,
                botUsername: null,
                targetChannel: null
            }
        });

        return { success: true, message: 'Protocol unlinked. Commands preserved.' };
    }

    @Get('nightbot/import')
    async importFromNightbot(@Query('tenantId') tenantId: string) {
        try {
            let tid = tenantId;
            if (!tid) {
                const tenant = await this.prisma.tenant.findFirst();
                tid = tenant?.id || 'default';
            }

            // Get Nightbot access token from tenant settings
            const tenant = await this.prisma.tenant.findUnique({ where: { id: tid } });
            const settings = (tenant?.settings as any) || {};

            if (!settings.nightbot?.accessToken) {
                return { error: 'Nightbot not connected. Please connect first.' };
            }

            const accessToken = this.security.decrypt(settings.nightbot.accessToken);

            // Fetch commands from Nightbot API
            const response = await fetch('https://api.nightbot.tv/1/commands', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            });

            if (!response.ok) {
                throw new Error(`Nightbot API error: ${response.statusText}`);
            }

            const data = await response.json();
            const nightbotCommands = data.commands || [];

            // Convert commands to our format
            const convertedCommands = nightbotCommands.map((cmd: any) => ({
                trigger: cmd.name,
                responses: [this.variableParser.parseNightbotVariables(cmd.message)],
                responseType: 'SAY',
                userLevel: cmd.userLevel === 'everyone' ? 'viewer' : cmd.userLevel,
                enabled: cmd.enabled,
                cooldown: cmd.coolDown || 0,
                description: `Imported from Nightbot`,
                isBuiltIn: false,
                originalResponse: cmd.message, // Keep original for reference
                conversions: this.variableParser.getConversionSummary(cmd.message, 'nightbot'),
            }));

            this.logger.log(`Imported ${convertedCommands.length} commands from Nightbot`);
            return { commands: convertedCommands };
        } catch (error) {
            this.logger.error('Nightbot import error:', error);
            return { error: 'Failed to import from Nightbot' };
        }
    }

    @Post('streamelements/connect')
    async connectStreamElements(@Body() data: { tenantId: string, jwtToken: string }) {
        try {
            let tid = data.tenantId;
            if (!tid) {
                const tenant = await this.prisma.tenant.findFirst();
                tid = tenant?.id || 'default';
            }

            // Verify JWT token by making a test request
            const response = await fetch('https://api.streamelements.com/kappa/v2/channels/me', {
                headers: {
                    'Authorization': `Bearer ${data.jwtToken}`,
                },
            });

            if (!response.ok) {
                return { error: 'Invalid StreamElements JWT token' };
            }

            const channelData = await response.json();
            const channelId = channelData._id;

            // Encrypt and store JWT
            const encryptedToken = this.security.encrypt(data.jwtToken);

            const tenant = await this.prisma.tenant.findUnique({ where: { id: tid } });
            const settings = (tenant?.settings as any) || {};
            settings.streamelements = {
                jwtToken: encryptedToken,
                channelId,
                connectedAt: new Date().toISOString(),
            };

            await this.prisma.tenant.update({
                where: { id: tid },
                data: { settings },
            });

            this.logger.log(`StreamElements connected for tenant ${tid}`);
            return { success: true, channelId };
        } catch (error) {
            this.logger.error('StreamElements connect error:', error);
            return { error: 'Failed to connect StreamElements' };
        }
    }

    @Get('streamelements/import')
    async importFromStreamElements(@Query('tenantId') tenantId: string) {
        try {
            let tid = tenantId;
            if (!tid) {
                const tenant = await this.prisma.tenant.findFirst();
                tid = tenant?.id || 'default';
            }

            // Get StreamElements JWT from tenant settings
            const tenant = await this.prisma.tenant.findUnique({ where: { id: tid } });
            const settings = (tenant?.settings as any) || {};

            if (!settings.streamelements?.jwtToken) {
                return { error: 'StreamElements not connected. Please connect first.' };
            }

            const jwtToken = this.security.decrypt(settings.streamelements.jwtToken);
            const channelId = settings.streamelements.channelId;

            // Fetch commands from StreamElements API
            const response = await fetch(`https://api.streamelements.com/kappa/v2/bot/commands/${channelId}`, {
                headers: {
                    'Authorization': `Bearer ${jwtToken}`,
                },
            });

            if (!response.ok) {
                throw new Error(`StreamElements API error: ${response.statusText}`);
            }

            const seCommands = await response.json();

            // Convert commands to our format
            const convertedCommands = Object.values(seCommands).map((cmd: any) => ({
                trigger: cmd.command,
                responses: [this.variableParser.parseStreamElementsVariables(cmd.reply)],
                responseType: 'SAY',
                userLevel: cmd.accessLevel === 100 ? 'viewer' : cmd.accessLevel >= 500 ? 'moderator' : 'viewer',
                enabled: cmd.enabled,
                cooldown: cmd.cooldown?.user || 0,
                description: `Imported from StreamElements`,
                isBuiltIn: false,
                originalResponse: cmd.reply, // Keep original for reference
                conversions: this.variableParser.getConversionSummary(cmd.reply, 'streamelements'),
            }));

            this.logger.log(`Imported ${convertedCommands.length} commands from StreamElements`);
            return { commands: convertedCommands };
        } catch (error) {
            this.logger.error('StreamElements import error:', error);
            return { error: 'Failed to import from StreamElements' };
        }
    }

    @Post('streamelements/disconnect')
    async disconnectStreamElements(@Query('tenantId') tenantId: string) {
        try {
            const tenant = await this.prisma.tenant.findUnique({
                where: { id: tenantId },
            });

            if (!tenant) {
                return { error: 'Tenant not found' };
            }

            // Parse settings and remove StreamElements data
            const settings = (tenant.settings as any) || {};
            if (settings.streamelements) {
                delete settings.streamelements;
            }

            // Update tenant with cleared settings
            await this.prisma.tenant.update({
                where: { id: tenantId },
                data: { settings },
            });

            return { success: true, message: 'StreamElements disconnected' };
        } catch (error) {
            this.logger.error('StreamElements disconnect error:', error);
            return { error: 'Failed to disconnect StreamElements' };
        }
    }
}
