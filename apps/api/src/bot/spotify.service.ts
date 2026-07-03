import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class SpotifyService {
    private readonly logger = new Logger(SpotifyService.name);
    private readonly spotifyApiUrl = 'https://api.spotify.com/v1';

    constructor(
        private configService: ConfigService,
        private prisma: PrismaService,
    ) { }

    async getAccessToken(tenantId: string): Promise<string | null> {
        const integration = await this.prisma.integration.findUnique({
            where: {
                tenantId_provider: {
                    tenantId,
                    provider: 'spotify',
                },
            },
        });

        if (!integration) return null;

        // TODO: Implement token refresh logic if expired
        // For now, assume integration.encryptedAccessToken is a valid token or needs refresh
        // We'll need to decrypt it first (using SecurityService)

        return integration.encryptedAccessToken;
    }

    async searchTrack(tenantId: string, query: string): Promise<any> {
        const token = await this.getAccessToken(tenantId);
        if (!token) return null;

        try {
            const response = await axios.get(`${this.spotifyApiUrl}/search`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                params: {
                    q: query,
                    type: 'track',
                    limit: 1,
                },
            });

            const track = response.data.tracks.items[0];
            if (!track) return null;

            return {
                uri: track.uri,
                title: track.name,
                artist: track.artists.map((a: any) => a.name).join(', '),
                duration: Math.floor(track.duration_ms / 1000),
            };
        } catch (err) {
            this.logger.error(`Spotify search failed for query: ${query}`, err);
            return null;
        }
    }

    async addToQueue(tenantId: string, uri: string): Promise<boolean> {
        const token = await this.getAccessToken(tenantId);
        if (!token) return false;

        try {
            await axios.post(`${this.spotifyApiUrl}/me/player/queue`, null, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                params: {
                    uri,
                },
            });
            return true;
        } catch (err) {
            this.logger.error(`Spotify add to queue failed for URI: ${uri}`, err);
            return false;
        }
    }

    async skipToNext(tenantId: string): Promise<boolean> {
        const token = await this.getAccessToken(tenantId);
        if (!token) return false;

        try {
            await axios.post(`${this.spotifyApiUrl}/me/player/next`, null, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            return true;
        } catch (err) {
            this.logger.error(`Spotify skip failed`, err);
            return false;
        }
    }

    async getCurrentPlayback(tenantId: string): Promise<any> {
        const token = await this.getAccessToken(tenantId);
        if (!token) return null;

        try {
            const response = await axios.get(`${this.spotifyApiUrl}/me/player/currently-playing`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.status === 204 || !response.data) return null;

            const item = response.data.item;
            return {
                title: item.name,
                artist: item.artists.map((a: any) => a.name).join(', '),
                albumArt: item.album.images[0]?.url,
                duration: Math.floor(item.duration_ms / 1000),
                progress: Math.floor(response.data.progress_ms / 1000),
                isPlaying: response.data.is_playing,
            };
        } catch (err) {
            this.logger.error(`Spotify get current playback failed`, err);
            return null;
        }
    }
}
