import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SecurityService } from '../common/security/security.service';
import { TwitchApiService } from '../bot/twitch-api.service';

export interface DashboardTwitchStats {
    followers: number;
    subscribers: number | null;
    viewers: number;
    isLive: boolean;
    streamTitle: string | null;
    gameName: string | null;
    channelName: string | null;
}

@Injectable()
export class DashboardStatsService {
    private readonly logger = new Logger(DashboardStatsService.name);

    constructor(
        private prisma: PrismaService,
        private security: SecurityService,
        private twitchApi: TwitchApiService,
    ) {}

    async getTwitchStats(userId: string): Promise<DashboardTwitchStats> {
        const tenant = await this.prisma.tenant.findFirst({
            where: { ownerId: userId },
            include: { owner: true },
        });

        const empty: DashboardTwitchStats = {
            followers: 0,
            subscribers: null,
            viewers: 0,
            isLive: false,
            streamTitle: null,
            gameName: null,
            channelName: tenant?.targetChannel ?? tenant?.name ?? null,
        };

        if (!tenant?.twitchId) return empty;

        const broadcasterId = tenant.twitchId;
        const channelName = tenant.targetChannel ?? tenant.name;

        const [followers, stream, channel] = await Promise.all([
            this.twitchApi.getFollowerCount(broadcasterId).catch(() => 0),
            channelName ? this.twitchApi.getStreamInfo(channelName).catch(() => null) : Promise.resolve(null),
            this.twitchApi.getChannelInfo(broadcasterId).catch(() => null),
        ]);

        const subscribers = await this.getSubscriberCount(broadcasterId, tenant.owner);

        return {
            followers: followers ?? 0,
            subscribers,
            viewers: stream?.viewer_count ?? 0,
            isLive: !!stream,
            streamTitle: stream?.title ?? channel?.title ?? null,
            gameName: stream?.game_name ?? channel?.game_name ?? null,
            channelName,
        };
    }

    async updateChannel(userId: string, title?: string, game?: string) {
        const tenant = await this.prisma.tenant.findFirst({
            where: { ownerId: userId },
            include: { owner: true },
        });

        if (!tenant?.twitchId || !tenant.owner) {
            return { success: false, error: 'Channel not found' };
        }

        if (!title?.trim() && !game?.trim()) {
            return { success: false, error: 'Nothing to update' };
        }

        return this.withOwnerToken(tenant.owner, async (token) =>
            this.twitchApi.updateChannelInfo(
                tenant.twitchId,
                title?.trim() || undefined,
                game?.trim() || undefined,
                token,
            ),
        );
    }

    private async withOwnerToken(
        owner: { id: string; encryptedAccessToken: string | null; encryptedRefreshToken: string | null },
        action: (token: string) => Promise<{ success: boolean; error?: string }>,
    ): Promise<{ success: boolean; error?: string }> {
        if (!owner.encryptedAccessToken) {
            return { success: false, error: 'Twitch not connected' };
        }

        let token: string;
        try {
            token = this.security.decrypt(owner.encryptedAccessToken);
        } catch {
            return { success: false, error: 'Could not read Twitch token' };
        }

        let result = await action(token);
        const needsRefresh =
            !result.success &&
            !!owner.encryptedRefreshToken &&
            !!result.error?.match(/401|403|Unauthorized/i);

        if (needsRefresh) {
            const refreshed = await this.refreshOwnerToken(owner);
            if (refreshed) result = await action(refreshed);
        }

        return result;
    }

    private async getSubscriberCount(
        broadcasterId: string,
        owner: { id: string; encryptedAccessToken: string | null; encryptedRefreshToken: string | null } | null,
    ): Promise<number | null> {
        if (!owner?.encryptedAccessToken) return null;

        let token: string;
        try {
            token = this.security.decrypt(owner.encryptedAccessToken);
        } catch {
            return null;
        }

        let count = await this.twitchApi.getSubscriberCount(broadcasterId, token);
        if (count === -1 && owner.encryptedRefreshToken) {
            const refreshed = await this.refreshOwnerToken(owner);
            if (refreshed) {
                count = await this.twitchApi.getSubscriberCount(broadcasterId, refreshed);
            }
        }

        return count === -1 ? null : count;
    }

    private async refreshOwnerToken(owner: {
        id: string;
        encryptedRefreshToken: string | null;
    }): Promise<string | null> {
        if (!owner.encryptedRefreshToken) return null;

        try {
            const refreshToken = this.security.decrypt(owner.encryptedRefreshToken);
            const result = await this.twitchApi.refreshUserToken(refreshToken);
            if (!result) return null;

            await this.prisma.user.update({
                where: { id: owner.id },
                data: {
                    encryptedAccessToken: this.security.encrypt(result.accessToken),
                    encryptedRefreshToken: this.security.encrypt(result.refreshToken),
                    tokenExpiresAt: new Date(Date.now() + result.expiresIn * 1000),
                },
            });

            return result.accessToken;
        } catch (err) {
            this.logger.warn('Failed to refresh owner token for dashboard stats', err);
            return null;
        }
    }
}
