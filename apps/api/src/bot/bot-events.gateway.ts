import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class BotEventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;
    private logger: Logger = new Logger('BotEventsGateway');

    afterInit(server: Server) {
        this.logger.log('BotEventsGateway initialized');
    }

    handleConnection(client: Socket, ...args: any[]) {
        this.logger.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    @SubscribeMessage('joinTenant')
    handleJoinTenant(@MessageBody() tenantId: string, @ConnectedSocket() client: Socket) {
        this.logger.log(`Client ${client.id} joining room for tenant: ${tenantId}`);
        client.join(`tenant:${tenantId}`);
    }

    /**
     * Notify all clients that a command has changed for a specific tenant.
     */
    emitCommandUpdate(tenantId: string) {
        this.logger.log(`Emitting commandUpdate for tenant: ${tenantId}`);
        this.server.to(`tenant:${tenantId}`).emit('commandUpdated', { tenantId });
    }
}
