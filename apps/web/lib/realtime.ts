import { workerWsOrigin } from './api';

/**
 * Connect to the Worker's real-time hub (Durable Object WebSocket), replacing
 * the old Socket.io client. `channel` is e.g. `overlay:<id>` or `streamer:<id>`.
 * `onEvent(event, data)` fires for each `{ event, data }` message. Returns a
 * disconnect function. Auto-reconnects on drop.
 */
export function connectRealtime(
  channel: string,
  onEvent: (event: string, data: any) => void,
): () => void {
  const wsBase = workerWsOrigin();
  const url = `${wsBase}/api/realtime?channel=${encodeURIComponent(channel)}`;
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    ws = new WebSocket(url);
    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data);
        onEvent(event, data);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      if (!closed) retry = setTimeout(open, 2000);
    };
    ws.onerror = () => ws?.close();
  };
  open();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    ws?.close();
  };
}
