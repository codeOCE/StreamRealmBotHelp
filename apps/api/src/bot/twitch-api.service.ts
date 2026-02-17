import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TwitchApiService {
    private readonly logger = new Logger(TwitchApiService.name);
    private accessToken: string | null = null;
    private expiresAt: number = 0;
    private botIdCache: Map<string, string> = new Map();

    constructor(private configService: ConfigService) { }

    async refreshUserToken(refreshToken: string) {
        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
        const clientSecret = this.configService.get<string>('TWITCH_CLIENT_SECRET');

        try {
            const response = await fetch('https://id.twitch.tv/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId!,
                    client_secret: clientSecret!,
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken
                })
            });

            if (!response.ok) {
                const body = await response.text();
                this.logger.error(`Failed to refresh user token: ${response.status} - ${body}`);
                return null;
            }

            const data = await response.json() as any;
            return {
                accessToken: data.access_token,
                refreshToken: data.refresh_token, // Twitch may return a new refresh token
                expiresIn: data.expires_in
            };
        } catch (err) {
            this.logger.error('Error refreshing Twitch User Token', err);
            return null;
        }
    }

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

    async getLatestFollower(broadcasterId: string) {
        const token = await this.getAppToken();
        if (!token) return null;

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');

        try {
            // "The list of followers is returned sorted by when they started following the broadcaster, with the most recent followers first."
            const response = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&first=1`, {
                headers: {
                    'Client-ID': clientId!,
                    'Authorization': `Bearer ${token}`,
                },
            });

            const data = await response.json() as any;
            return data.data?.[0]?.user_name || 'No followers';
        } catch (err) {
            this.logger.error(`Error fetching latest follower for ${broadcasterId}`, err);
            return 'Unknown';
        }
    }

    async getSubscriberCount(broadcasterId: string, accessToken?: string) {
        if (!accessToken) return 0; // Requires user token with channel:read:subscriptions

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/subscriptions?broadcaster_id=${broadcasterId}&first=1`, {
                headers: {
                    'Client-ID': clientId!,
                    'Authorization': `Bearer ${accessToken}`,
                },
            });

            if (response.status === 401 || response.status === 403) return -1; // Auth failed

            const data = await response.json() as any;
            return data.total || 0;
        } catch (err) {
            this.logger.error(`Error fetching sub count for ${broadcasterId}`, err);
            return 0;
        }
    }

    async updateChannelInfo(broadcasterId: string, title?: string, game?: string, accessToken?: string) {
        if (!accessToken) return { success: false, error: 'Missing access token' };

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
        const body: any = {};
        if (title) body.title = title;
        if (game) body.game_id = await this.getGameId(game, accessToken) || undefined; // Need to resolve game name to ID

        if (Object.keys(body).length === 0) return { success: false, error: 'No updates provided' };

        try {
            const response = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, {
                method: 'PATCH',
                headers: {
                    'Client-ID': clientId!,
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                return { success: false, error: await response.text() };
            }

            return { success: true };
        } catch (err) {
            this.logger.error(`Error updating channel info for ${broadcasterId}`, err);
            return { success: false, error: err.message };
        }
    }

    private async getGameId(gameName: string, accessToken: string): Promise<string | null> {
        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
        try {
            const response = await fetch(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(gameName)}`, {
                headers: {
                    'Client-ID': clientId!,
                    'Authorization': `Bearer ${accessToken}`,
                },
            });
            const data = await response.json() as any;
            return data.data?.[0]?.id || null;
        } catch { return null; }
    }
}
