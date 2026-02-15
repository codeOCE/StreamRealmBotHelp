import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TwitchApiService {
    private readonly logger = new Logger(TwitchApiService.name);
    private accessToken: string | null = null;
    private expiresAt: number = 0;
    private botIdCache: Map<string, string> = new Map();

    constructor(private configService: ConfigService) { }

    private async getAppToken() {
        if (this.accessToken && Date.now() < this.expiresAt) {
            return this.accessToken;
        }

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
        const clientSecret = this.configService.get<string>('TWITCH_CLIENT_SECRET');

        try {
            const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error(`Failed to get app token: ${response.statusText}`);
            }

            const data = await response.json() as any;
            this.accessToken = data.access_token;
            this.expiresAt = Date.now() + (data.expires_in - 60) * 1000;
            return this.accessToken;
        } catch (err) {
            this.logger.error('Error fetching Twitch App Token', err);
            return null;
        }
    }

    async getStreamInfo(channelName: string) {
        const token = await this.getAppToken();
        if (!token) return null;

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
        const channel = channelName.replace('#', '');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/streams?user_login=${channel}`, {
                headers: {
                    'Client-ID': clientId!,
                    'Authorization': `Bearer ${token}`,
                },
            });

            const data = await response.json() as any;
            return data.data?.[0] || null;
        } catch (err) {
            this.logger.error(`Error fetching stream info for ${channel}`, err);
            return null;
        }
    }

    async getUserFollow(broadcasterId: string, userId: string) {
        const token = await this.getAppToken();
        if (!token) return null;

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&user_id=${userId}`, {
                headers: {
                    'Client-ID': clientId!,
                    'Authorization': `Bearer ${token}`,
                },
            });

            const data = await response.json() as any;
            return data.data?.[0] || null;
        } catch (err) {
            this.logger.error(`Error fetching follow info for user ${userId} in ${broadcasterId}`, err);
            return null;
        }
    }

    async getUserInfo(login: string) {
        if (this.botIdCache.has(login.toLowerCase())) {
            return { id: this.botIdCache.get(login.toLowerCase())!, login };
        }

        const token = await this.getAppToken();
        if (!token) return null;

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/users?login=${login}`, {
                headers: {
                    'Client-ID': clientId!,
                    'Authorization': `Bearer ${token}`,
                },
            });

            const data = await response.json() as any;
            const user = data.data?.[0];
            if (user) {
                this.botIdCache.set(login.toLowerCase(), user.id);
            }
            return user || null;
        } catch (err) {
            this.logger.error(`Error fetching user info for login ${login}`, err);
            return null;
        }
    }

    async getUserInfoById(userId: string) {
        const token = await this.getAppToken();
        if (!token) return null;

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/users?id=${userId}`, {
                headers: {
                    'Client-ID': clientId!,
                    'Authorization': `Bearer ${token}`,
                },
            });

            const data = await response.json() as any;
            return data.data?.[0] || null;
        } catch (err) {
            this.logger.error(`Error fetching user info for ID ${userId}`, err);
            return null;
        }
    }

    async getFollowerCount(broadcasterId: string) {
        const token = await this.getAppToken();
        if (!token) return 0;

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}`, {
                headers: {
                    'Client-ID': clientId!,
                    'Authorization': `Bearer ${token}`,
                },
            });

            const data = await response.json() as any;
            return data.total || 0;
        } catch (err) {
            this.logger.error(`Error fetching follower count for ${broadcasterId}`, err);
            return 0;
        }
    }

    async getViewerCount(channelName: string) {
        const stream = await this.getStreamInfo(channelName);
        return stream?.viewer_count || 0;
    }

    async getSubscriberCount(broadcasterId: string) {
        // Note: Helix subscribers endpoint requires user access token or app token with correct scopes.
        // For sub count, we usually need broadcaster's specific token.
        // For now, return 0 if we can't get it easily without a user token.
        // If we have an integration for this tenant, we should use that token.
        return 0;
    }

    async getChannelInfo(broadcasterId: string) {
        const token = await this.getAppToken();
        if (!token) return null;

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, {
                headers: {
                    'Client-ID': clientId!,
                    'Authorization': `Bearer ${token}`,
                },
            });

            const data = await response.json() as any;
            return data.data?.[0] || null;
        } catch (err) {
            this.logger.error(`Error fetching channel info for ${broadcasterId}`, err);
            return null;
        }
    }

    async sendChatMessage(broadcasterId: string, senderId: string, message: string, replyId?: string, accessToken?: string) {
        const token = accessToken || await this.getAppToken();
        if (!token) return { success: false, error: 'Token missing' };

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');

        try {
            this.logger.debug(`Helix: Sending message to ${broadcasterId} from ${senderId}: ${message}`);
            const response = await fetch('https://api.twitch.tv/helix/chat/messages', {
                method: 'POST',
                headers: {
                    'Client-ID': clientId!,
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    broadcaster_id: broadcasterId,
                    sender_id: senderId,
                    message: message.substring(0, 500),
                    reply_parent_message_id: replyId,
                }),
            });

            if (!response.ok) {
                const body = await response.text();
                this.logger.error(`Helix Send Error: ${response.status} ${response.statusText} - ${body}`);
                return { success: false, error: body };
            }

            return { success: true };
        } catch (err) {
            this.logger.error(`Helix Fetch Error`, err);
            return { success: false, error: err.message };
        }
    }
}
