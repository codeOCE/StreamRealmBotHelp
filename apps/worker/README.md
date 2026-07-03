# CreatorCastle Worker API

Cloudflare Worker backend for CreatorCastle, on Supabase Postgres. Mirrors the
architecture of `TCG/mulistreamer-tcg`: a single Worker entrypoint, Supabase via
`@supabase/supabase-js`, raw SQL migrations, and `jose` JWT session cookies.

This replaces the NestJS API (`apps/api`) incrementally. The Next.js web app
(`apps/web`) calls this Worker's HTTP API. Phase 1 is the foundation scaffold:
config, auth/crypto helpers, the SQL schema, and a health route. Business routes
are ported from `apps/api` in later phases.

## Shared database & identity

CreatorCastle runs in the **same Supabase project** as the TCG (one Creator
Castle hub). It reuses the shared identity tables and namespaces its own tables:

- `public.streamers` — creator identity (login). CreatorCastle's `User`/`Tenant`
  map here; the dashboard session resolves a streamer by `twitch_id`.
- `public.users` — collector/viewer identity (shared logout/revocation).
- `bot.*` — all CreatorCastle tables (commands, timers, overlays, ...). Channel
  config lives in `bot.tenants` (1:1 with a streamer). Reach them via
  `botSchema(supabase)` (`supabase.schema('bot')`).

`SESSION_SECRET` must be the **same value** the TCG worker uses, so the `session`
cookie is valid across `*.creatorcastle.gg`.

## Layout

```
src/
  index.ts          Worker fetch handler: CORS, /api/health, route dispatch
  env.ts            Env bindings interface
  routes/
    auth.ts         Twitch OAuth + session: /auth/twitch, /auth/callback,
                    /api/auth/me, /api/auth/logout
    commands.ts     Commands CRUD: GET/POST /api/commands, PATCH /:id[/toggle],
                    DELETE /:id, DELETE /bulk, POST /import
  lib/
    supabase.ts     service-role Supabase client + bot-schema accessor
    session.ts      session JWT: issue / verify / renew / revoke
    crypto.ts       AES-GCM encryption for Twitch tokens
    cookies.ts      cookie parse/serialize + CSRF double-submit
    twitch.ts       Twitch authorize URL, token exchange, Helix user
    response.ts     json() / error() / CORS preflight
migrations/
  001_initial_schema.sql   bot schema + tables (references public.streamers)
  002_enable_rls.sql       RLS enabled; public read only for public overlays
test/
  crypto.test.ts    encrypt/decrypt round-trip smoke test
```

## Auth flow (Twitch OAuth)

1. Frontend links to `GET {worker}/auth/twitch` → 302 to Twitch (sets a one-time
   `twitch_oauth_state` CSRF cookie).
2. Twitch redirects to `GET {worker}/auth/callback` → state is verified, code is
   exchanged for tokens, the Helix user is fetched, `public.users` is upserted, a
   `public.streamers` row is created if missing (identity only — never overwrites
   TCG-owned fields), and the streamer's encrypted Twitch token + channel config
   are stored in `bot.tenants`. A `session` cookie is set and the browser is
   redirected to `{FRONTEND_URL}/dashboard`.
3. SPA calls `GET {worker}/api/auth/me` (credentialed) to read the session;
   `POST {worker}/api/auth/logout` clears it and stamps `users.last_logout_at`.

CreatorCastle uses its **own** Twitch app (separate from the TCG): different
scopes (chat/moderation/bot), branding, and secret. Register a new app at
https://dev.twitch.tv/console/apps with `{worker}/auth/callback` as an OAuth
Redirect URL. The streamer's token is stored in `bot.tenants.encrypted_creator_*`,
NOT `public.streamers.twitch_*` (which belongs to the TCG's app).

## Setup

1. Install: `npm install` (from repo root, or `cd apps/worker && npm install`).
2. Against the **shared Creator Castle Supabase project**, run (SQL editor or
   `psql "$SUPABASE_DB_URL" -f <file>`): `migrations/001_initial_schema.sql` then
   `migrations/002_enable_rls.sql`. These create the `bot` schema and tables and
   reference the existing `public.streamers`/`public.users` tables.
3. Expose the `bot` schema to the API: Supabase dashboard → Project Settings →
   API → **Exposed schemas**, add `bot`. (Required for `supabase.schema('bot')`.)
4. Copy `.dev.vars.example` to `.dev.vars` and fill in:
   - `SUPABASE_URL`, `SUPABASE_KEY` (anon), `SUPABASE_SERVICE_KEY` (service role)
   - `SESSION_SECRET` — **the same value the TCG worker uses** (shared sessions)
   - `ENCRYPTION_SECRET` (`openssl rand -base64 48`)
5. Run: `npm run dev` (serves on `http://localhost:8787`).

## Verify

- `npm run typecheck` — type-checks the Worker.
- `npm test` — crypto round-trip test.
- `curl http://localhost:8787/api/health` — expects `{"ok":true,"db":"ok",...}`,
  confirming a Supabase round-trip.

## Ported domains (call the Worker)

These dashboard pages/components now call the Worker (`@/lib/api` → `apiUrl()`),
not the legacy NestJS backend: **commands, timers, moderation, overlays** (+ the
public `/overlay/[slug]` render and the editor), and the **shell** (`/api/user/me`,
onboarding checklist, dashboard layout auth gate). Set `NEXT_PUBLIC_WORKER_URL`
in the web app's env for non-local deploys (defaults to `http://localhost:8787`).

Also ported: **loyalty/xp/skills** (`/api/loyalty/*`), **integrations external
import** (StreamElements connect/import + Nightbot OAuth/import; `/api/integrations/*`
and `/api/auth/nightbot/*`), and **real-time** (a `RealtimeHub` Durable Object —
overlay test alert/chat + cross-tab command sync over native WebSocket, replacing
Socket.io; client helper `@/lib/realtime`).

Still on NestJS / deferred (see "Remaining gaps"): the live chat bot runtime
(and what depends on it — bot connect/join, command execution, XP accrual,
song-request Spotify playback), plus intel/sentinel/interactions/tools pages.

## Migrating existing data (dev.db → Supabase)

After the SQL migrations are applied, move legacy SQLite data in:

```
npm run generate --workspace=@stream-realm/database   # ensure Prisma client
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
  node apps/worker/scripts/migrate-sqlite-to-supabase.mjs
```

It maps each Tenant → a `public.streamers` row and moves commands, timers, mod
rules, viewer profiles, and overlays/widgets into `bot.*`. Encrypted Twitch
tokens are NOT migrated (different cipher); creators re-auth via `/auth/twitch`.

## Production deploy

1. Secrets (never commit) — `wrangler secret put <NAME>` for: `SUPABASE_URL`,
   `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`, `SESSION_SECRET` (same value as the
   TCG worker), `ENCRYPTION_SECRET`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`.
2. Vars (in `wrangler.jsonc` or the dashboard): `FRONTEND_URL` = the web app's
   real origin (CORS + post-login redirect); `COOKIE_DOMAIN` = `.creatorcastle.gg`
   (cross-subdomain SSO).
3. Route — add a `routes`/custom-domain entry to `wrangler.jsonc` for the API
   host (e.g. `api.creatorcastle.gg`), then `npm run deploy`.
4. Twitch console — add the production `{worker}/auth/callback` redirect URL.
5. Web app — set `NEXT_PUBLIC_WORKER_URL` to the deployed Worker origin.
