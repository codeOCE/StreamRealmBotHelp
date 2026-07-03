import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';

/**
 * Real-time pub/sub over WebSockets, replacing the NestJS Socket.io gateways.
 *
 * One Durable Object instance per channel (e.g. `overlay:<id>` for an OBS
 * browser source, or `streamer:<id>` for dashboard cross-tab sync). Clients
 * connect via GET /api/realtime?channel=<id>; the Worker forwards the upgrade to
 * the DO. Worker routes push events with broadcast().
 *
 * Uses the **Hibernation API** (ctx.acceptWebSocket): an idle hub (overlay open
 * for hours with no traffic) is evicted from memory and billed nothing, yet its
 * sockets stay connected — the runtime rehydrates the DO on the next event. The
 * socket set is owned by the runtime (ctx.getWebSockets()), so it also survives
 * eviction, unlike an in-memory Set.
 *
 * Messages are JSON: { event: string, data: unknown }.
 */
export class RealtimeHub extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal broadcast (POST from the Worker).
    if (request.method === 'POST' && url.pathname === '/broadcast') {
      const msg = await request.text();
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(msg);
        } catch {
          // Socket is closing; the runtime will drop it.
        }
      }
      return new Response('ok');
    }

    // Client WebSocket upgrade — accept under hibernation management.
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('expected websocket', { status: 426 });
  }

  // ── Hibernation handlers — the runtime calls these to wake the DO on events ──

  /** Clients are receive-only; ignore inbound frames (room for ping/pong later). */
  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {}

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code);
    } catch {
      // already closed
    }
  }

  async webSocketError(_ws: WebSocket): Promise<void> {}
}

/** Push an event to all clients connected to a channel. Fire-and-forget safe. */
export async function broadcast(env: Env, channel: string, event: string, data: unknown = {}): Promise<void> {
  try {
    const id = env.REALTIME.idFromName(channel);
    const stub = env.REALTIME.get(id);
    await stub.fetch('https://realtime/broadcast', { method: 'POST', body: JSON.stringify({ event, data }) });
  } catch (e) {
    console.error('[realtime] broadcast failed:', (e as Error).message);
  }
}
