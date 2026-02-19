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

    private async getAppToken(forceRefresh = false) {
        if (!forceRefresh && this.accessToken && Date.now() < this.expiresAt) {
            return this.accessToken;
        }

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
        const clientSecret = this.configService.get<string>('TWITCH_CLIENT_SECRET');

        if (!clientId || !clientSecret) {
            this.logger.error('getAppToken: Missing required environment variables. TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be set.');
            return null;
        }

        this.logger.log('Fetching new Twitch App Access Token...');

        try {
            const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, {
                method: 'POST',
            });

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`Failed to get app token: ${response.status} ${response.statusText} - ${errorText}`);
                this.logger.error('Check that TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are correct in your .env file');
                throw new Error(`Failed to get app token: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json() as any;
            this.accessToken = data.access_token;
            // Buffer of 5 minutes (300 seconds) to prevent edge-case expiry
            this.expiresAt = Date.now() + (data.expires_in - 300) * 1000;
            this.logger.log(`Generated new App Access Token. Expires in ${data.expires_in}s`);
            return this.accessToken;
        } catch (err) {
            this.logger.error('Error fetching Twitch App Token', err);
            return null;
        }
    }

    private async makeAppTokenRequest<T>(url: string, errorContext: string): Promise<T | null> {
        let token = await this.getAppToken();
        if (!token) return null;

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
        if (!clientId) {
            this.logger.error(`${errorContext}: TWITCH_CLIENT_ID is missing`);
            return null;
        }

        const fetchOptions = {
            headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${token}`,
            }
        };

        try {
            let response = await fetch(url, fetchOptions);

            // Handle 401 - Retry Once
            if (response.status === 401) {
                this.logger.warn(`${errorContext}: 401 Unauthorized. Refreshing App Token and Retrying...`);
                this.accessToken = null; // Invalidate cached token
                token = await this.getAppToken(); // Fetch new one
                if (!token) return null;

                fetchOptions.headers['Authorization'] = `Bearer ${token}`; // Update header
                response = await fetch(url, fetchOptions); // Retry
            }

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`${errorContext}: ${response.status} ${response.statusText} - ${errorText}`);
                return null;
            }

            const data = await response.json() as any;
            return data;
        } catch (err) {
            this.logger.error(`${errorContext}: Network/Parse Error`, err);
            return null;
        }
    }

    async getStreamInfo(channelName: string) {
        const channel = channelName.replace('#', '');
        const data = await this.makeAppTokenRequest<any>(
            `https://api.twitch.tv/helix/streams?user_login=${channel}`,
            `getStreamInfo(${channel})`
        );
        return data?.data?.[0] || null;
    }

    async getUserFollow(broadcasterId: string, userId: string) {
        const data = await this.makeAppTokenRequest<any>(
            `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&user_id=${userId}`,
            `getUserFollow(${userId} -> ${broadcasterId})`
        );
        return data?.data?.[0] || null;
    }

    async getUserInfo(login: string) {
        if (this.botIdCache.has(login.toLowerCase())) {
            return { id: this.botIdCache.get(login.toLowerCase())!, login };
        }

        const data = await this.makeAppTokenRequest<any>(
            `https://api.twitch.tv/helix/users?login=${login}`,
            `getUserInfo(${login})`
        );

        const user = data?.data?.[0];
        if (user) {
            this.botIdCache.set(login.toLowerCase(), user.id);
        }
        return user || null;
    }

    async getUserInfoById(userId: string) {
        const data = await this.makeAppTokenRequest<any>(
            `https://api.twitch.tv/helix/users?id=${userId}`,
            `getUserInfoById(${userId})`
        );
        return data?.data?.[0] || null;
    }

    async getFollowerCount(broadcasterId: string) {
        const data = await this.makeAppTokenRequest<any>(
            `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}`,
            `getFollowerCount(${broadcasterId})`
        );
        return data?.total || 0;
    }

    async getViewerCount(channelName: string) {
        const stream = await this.getStreamInfo(channelName);
        return stream?.viewer_count || 0;
    }

    async getChannelInfo(broadcasterId: string) {
        const data = await this.makeAppTokenRequest<any>(
            `https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`,
            `getChannelInfo(${broadcasterId})`
        );
        return data?.data?.[0] || null;
    }

    async sendChatMessage(broadcasterId: string, senderId: string, message: string, replyId?: string, accessToken?: string) {
        // Chat always requires a User Token (user:write:chat). App Tokens cannot send messages.
        if (!accessToken) {
            this.logger.error('sendChatMessage: User Access Token missing. Cannot send chat with App Token.');
            return { success: false, error: 'Missing User Access Token' };
        }
        const token = accessToken;

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
        if (!clientId) {
            this.logger.error('sendChatMessage: TWITCH_CLIENT_ID is missing');
            return { success: false, error: 'TWITCH_CLIENT_ID is missing' };
        }

        try {
            this.logger.debug(`Helix: Sending message to ${broadcasterId} from ${senderId}: ${message}`);
            const response = await fetch('https://api.twitch.tv/helix/chat/messages', {
                method: 'POST',
                headers: {
                    'Client-ID': clientId,
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
                if (response.status === 401) {
                    this.logger.error(`Helix Send Error: 401 Unauthorized - Token may be invalid. Response: ${body}`);
                    // Force token refresh if using app token
                    if (!accessToken) {
                        this.accessToken = null;
                        // We could retry here technically, but this method is complex
                    }
                } else {
                    this.logger.error(`Helix Send Error: ${response.status} ${response.statusText} - ${body}`);
                }
                return { success: false, error: body };
            }

            return { success: true };
        } catch (err) {
            this.logger.error(`Helix Fetch Error`, err);
            return { success: false, error: err.message };
        }
    }

    async getLatestFollower(broadcasterId: string) {
        const data = await this.makeAppTokenRequest<any>(
            `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&first=1`,
            `getLatestFollower(${broadcasterId})`
        );
        return data?.data?.[0]?.user_name || 'No followers';
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

        // ... (Keep existing impl)
        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
        const body: any = {};
        if (title) body.title = title;
        if (game) body.game_id = await this.getGameId(game, accessToken) || undefined;

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
        // This uses User Token usually (scope?) or App Token.
        // updateChannelInfo passes User Token.
        // If we need App Token here, we should use makeAppTokenRequest, but signature expects accessToken.
        // Letting it be for now as it's helper for updateChannelInfo

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
        if (!clientId) return null;

        try {
            const response = await fetch(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(gameName)}`, {
                headers: {
                    'Client-ID': clientId,
                    'Authorization': `Bearer ${accessToken}`,
                },
            });
            if (!response.ok) {
                // Log but don't retry locally as we rely on caller to refresh user token
                return null;
            }
            const data = await response.json() as any;
            return data.data?.[0]?.id || null;
        } catch (err) {
            return null;
        }
    }

    async getLatestSubscriber(broadcasterId: string, accessToken?: string) {
        if (!accessToken) return null;

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/subscriptions?broadcaster_id=${broadcasterId}&first=1`, {
                headers: {
                    'Client-ID': clientId!,
                    'Authorization': `Bearer ${accessToken}`,
                },
            });

            // Use -1 logic signal for 401 so caller can refresh
            if (response.status === 401 || response.status === 403) return -1;
            if (!response.ok) return null;

            const data = await response.json() as any;
            return data.data?.[0]?.user_name || 'No subscribers';
        } catch (err) {
            this.logger.error(`Error fetching latest sub for ${broadcasterId}`, err);
            return 'Unknown';
        }
    }

    async getLatestCheer(broadcasterId: string, accessToken?: string) {
        if (!accessToken) return null;

        const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/bits/leaderboard?count=1&period=all`, {
                headers: {
                    'Client-ID': clientId!,
                    'Authorization': `Bearer ${accessToken}`,
                },
            });

            if (response.status === 401 || response.status === 403) return -1; // Auth signal
            if (!response.ok) return null;

            const data = await response.json() as any;
            return data.data?.[0]?.user_name || 'No cheers';
        } catch (err) {
            this.logger.error(`Error fetching bits leaderboard for ${broadcasterId}`, err);
            return 'Unknown';
        }
    }

    async getGlobalEmotes() {
        const data = await this.makeAppTokenRequest<any>(
            `https://api.twitch.tv/helix/chat/emotes/global`,
            `getGlobalEmotes`
        );
        return data?.data?.map((e: any) => e.name) || [];
    }
}
