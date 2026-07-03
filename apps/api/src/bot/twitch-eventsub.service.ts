import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import axios from 'axios';
import { PrismaService } from '../common/prisma/prisma.service';
import { SecurityService } from '../common/security/security.service';
import { SongRequestService } from './song-request.service';
import { TwitchApiService } from './twitch-api.service';

@Injectable()
export class TwitchEventSubService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TwitchEventSubService.name);
    private ws: WebSocket | null = null;
    private sessionId: string | null = null;
    private keepaliveTimer: NodeJS.Timeout | null = null;

    constructor(
        private configService: ConfigService,
        private prisma: PrismaService,
        private security: SecurityService,
        private songRequestService: SongRequestService,
        private twitchApi: TwitchApiService,
    ) { }

    async onModuleInit() {
        this.connect();
    }

    onModuleDestroy() {
        this.close();
    }

    private connect() {
        this.logger.log('Connecting to Twitch EventSub WebSocket...');
        this.ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

        this.ws.on('open', () => {
            this.logger.log('EventSub WebSocket connected.');
        });

        this.ws.on('message', (data: string) => {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
        });

        this.ws.on('close', () => {
            this.logger.warn('EventSub WebSocket closed. Reconnecting in 5s...');
            setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('error', (err) => {
            this.logger.error('EventSub WebSocket error', err);
        });
    }

    private close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.keepaliveTimer) {
            clearInterval(this.keepaliveTimer);
        }
    }

    private async handleMessage(message: any) {
        const { metadata, payload } = message;

        switch (metadata.message_type) {
            case 'session_welcome':
                this.sessionId = payload.session.id;
                this.logger.log(`Session Welcome received. Session ID: ${this.sessionId}`);
                await this.subscribeToAllTenants();
                break;

            case 'session_keepalive':
                // Reset local watchdog if implemented
                break;

            case 'notification':
                this.handleNotification(payload);
                break;

            case 'session_reconnect':
                this.logger.log('Reconnect requested. New URL:', payload.session.reconnect_url);
                // TODO: Handle reconnect logic
                break;

            case 'revocation':
                this.logger.warn('Subscription revoked:', payload.subscription.type);
                break;
        }
    }

    private async subscribeToAllTenants() {
        const tenants = await this.prisma.tenant.findMany({
            where: { isConnected: true },
            include: { owner: true }
        });

        for (const tenant of tenants) {
            await this.subscribeToRedemptions(tenant);
        }
    }

    private async subscribeToRedemptions(tenant: any): Promise<void> {
        if (!this.sessionId) return;

        const clientId = this.configService.get('TWITCH_CLIENT_ID');

        // WebSocket EventSub for channel points REQUIRES a User Access Token.
        // We use the owner's token.
        let accessToken = '';
        if (tenant.owner?.encryptedAccessToken) {
            try {
                accessToken = this.security.decrypt(tenant.owner.encryptedAccessToken);
            } catch (e) {
                this.logger.error(`Failed to decrypt access token for ${tenant.name}`, e);
                return;
            }
        }

        if (!accessToken) {
            this.logger.error(`No access token available for tenant: ${tenant.name}`);
            return;
        }

        try {
            await axios.post(
                'https://api.twitch.tv/helix/eventsub/subscriptions',
                {
                    type: 'channel.channel_points_custom_reward_redemption.add',
                    version: '1',
                    condition: { broadcaster_user_id: tenant.twitchId },
                    transport: {
                        method: 'websocket',
                        session_id: this.sessionId,
                    },
                },
                {
                    headers: {
                        'Client-ID': clientId,
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                },
            );
            this.logger.log(`Subscribed to redemptions for tenant: ${tenant.name}`);
        } catch (err) {
            if (err.response?.status === 401 && tenant.owner?.encryptedRefreshToken) {
                this.logger.log(`Access token expired for ${tenant.name}, attempting refresh...`);
                const refreshToken = this.security.decrypt(tenant.owner.encryptedRefreshToken);
                const refreshed = await this.twitchApi.refreshUserToken(refreshToken);

                if (refreshed) {
                    this.logger.log(`Successfully refreshed token for ${tenant.name}. Updating DB and Retrying...`);
                    const encryptedAccess = this.security.encrypt(refreshed.accessToken);
                    const encryptedRefresh = refreshed.refreshToken ? this.security.encrypt(refreshed.refreshToken) : undefined;

                    await this.prisma.user.update({
                        where: { id: tenant.owner.id },
                        data: {
                            encryptedAccessToken: encryptedAccess,
                            encryptedRefreshToken: encryptedRefresh,
                            tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000)
                        }
                    });

                    // Retry subscription
                    return this.subscribeToRedemptions({ ...tenant, owner: { ...tenant.owner, encryptedAccessToken: encryptedAccess } });
                }
            }
            this.logger.error(`Failed to subscribe to redemptions for ${tenant.name}`, err.response?.data || err.message);
        }
    }

    private async getAppToken() {
        // We'll use a simplified version for this service
        const clientId = this.configService.get('TWITCH_CLIENT_ID');
        const clientSecret = this.configService.get('TWITCH_CLIENT_SECRET');

        try {
            const response = await axios.post(
                `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
            );
            return response.data.access_token;
        } catch (err) {
            this.logger.error('Failed to get app token for EventSub', err);
            return null;
        }
    }

    private handleNotification(payload: any) {
        const { subscription, event } = payload;

        if (subscription.type === 'channel.channel_points_custom_reward_redemption.add') {
            this.handleRedemption(event);
        }
    }

    private async handleRedemption(event: any) {
        const { broadcaster_user_id, user_id, user_name, reward, user_input } = event;

        // Check if the reward title matches "Song Request" (case-insensitive)
        if (reward.title.toLowerCase().includes('song request')) {
            this.logger.log(`Processing song request redemption from ${user_name} for broadcaster ${broadcaster_user_id}`);

            // Find the tenantId for this broadcaster_user_id
            const tenant = await this.prisma.tenant.findUnique({
                where: { twitchId: broadcaster_user_id },
            });

            if (tenant) {
                const query = user_input || '';
                if (query) {
                    const result = await this.songRequestService.requestSong(tenant.id, user_id, user_name, query);
                    this.logger.log(`Redemption result: ${result.message}`);
                }
            }
        }
    }
}
