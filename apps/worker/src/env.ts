/**
 * Worker environment bindings.
 *
 * Subset of the reference (TCG/mulistreamer-tcg) Env — only what CreatorCastle
 * needs in Phase 1. Bindings for R2 / Durable Objects / KV / AI / rate-limiters
 * are added in later phases as the features that require them are ported.
 */
export interface Env {
  // --- Supabase ---
  SUPABASE_URL: string;
  /** Anon (public) key. */
  SUPABASE_KEY: string;
  /** Service-role key. The Worker uses this for privileged access (bypasses RLS). */
  SUPABASE_SERVICE_KEY: string;

  // --- Auth / crypto ---
  /**
   * HS256 signing secret for the `session` JWT cookie. MUST match the value used
   * by the TCG worker so sessions are shared across *.creatorcastle.gg.
   */
  SESSION_SECRET: string;
  /** Dedicated AES-GCM key for token encryption. Falls back to SESSION_SECRET if unset. */
  ENCRYPTION_SECRET?: string;

  // --- Twitch OAuth ---
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;

  // --- EventSub (channel-point card purchases) ---
  /**
   * Publicly reachable base URL of this Worker, used as the EventSub webhook
   * callback (`<PUBLIC_WORKER_URL>/api/eventsub/callback`). Twitch can't reach
   * localhost, so channel-point redemptions only fire end-to-end when deployed
   * (or behind a tunnel). Falls back to the request origin when unset.
   */
  PUBLIC_WORKER_URL?: string;

  /**
   * Origin that serves emote images (/emote/:id/:size.webp). Defaults to the
   * worker's own host; set this once a dedicated CDN subdomain exists so new
   * emotes are written with branded URLs.
   */
  EMOTE_CDN_URL?: string;
  /** Seed used to derive per-subscription HMAC secrets for webhook verification. */
  EVENTSUB_SECRET?: string;

  // --- Nightbot OAuth (external command import) ---
  NIGHTBOT_CLIENT_ID?: string;
  NIGHTBOT_CLIENT_SECRET?: string;

  // --- Spotify OAuth (song requests: !sr queues to the creator's player) ---
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;

  // --- Tipping / donations (Stripe) ---
  /** Stripe secret key (sk_...). When unset, only manual/external tips work. */
  STRIPE_SECRET_KEY?: string;
  /** Stripe webhook signing secret (whsec_...) for /api/tips/webhook verification. */
  STRIPE_WEBHOOK_SECRET?: string;

  /**
   * Twitch user id of the platform operator allowed to connect the dedicated bot
   * account via /auth/bot. When unset, any logged-in creator may (dev only).
   */
  BOT_OWNER_TWITCH_ID?: string;

  /**
   * Comma-separated Twitch user ids allowed to moderate the shared emote
   * directory (approve/reject public emote submissions). When unset, no one can
   * — channel-private emotes still work without any approval. See routes/emotes.ts.
   */
  PLATFORM_ADMIN_IDS?: string;

  /**
   * One-time setup secret for seeding the platform bot token. When set, visiting
   * /auth/bot?key=<secret> starts the bot OAuth with NO app session required —
   * authorize while logged into Twitch as the bot account. The standard way to
   * connect the shared bot; falls back to the BOT_OWNER_TWITCH_ID session check
   * when unset (dev).
   */
  BOT_SETUP_SECRET?: string;

  // --- Misc config ---
  /** Origin of the Next.js web app, used for CORS + post-login OAuth redirects. */
  FRONTEND_URL: string;
  /**
   * Cookie Domain for the `session` cookie, e.g. `.creatorcastle.gg`, so the
   * session is shared across subdomains (web + worker + TCG). Leave unset in
   * local dev (host-only cookie on localhost).
   */
  COOKIE_DOMAIN?: string;
  ENVIRONMENT?: string;
  /** Discord/Slack incoming-webhook URL for ops alerts (unhandled errors). No-op if unset. */
  OPS_WEBHOOK_URL?: string;

  // --- Amazon Polly (tip TTS) ---
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  /** Polly region, e.g. us-east-1 */
  AWS_REGION?: string;
  /** Polly voice id (default Brian). */
  POLLY_VOICE_ID?: string;
  /** standard (cheaper) or neural */
  POLLY_ENGINE?: string;

  /** Local dev: skip session checks (never set in production). */
  DEV_SKIP_AUTH?: string;
  DEV_STREAMER_ID?: string;
  DEV_TWITCH_ID?: string;
  DEV_USERNAME?: string;

  // --- Real-time (Durable Object WebSocket hub) ---
  REALTIME: DurableObjectNamespace;
  /**
   * Per-streamer token broker (Durable Object). Serializes creator-token
   * refreshes so concurrent requests can't race Twitch's refresh-token rotation
   * and brick a streamer. See lib/creator-chat.ts + token-do.ts.
   */
  TOKENS: DurableObjectNamespace<import('./token-do').CreatorTokenDO>;
}
