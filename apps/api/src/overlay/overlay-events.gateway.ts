import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
    cors: {
        origin: ['http://localhost:3002', 'http://127.0.0.1:3002'],
        credentials: true,
    },
    namespace: '/overlay-events',
})
export class OverlayEventsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
    @WebSocketServer()
    server: Server;

    afterInit(server: Server) {
        this.logger.log('🚀 OverlayEventsGateway initialized and listening');
    }

    private readonly logger = new Logger(OverlayEventsGateway.name);
    private overlaySubscriptions = new Map<string, Set<string>>(); // overlayId -> Set of socket IDs

    handleConnection(client: Socket) {
        this.logger.log(`Client connected: ${client.id} (Namespace: ${client.nsp.name})`);
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);

        // Remove from all subscriptions
        for (const [overlayId, sockets] of this.overlaySubscriptions.entries()) {
            sockets.delete(client.id);
            if (sockets.size === 0) {
                this.overlaySubscriptions.delete(overlayId);
            }
        }
    }

    @SubscribeMessage('subscribe')
    handleSubscribe(client: Socket, overlayId: string) {
        this.logger.log(`Subscribe attempt for overlayId: ${overlayId} from client: ${client.id}`);
        if (!this.overlaySubscriptions.has(overlayId)) {
            this.overlaySubscriptions.set(overlayId, new Set());
        }
        this.overlaySubscriptions.get(overlayId)!.add(client.id);

        client.join(`overlay:${overlayId}`);
        this.logger.log(`Client ${client.id} successfully joined room: overlay:${overlayId}`);

        return { success: true };
    }

    @SubscribeMessage('unsubscribe')
    handleUnsubscribe(client: Socket, overlayId: string) {
        const sockets = this.overlaySubscriptions.get(overlayId);
        if (sockets) {
            sockets.delete(client.id);
            if (sockets.size === 0) {
                this.overlaySubscriptions.delete(overlayId);
            }
        }

        client.leave(`overlay:${overlayId}`);
        this.logger.log(`Client ${client.id} unsubscribed from overlay ${overlayId}`);

        return { success: true };
    }

    /**
     * Emit an alert event to all subscribers of an overlay
     */
    emitAlert(overlayId: string, alertData: {
        type: 'follow' | 'subscribe' | 'donation' | 'raid';
        username: string;
        message?: string;
        amount?: number;
        tier?: string;
    }) {
        this.server.to(`overlay:${overlayId}`).emit('alert', alertData);
        this.logger.log(`Emitted ${alertData.type} alert for ${alertData.username} to overlay ${overlayId}`);
    }

    /**
     * Emit a chat message to all subscribers of an overlay
     */
    emitChatMessage(overlayId: string, messageData: {
        username: string;
        message: string;
        color?: string;
        badges?: { setId: string; version: string }[];
        roomId?: string;
        emotes?: any;
    }) {
        this.logger.log(`Emitting chat message to overlay:${overlayId}: ${messageData.username}: ${messageData.message}`);
        this.server.to(`overlay:${overlayId}`).emit('chat', messageData);
    }

    /**
     * Emit a goal progress update
     */
    emitGoalUpdate(overlayId: string, goalData: {
        widgetId: string;
        current: number;
        target: number;
        percentage: number;
    }) {
        this.server.to(`overlay:${overlayId}`).emit('goal-update', goalData);
    }

    /**
     * Emit an event to all overlays belonging to a specific tenant
     */
    async emitToTenant(tenantId: string, event: string, data: any) {
        // We'll need access to Prisma to find overlays for this tenant
        // But since this is a gateway, we can just emit to a "tenant" room if we had one
        // Alternatively, the SongRequestService can find the overlays and call emitToOverlay
        // For now, let's assume we have a room per tenant or just emit to all and let clients filter
        // Actually, let's just make a generic broadcast for now or use the overlayId room
        this.server.emit(event, { ...data, tenantId });
        this.logger.log(`Broadcasted ${event} for tenant ${tenantId}`);
    }

    /**
     * Emit a song update event to a specific overlay
     */
    emitSongUpdate(overlayId: string, songData: any) {
        this.server.to(`overlay:${overlayId}`).emit('song.update', songData);
    }

    /**
     * Emit a test alert for an overlay
     */
    emitTestAlert(overlayId: string) {
        const dummyAlert = {
            type: 'follow' as const,
            username: 'TestUser',
            message: 'This is a test follow alert!',
        };
        this.server.to(`overlay:${overlayId}`).emit('alert', dummyAlert);
        this.logger.log(`Emitted test follow alert to overlay ${overlayId}`);
    }
}
