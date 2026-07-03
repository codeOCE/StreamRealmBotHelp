import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SecurityService } from '../common/security/security.service';

@Injectable()
export class IntegrationsService {
    private readonly logger = new Logger(IntegrationsService.name);

    constructor(
        private prisma: PrismaService,
        private security: SecurityService
    ) { }

    private getProviderConfig(provider: string) {
        if (provider === 'nightbot') {
            const clientId = process.env.NIGHTBOT_CLIENT_ID;
            const clientSecret = process.env.NIGHTBOT_CLIENT_SECRET;

            if (!clientId || !clientSecret) {
                this.logger.error('NIGHTBOT_CLIENT_ID or NIGHTBOT_CLIENT_SECRET is missing from environment');
                throw new Error('Nightbot integration is not configured on the server.');
            }

            return {
                authUrl: 'https://api.nightbot.tv/oauth2/authorize',
                tokenUrl: 'https://api.nightbot.tv/oauth2/token',
                clientId,
                clientSecret,
                scope: 'commands timers'
            };
        }
        return null;
    }

    async getIntegrations(tenantId: string) {
        const integrations = await this.prisma.integration.findMany({
            where: { tenantId },
            select: {
                provider: true,
                createdAt: true,
                updatedAt: true,
                metadata: true
            }
        });
        return integrations;
    }

    async saveIntegration(tenantId: string, provider: string, data: {
        accessToken: string,
        refreshToken?: string,
        expiresIn?: number,
        externalUserId?: string,
        metadata?: any
    }) {
        const encryptedAccessToken = this.security.encrypt(data.accessToken);
        const encryptedRefreshToken = data.refreshToken ? this.security.encrypt(data.refreshToken) : null;

        let tokenExpiresAt = null;
        if (data.expiresIn) {
            tokenExpiresAt = new Date();
            tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + data.expiresIn);
        }

        return this.prisma.integration.upsert({
            where: {
                tenantId_provider: {
                    tenantId,
                    provider
                }
            },
            update: {
                encryptedAccessToken,
                encryptedRefreshToken,
                tokenExpiresAt,
                externalUserId: data.externalUserId,
                metadata: data.metadata || {}
            },
            create: {
                tenantId,
                provider,
                encryptedAccessToken,
                encryptedRefreshToken,
                tokenExpiresAt,
                externalUserId: data.externalUserId,
                metadata: data.metadata || {}
            }
        });
    }

    async unlinkIntegration(tenantId: string, provider: string) {
        return this.prisma.integration.delete({
            where: {
                tenantId_provider: {
                    tenantId,
                    provider
                }
            }
        });
    }

    async getAccessToken(tenantId: string, provider: string): Promise<string | null> {
        const integration = await this.prisma.integration.findUnique({
            where: {
                tenantId_provider: {
                    tenantId,
                    provider
                }
            }
        });

        if (!integration) return null;

        // Check if token is expired
        if (integration.tokenExpiresAt && new Date() > integration.tokenExpiresAt) {
            if (integration.encryptedRefreshToken) {
                return this.refreshToken(tenantId, provider);
            }
            return null;
        }

        return this.security.decrypt(integration.encryptedAccessToken);
    }

    async exchangeCodeForTokens(tenantId: string, provider: string, code: string, redirectUri: string) {
        const config = this.getProviderConfig(provider);
        if (!config) throw new Error(`Provider ${provider} not supported for OAuth`);

        const params = new URLSearchParams();
        params.append('client_id', config.clientId!);
        params.append('client_secret', config.clientSecret!);
        params.append('code', code);
        params.append('grant_type', 'authorization_code');
        params.append('redirect_uri', redirectUri);

        const res = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error_description || data.error);

        return this.saveIntegration(tenantId, provider, {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            metadata: { scope: data.scope }
        });
    }

    async refreshToken(tenantId: string, provider: string): Promise<string> {
        const integration = await this.prisma.integration.findUnique({
            where: { tenantId_provider: { tenantId, provider } }
        });

        if (!integration || !integration.encryptedRefreshToken) {
            throw new Error(`Cannot refresh token for ${provider}: No refresh token found`);
        }

        const config = this.getProviderConfig(provider);
        if (!config) throw new Error(`Provider ${provider} not supported for OAuth`);
        const refreshToken = this.security.decrypt(integration.encryptedRefreshToken);

        const params = new URLSearchParams();
        params.append('client_id', config.clientId!);
        params.append('client_secret', config.clientSecret!);
        params.append('refresh_token', refreshToken);
        params.append('grant_type', 'refresh_token');

        const res = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error_description || data.error);

        await this.saveIntegration(tenantId, provider, {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            metadata: { ...((integration.metadata as any) || {}), refreshedAt: new Date() }
        });

        return data.access_token;
    }

    getAuthorizeUrl(provider: string, redirectUri: string, state: string) {
        const config = this.getProviderConfig(provider);
        if (!config) throw new Error(`Provider ${provider} not supported for OAuth`);

        const url = new URL(config.authUrl);
        url.searchParams.append('client_id', config.clientId!);
        url.searchParams.append('redirect_uri', redirectUri);
        url.searchParams.append('response_type', 'code');
        url.searchParams.append('scope', config.scope);
        url.searchParams.append('state', state);

        return url.toString();
    }
}
