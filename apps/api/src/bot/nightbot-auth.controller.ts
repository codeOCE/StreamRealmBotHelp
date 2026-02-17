import { Controller, Get, Query, Req, Res, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SecurityService } from '../common/security/security.service';
import type { Response } from 'express';

@Controller('auth/nightbot')
export class NightbotAuthController {
    private readonly logger = new Logger(NightbotAuthController.name);

    constructor(
        private prisma: PrismaService,
        private security: SecurityService,
    ) { }

    @Get()
    async initiateOAuth(@Req() req: any, @Res() res: Response) {
        // Get the tenant ID from session or query
        const tenantId = req.query.tenantId;

        if (!tenantId) {
            return res.status(400).send('Missing tenant ID');
        }

        const clientId = process.env.NIGHTBOT_CLIENT_ID;
        const redirectUri = `${process.env.API_URL || 'http://localhost:3001'}/auth/nightbot/callback`;
        const scope = 'commands';

        // Store tenant ID in state for callback
        const state = Buffer.from(JSON.stringify({ tenantId })).toString('base64');

        const authUrl = `https://api.nightbot.tv/oauth2/authorize?` +
            `response_type=code&` +
            `client_id=${clientId}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `scope=${scope}&` +
            `state=${state}`;

        this.logger.log(`Redirecting to Nightbot OAuth: ${authUrl}`);
        res.redirect(authUrl);
    }

    @Get('callback')
    async handleCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
        try {
            if (!code) {
                return res.status(400).send('Missing authorization code');
            }

            // Decode state to get tenant ID
            const { tenantId } = JSON.parse(Buffer.from(state, 'base64').toString());

            // Exchange code for access token
            const clientId = process.env.NIGHTBOT_CLIENT_ID;
            const clientSecret = process.env.NIGHTBOT_CLIENT_SECRET;
            const redirectUri = `${process.env.API_URL || 'http://localhost:3001'}/auth/nightbot/callback`;

            const tokenResponse = await fetch('https://api.nightbot.tv/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: clientId!,
                    client_secret: clientSecret!,
                    grant_type: 'authorization_code',
                    redirect_uri: redirectUri,
                    code,
                }),
            });

            if (!tokenResponse.ok) {
                const error = await tokenResponse.text();
                this.logger.error('Nightbot token exchange failed:', error);
                return res.status(500).send('Failed to exchange authorization code');
            }

            const tokenData = await tokenResponse.json();
            const { access_token, refresh_token } = tokenData;

            // Encrypt and store tokens in tenant settings
            const encryptedAccessToken = this.security.encrypt(access_token);
            const encryptedRefreshToken = refresh_token ? this.security.encrypt(refresh_token) : null;

            // Update tenant settings
            const tenant = await this.prisma.tenant.findUnique({
                where: { id: tenantId },
            });

            const settings = (tenant?.settings as any) || {};
            settings.nightbot = {
                accessToken: encryptedAccessToken,
                refreshToken: encryptedRefreshToken,
                connectedAt: new Date().toISOString(),
            };

            await this.prisma.tenant.update({
                where: { id: tenantId },
                data: { settings },
            });

            this.logger.log(`Nightbot connected for tenant ${tenantId}`);

            // Redirect back to dashboard
            res.redirect('http://localhost:3000/dashboard/commands?nightbot=connected');
        } catch (error) {
            this.logger.error('Nightbot OAuth callback error:', error);
            res.status(500).send('OAuth callback failed');
        }
    }

    @Get('disconnect')
    async disconnect(@Query('tenantId') tenantId: string, @Res() res: Response) {
        try {
            const tenant = await this.prisma.tenant.findUnique({
                where: { id: tenantId },
            });

            const settings = (tenant?.settings as any) || {};
            delete settings.nightbot;

            await this.prisma.tenant.update({
                where: { id: tenantId },
                data: { settings },
            });

            this.logger.log(`Nightbot disconnected for tenant ${tenantId}`);
            res.json({ success: true });
        } catch (error) {
            this.logger.error('Nightbot disconnect error:', error);
            res.status(500).json({ error: 'Failed to disconnect' });
        }
    }
}
