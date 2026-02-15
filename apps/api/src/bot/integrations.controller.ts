import { Controller, Get, Post, Delete, Body, Param, Query, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IntegrationsService } from './integrations.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Controller('integrations')
export class IntegrationsController {
    private readonly logger = new Logger(IntegrationsController.name);

    constructor(
        private integrationsService: IntegrationsService,
        private prisma: PrismaService
    ) { }

    @Get()
    async getIntegrations(@Query('tenantId') tenantId: string) {
        let tid = tenantId;
        if (!tid) {
            const tenant = await this.prisma.tenant.findFirst();
            tid = tenant?.id || 'default';
        }
        return this.integrationsService.getIntegrations(tid);
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
}
