import type { Env } from './env';
import { createSupabaseClient } from './lib/supabase';
import { error, handlePreflight, json } from './lib/response';
import { handleAuth } from './routes/auth';
import { handleCommands } from './routes/commands';
import { handleTimers } from './routes/timers';
import { handleModeration } from './routes/moderation';
import { handleOverlays } from './routes/overlays';
import { handleDashboard } from './routes/dashboard';
import { handleAnalytics } from './routes/analytics';
import { handleAudit } from './routes/audit';
import { handleOnboarding } from './routes/onboarding';
import { handleLoyalty } from './routes/loyalty';
import { handleIntegrations } from './routes/integrations';
import { handleEventSub } from './routes/eventsub';
import { handleBot } from './routes/bot';
import { handleFonts } from './routes/fonts';
import { handleShop } from './routes/shop';
import { handleLinks } from './routes/links';
import { handleGiveaways } from './routes/giveaways';
import { handlePolls } from './routes/polls';
import { handleCounters } from './routes/counters';
import { handleQuotes } from './routes/quotes';
import { handleTips } from './routes/tips';
import { handleTipPublic } from './routes/tip-public';
import { handleCosmetics } from './routes/cosmetics';
import { handleEmotes } from './routes/emotes';
import { handleIntegrationModules } from './integrations/router';
import { RealtimeHub } from './realtime';
import { CreatorTokenDO } from './token-do';
import { runTimerSweep } from './scheduled';
import { reportError } from './lib/ops-alert';

export { RealtimeHub, CreatorTokenDO };

