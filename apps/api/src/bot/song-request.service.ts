import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SpotifyService } from './spotify.service';
import { OverlayEventsGateway } from '../overlay/overlay-events.gateway';

@Injectable()
export class SongRequestService implements OnModuleInit {
    private readonly logger = new Logger(SongRequestService.name);
    private pollingIntervals = new Map<string, NodeJS.Timeout>();

    constructor(
        private prisma: PrismaService,
        private spotifyService: SpotifyService,
        private overlayEvents: OverlayEventsGateway,
    ) { }

    onModuleInit() {
        // We could potentially start polling for all active tenants here
        // But for a PC app, we'll wait until a tenant is "active" or just poll on first request
    }

    async requestSong(tenantId: string, requestedBy: string, userName: string, query: string): Promise<{ success: boolean; message: string }> {
        // 1. Search for track on Spotify
        const track = await this.spotifyService.searchTrack(tenantId, query);
        if (!track) {
            return { success: false, message: 'Could not find that song on Spotify.' };
        }

        // 2. Add to local database queue
        const songRequest = await this.prisma.songRequest.create({
            data: {
                tenantId,
                requestedBy,
                userName,
                songTitle: track.title,
                artist: track.artist,
                spotifyUri: track.uri,
                query,
                duration: track.duration,
                status: 'PENDING',
            },
        });

        // 3. Add to Spotify queue immediately (or manage manually if preferred)
        // For this implementation, we'll try to add to Spotify queue
        const addedToSpotify = await this.spotifyService.addToQueue(tenantId, track.uri);

        if (addedToSpotify) {
            // 4. Update status to playing if it's the only one or if we just want to track it
            // In a real scenario, we'd listen to Spotify playback events to update status
            this.startPolling(tenantId);
            this.emitUpdate(tenantId);
            return { success: true, message: `Added "${track.title}" by ${track.artist} to the queue!` };
        } else {
            return { success: false, message: 'Found the song, but failed to add it to Spotify queue. Is your Spotify player active?' };
        }
    }

    async skipSong(tenantId: string): Promise<boolean> {
        const success = await this.spotifyService.skipToNext(tenantId);
        if (success) {
            // Mark current playing as completed/skipped in DB
            await this.prisma.songRequest.updateMany({
                where: { tenantId, status: 'PLAYING' },
                data: { status: 'SKIPPED' },
            });
            this.emitUpdate(tenantId);
        }
        return success;
    }

    async getQueue(tenantId: string, limit: number = 5): Promise<any[]> {
        return this.prisma.songRequest.findMany({
            where: { tenantId, status: 'PENDING' },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });
    }

    private async emitUpdate(tenantId: string) {
        const playback = await this.spotifyService.getCurrentPlayback(tenantId);
        if (playback) {
            this.overlayEvents.emitToTenant(tenantId, 'song.update', { song: playback });
        } else {
            this.overlayEvents.emitToTenant(tenantId, 'song.update', { song: null });
        }
    }

    async startPolling(tenantId: string) {
        if (this.pollingIntervals.has(tenantId)) return;

        this.logger.log(`Starting song polling for tenant: ${tenantId}`);
        const interval = setInterval(() => this.emitUpdate(tenantId), 5000); // 5 seconds
        this.pollingIntervals.set(tenantId, interval);
    }

    async stopPolling(tenantId: string) {
        const interval = this.pollingIntervals.get(tenantId);
        if (interval) {
            clearInterval(interval);
            this.pollingIntervals.delete(tenantId);
            this.logger.log(`Stopped song polling for tenant: ${tenantId}`);
        }
    }
}
