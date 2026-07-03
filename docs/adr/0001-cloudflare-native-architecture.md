# 1. Cloudflare-native architecture (Worker + Durable Objects + Supabase)

- Status: Accepted
- Date: 2026-06-11
- Deciders: project owner

## Context

CreatorCastle is a Twitch creator-tooling platform — the goal is to be a better,
self-hostable StreamElements (chat commands, timers, moderation, loyalty/XP,
overlays/alerts, mini-games like bingo and the wheel). It must align with the
sibling TCG project, which runs as a Cloudflare Worker on a shared Supabase
database.

The original backend was a stateful Node stack:

- `apps/api` — NestJS holding a **Twitch IRC chat connection** (`tmi.js`),
  `socket.io` gateways, BullMQ/Redis queues, and `@nestjs/schedule` timers.
- `apps/bot` — a second always-on Node process (`@twurple/chat`) — never built
  out beyond a skeleton.

This stack does not scale (one persistent IRC connection per channel caps out
at a few hundred channels per box) and multiplies operational surface (the
`403 invalid client secret` incident on 2026-06-11 was caused by the same secret
drifting between three separately-managed services).

The open question was whether a stateless Worker model can run a chat bot at
all, and whether a separate always-on service is required.

### Key technical finding

Cloudflare Durable Objects **can** hold a WebSocket, but per the Cloudflare docs:

> Hibernation is only supported when a Durable Object acts as a WebSocket
> **server**. **Outgoing WebSockets do not hibernate.**

Therefore a DO holding an *outbound* connection to Twitch (EventSub WebSocket or
IRC) stays active and is billed for wall-clock time 24/7 — **per streamer**. At
scale this re-creates the per-connection cost/scaling wall and defeats the
serverless model.

The alternative — **EventSub webhooks in, Helix REST out** — needs no persistent
connection: Twitch pushes events to a Worker HTTP endpoint, and the bot replies
via `POST /helix/chat/messages`. Cost is per-request; nothing idles while billed.

## Decision

Run the entire platform on the Cloudflare stack, with one organizing principle:

> **Plain Worker for anything stateless. Durable Object only for inbound
> coordination that hibernates when idle. Never a DO for an outbound keep-alive.**

Concretely:

| Concern | Implementation |
| --- | --- |
| Chat in (commands, mod, loyalty triggers) | Worker ← EventSub `channel.chat.message` **webhook** |
| Chat out | Helix `POST /chat/messages` (`creator-chat.ts`) |
| Events (follow/sub/raid/cheer/redemptions) | EventSub webhooks → `RealtimeHub` DO → overlay |
| Timers / recurring messages | **Cron Triggers** sweeping due timers |
| Overlay/dashboard realtime | **Durable Object** (`RealtimeHub`), **hibernatable** inbound WS |
| Per-streamer scheduled work / state | DO **alarms** + SQLite storage |
| Token-refresh single-flight | Per-streamer DO (serialize refresh; avoids RT-rotation races) |
| Data | Supabase (shared with the TCG) |
| Assets (sounds, images, fonts) | R2 (migrating off Supabase Storage over time) |

No separate always-on service is added. The only future workload that justifies a
different compute tier is **heavy media** (donation TTS, video-alert transcoding)
which exceeds the Worker CPU limit (30s default, 5min max) — and even then the
answer stays on Cloudflare: **Queues + Containers**, added only when that feature
ships.

`apps/api` and `apps/bot` are retired once the chat pipeline is ported to the
webhook path.

## Consequences

### Positive

- Scales horizontally with no per-channel connection to hold; no Redis to run.
- One service → one set of secrets → the credential-drift class of bug disappears.
- Per-streamer isolation and scheduled work via Durable Objects.
- Near-zero idle cost; global edge.

### Negative / risks

- **Automod latency**: webhook round-trip is hundreds of ms vs. ~50 ms for an
  in-process IRC bot. Acceptable for almost all moderation. If instant blocking
  is ever required, a *targeted* DO holding the chat WS for opted-in channels is
  the escape hatch — an exception, not the default.
- **EventSub lifecycle**: subscriptions, secret rotation, and revocation handling
  are now our responsibility (more ops surface than one IRC connection).
- **Helix rate limits** on outbound chat sends must be respected (token-bucket).

### Follow-up work

1. Cron Triggers for timers (the missing primitive). — ADR-driven, next.
2. Migrate `RealtimeHub` to the Hibernatable WebSockets API
   (`ctx.acceptWebSocket()` / `ctx.getWebSockets()`); switch its migration entry
   to `new_sqlite_classes`.
3. Port command/moderation/loyalty processing onto the `channel.chat.message`
   webhook path.
4. Repoint `apps/web` realtime from `socket.io-client` to `RealtimeHub`.
5. Per-streamer DO for token-refresh single-flight.
6. Delete `apps/api` and `apps/bot`.