/**
 * CreatorCastle backend API (Cloudflare Worker + Supabase).
 *
 * Phase 1 scaffold: CORS handling, a health route that verifies Supabase
 * connectivity, and a router skeleton. Business routes (auth, commands, timers,
 * moderation, loyalty, overlays, ...) are added in later phases — each lifts
 * logic from the NestJS API in apps/api into a route handler here.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return handlePreflight(request, env);
    }

    // Real-time WebSocket upgrade — forward to the per-channel Durable Object.
    if (path === '/api/realtime') {
      const channel = url.searchParams.get('channel');
      if (!channel) return error('channel required', 400, request, env);
      if (request.headers.get('Upgrade') !== 'websocket') {
        return error('Expected websocket', 426, request, env);
      }
      const id = env.REALTIME.idFromName(channel);
      return env.REALTIME.get(id).fetch(request);
    }

    try {
      // --- Health check ---
      if (method === 'GET' && path === '/api/health') {
        const supabase = createSupabaseClient(env);
        // Round-trip the shared identity table to confirm DB connectivity.
        const { error: dbError } = await supabase
          .from('streamers')
          .select('id', { count: 'exact', head: true });

        if (dbError) {
          return json(
            { ok: false, db: 'error', message: dbError.message },
            request,
            env,
            { status: 503 },
          );
        }
        return json({ ok: true, db: 'ok', service: 'creatorcastle-api' }, request, env);
      }

      // --- Twitch OAuth + session ---
      if (path.startsWith('/auth/') || path.startsWith('/api/auth/') || path === '/api/user/me') {
        const supabase = createSupabaseClient(env);
        const res = await handleAuth(request, env, supabase, path, method, ctx);
        if (res) return res;
      }

      // --- Twitch EventSub webhook (chat pipeline + channel-point purchases) ---
      if (path.startsWith('/api/eventsub/')) {
        const res = await handleEventSub(request, env, createSupabaseClient(env), path, method, ctx);
        if (res) return res;
      }

      // --- Ported domain routes ---
      if (path === '/api/commands' || path.startsWith('/api/commands/')) {
        return handleCommands(request, env, createSupabaseClient(env), path, method);
      }
      if (path === '/api/timers' || path.startsWith('/api/timers/')) {
        return handleTimers(request, env, createSupabaseClient(env), path, method);
      }
      if (path === '/api/moderation' || path.startsWith('/api/moderation/')) {
        return handleModeration(request, env, createSupabaseClient(env), path, method);
      }
      if (path === '/api/overlays' || path.startsWith('/api/overlays/')) {
        return handleOverlays(request, env, createSupabaseClient(env), path, method);
      }
      if (path.startsWith('/api/dashboard/onboarding/')) {
        return handleOnboarding(request, env, createSupabaseClient(env), path, method);
      }
      if (path === '/api/dashboard/overview' || path === '/api/dashboard/stats' || path === '/api/dashboard/channel' || path === '/api/dashboard/categories') {
        const res = await handleDashboard(request, env, createSupabaseClient(env), path, method);
        if (res) return res;
      }
      if (path.startsWith('/api/analytics/')) {
        const res = await handleAnalytics(request, env, createSupabaseClient(env), path, method);
        if (res) return res;
      }
      if (path === '/api/audit') {
        const res = await handleAudit(request, env, createSupabaseClient(env), path, method);
        if (res) return res;
      }
      if (path === '/api/loyalty' || path.startsWith('/api/loyalty/')) {
        return handleLoyalty(request, env, createSupabaseClient(env), path, method);
      }
      if (path === '/api/fonts' || path.startsWith('/api/fonts/')) {
        return handleFonts(request, env, createSupabaseClient(env), path, method);
      }
      if (path === '/api/shop' || path.startsWith('/api/shop/')) {
        return handleShop(request, env, createSupabaseClient(env), path, method);
      }
      if (path === '/api/links' || path.startsWith('/api/links/')) {
        return handleLinks(request, env, createSupabaseClient(env), path, method);
      }
      if (path === '/api/giveaways' || path.startsWith('/api/giveaways/')) {
        return handleGiveaways(request, env, createSupabaseClient(env), path, method);
      }
      if (path === '/api/polls' || path.startsWith('/api/polls/')) {
        return handlePolls(request, env, createSupabaseClient(env), path, method);
      }
      if (path === '/api/counters' || path.startsWith('/api/counters/')) {
        return handleCounters(request, env, createSupabaseClient(env), path, method);
      }
      if (path === '/api/quotes' || path.startsWith('/api/quotes/')) {
        return handleQuotes(request, env, createSupabaseClient(env), path, method);
      }
      // Tipping — PUBLIC routes (supporter tip page + Stripe webhook). No session.
      if (path.startsWith('/api/tip/') || path === '/api/tips/webhook') {
        const res = await handleTipPublic(request, env, createSupabaseClient(env), path, method);
        if (res) return res;
      }
      // Tipping — creator API (settings, manual tips, leaderboard). Session-gated.
      if (path === '/api/tips' || path.startsWith('/api/tips/')) {
        return handleTips(request, env, createSupabaseClient(env), path, method);
      }
      // Chat cosmetics (badges + paints) for the browser extension. Includes a
      // public, CORS-open read at /api/cosmetics/public/channel/:channel.
      if (path === '/api/cosmetics' || path.startsWith('/api/cosmetics/')) {
        return handleCosmetics(request, env, createSupabaseClient(env), path, method);
      }
      // Custom chat emotes (7TV/BTTV-style). Public, CORS-open read at
      // /api/emotes/public/channel/:channel for the browser extension.
      if (path === '/api/emotes' || path.startsWith('/api/emotes/')) {
        return handleEmotes(request, env, createSupabaseClient(env), path, method);
      }
      // Bot connect/disconnect (chat EventSub subscription lifecycle).
      if (path.startsWith('/api/integrations/bot/')) {
        const res = await handleBot(request, env, createSupabaseClient(env), path, method);
        if (res) return res;
      }
      // Integration modules (bingo, wheel-spin, rank, tcg, …). Returns null when
      // the path isn't a registered module so the legacy importer handler below
      // (StreamElements / Nightbot) can take it.
      if (path === '/api/integrations/catalog' || path.startsWith('/api/integrations/')) {
        const res = await handleIntegrationModules(request, env, createSupabaseClient(env), path, method);
        if (res) return res;
      }
      if (path === '/api/integrations' || path.startsWith('/api/integrations/') || path.startsWith('/api/auth/nightbot') || path.startsWith('/api/auth/spotify')) {
        return handleIntegrations(request, env, createSupabaseClient(env), path, method);
      }

      return error('Not found', 404, request, env);
    } catch (e) {
      console.error('[Worker] Unhandled error:', e);
      ctx.waitUntil(reportError(env, `${method} ${path}`, e));
      return error('Internal server error', 500, request, env);
    }
  },

  // Cron Trigger entry (wrangler.jsonc "crons"). Runs the timer sweep; runs in
  // the background so a slow Helix call can't delay the schedule.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runTimerSweep(env).catch((e) => reportError(env, 'cron timer sweep', e)));
  },
};
