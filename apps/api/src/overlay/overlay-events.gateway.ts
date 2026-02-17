import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
    namespace: '/overlay-events',
})
export class OverlayEventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(OverlayEventsGateway.name);
    private overlaySubscriptions = new Map<string, Set<string>>(); // overlayId -> Set of socket IDs

    handleConnection(client: Socket) {
        this.logger.log(`Client connected: ${client.id}`);
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
        if (!this.overlaySubscriptions.has(overlayId)) {
            this.overlaySubscriptions.set(overlayId, new Set());
        }
        this.overlaySubscriptions.get(overlayId)!.add(client.id);

        client.join(`overlay:${overlayId}`);
        this.logger.log(`Client ${client.id} subscribed to overlay ${overlayId}`);

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
        badges?: string[];
        emotes?: any;
    }) {
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
     * Test alert (for testing purposes)
     */
    emitTestAlert(overlayId: string) {
        this.emitAlert(overlayId, {
            type: 'follow',
            username: 'TestUser',
            message: 'Thanks for the follow!',
        });
    }
}
