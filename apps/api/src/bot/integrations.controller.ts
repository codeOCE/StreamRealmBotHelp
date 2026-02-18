import { Controller, Get, Post, Delete, Body, Param, Query, Logger, Res, BadRequestException, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { IntegrationsService } from './integrations.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { BotManagerService } from './bot-manager.service';
import { VariableParserService } from './variable-parser.service';
import { SecurityService } from '../common/security/security.service';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import * as crypto from 'crypto';

@Controller('integrations')
@UseGuards(AuthenticatedGuard)
export class IntegrationsController {
    private readonly logger = new Logger(IntegrationsController.name);
    private readonly STATE_SECRET = process.env.STATE_SECRET || 'default-secret-change-in-production';
    private readonly STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

    constructor(
        private integrationsService: IntegrationsService,
        private prisma: PrismaService,
        private botManager: BotManagerService,
        private variableParser: VariableParserService,
        private security: SecurityService,
    ) { }

    private async getTenantId(request: any): Promise<string> {
        const user = request.user;
        if (!user) {
            throw new UnauthorizedException('User not authenticated');
        }

        const tenant = await this.prisma.tenant.findFirst({
            where: { ownerId: user.id }
        });

        if (!tenant) {
            throw new UnauthorizedException('No tenant found for user');
        }
        return tenant.id;
    }

    /**
     * Generate HMAC-signed state to prevent forgery
     */
    private createSignedState(tenantId: string): string {
        const timestamp = Date.now();
        const payload = JSON.stringify({ tenantId, ts: timestamp });
        const hmac = crypto.createHmac('sha256', this.STATE_SECRET);
        hmac.update(payload);
        const signature = hmac.digest('hex');

        // Return base64(payload + signature)
        const signedState = Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
        return signedState;
    }

    /**
     * Verify HMAC-signed state and extract tenantId
     */
    private verifySignedState(state: string): { tenantId: string } {
        try {
            const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
            const { payload, signature } = decoded;

            // Verify HMAC signature
            const hmac = crypto.createHmac('sha256', this.STATE_SECRET);
            hmac.update(payload);
            const expectedSignature = hmac.digest('hex');

            if (signature !== expectedSignature) {
                throw new UnauthorizedException('Invalid state signature');
            }

            // Parse payload and check expiry
            const { tenantId, ts } = JSON.parse(payload);
            const age = Date.now() - ts;

            if (age > this.STATE_EXPIRY_MS) {
                throw new UnauthorizedException('State expired');
            }

            return { tenantId };
        } catch (error) {
            this.logger.error('State verification failed:', error);
            throw new UnauthorizedException('Invalid or expired state');
        }
    }

    @Get()
    async getIntegrations(@Req() req: any) {
        const tenantId = await this.getTenantId(req);
        return this.integrationsService.getIntegrations(tenantId);
    }

    @Post('link/:provider')
    async linkIntegration(
        @Req() req: any,
        @Param('provider') provider: string,
        @Body() data: { accessToken: string, refreshToken?: string, expiresIn?: number, metadata?: any }
    ) {
        const tenantId = await this.getTenantId(req);
        return this.integrationsService.saveIntegration(tenantId, provider, data);
    }

    @Delete(':provider')
    async unlinkIntegration(
        @Req() req: any,
        @Param('provider') provider: string
    ) {
        const tenantId = await this.getTenantId(req);
        return this.integrationsService.unlinkIntegration(tenantId, provider);
    }

    @Get('authorize/:provider')
    async authorize(@Req() req: any, @Param('provider') provider: string, @Res() res: Response) {
        const tenantId = await this.getTenantId(req);

        const state = this.createSignedState(tenantId);

        const apiUrl = process.env.API_URL || 'http://localhost:3001';
        const redirectUri = `${apiUrl}/integrations/callback/${provider}`;

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
        // Verify signed state
        const { tenantId } = this.verifySignedState(state);

        const apiUrl = process.env.API_URL || 'http://localhost:3001';
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
        const redirectUri = `${apiUrl}/integrations/callback/${provider}`;

        try {
            await this.integrationsService.exchangeCodeForTokens(tenantId, provider, code, redirectUri);
            return res.redirect(`${frontendUrl}/dashboard/integrations?success=true`);
        } catch (err) {
            this.logger.error(`OAuth callback failed for ${provider}`, err);
            return res.redirect(`${frontendUrl}/dashboard/integrations?error=${encodeURIComponent(err.message)}`);
        }
    }

    // Bot Presence Management
    @Post('bot/join')
    async joinBot(@Req() req: any) {
        const tenantId = await this.getTenantId(req);

        const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) throw new Error('Tenant not found');

        // Mark tenant as connected (using global bot from .env)
        await this.prisma.tenant.update({
            where: { id: tenantId },
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
    async leaveBot(@Req() req: any) {
        const tenantId = await this.getTenantId(req);

        const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
        if (tenant) {
            // Tell the bot to leave before updating DB or just after
            const channel = tenant.targetChannel || tenant.name;
            if (channel) {
                await this.botManager.leaveChannel(channel);
            }
        }

        await this.prisma.tenant.update({
            where: { id: tenantId },
            data: { isConnected: false }
        });

        return { success: true, message: 'Sentinel presence deactivated.' };
    }

    @Post('bot/unlink')
    async unlinkBot(@Req() req: any) {
        const tenantId = await this.getTenantId(req);

        const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
        if (tenant) {
            const channel = tenant.targetChannel || tenant.name;
            if (channel) {
                await this.botManager.leaveChannel(channel);
            }
        }

        await this.prisma.tenant.update({
            where: { id: tenantId },
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
    async importFromNightbot(@Req() req: any) {
        try {
            const tenantId = await this.getTenantId(req);

            // Get Nightbot access token from tenant settings
            const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
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
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            return { error: 'Failed to import from Nightbot' };
        }
    }

    @Post('streamelements/connect')
    async connectStreamElements(@Req() req: any, @Body() data: { jwtToken: string }) {
        try {
            const tenantId = await this.getTenantId(req);

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

            const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
            const settings = (tenant?.settings as any) || {};
            settings.streamelements = {
                jwtToken: encryptedToken,
                channelId,
                connectedAt: new Date().toISOString(),
            };

            await this.prisma.tenant.update({
                where: { id: tenantId },
                data: { settings },
            });

            this.logger.log(`StreamElements connected for tenant ${tenantId}`);
            return { success: true, channelId };
        } catch (error) {
            this.logger.error('StreamElements connect error:', error);
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            return { error: 'Failed to connect StreamElements' };
        }
    }

    @Get('streamelements/import')
    async importFromStreamElements(@Req() req: any) {
        try {
            const tenantId = await this.getTenantId(req);

            // Get StreamElements JWT from tenant settings
            const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
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
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            return { error: 'Failed to import from StreamElements' };
        }
    }

    @Post('streamelements/disconnect')
    async disconnectStreamElements(@Req() req: any) {
        try {
            const tenantId = await this.getTenantId(req);

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
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            return { error: 'Failed to disconnect StreamElements' };
        }
    }
}
