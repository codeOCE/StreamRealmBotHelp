import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { error, json } from '../lib/response';
import { finalizeTip } from '../lib/finalize-tip';
import { moderationFromRow } from '../lib/tip-moderation';
import { normalizeTipCurrency, type TipCurrencyCode } from '../lib/tip-currencies';
import { pollyConfigured, synthesizeTipTts } from '../lib/polly-tts';

/**
 * Tipping — creator API (dashboard).
 *
 *   GET    /api/tips             settings + recent tips + totals + leaderboard
 *   PATCH  /api/tips/settings    update tip-page settings
 *   POST   /api/tips/:id/approve   approve a tip held for review
 *   POST   /api/tips/:id/deny      deny a tip held for review
 *
 * Public supporter routes (tip page + Stripe webhook) live in tip-public.ts.
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  currency: 'USD' as TipCurrencyCode,
  minAmountCents: 100,
  maxAmountCents: null as number | null,
  suggestedAmountCents: 500,
  maxMessageLength: 255,
  tipPresets: [5, 10, 25, 50],
  thanksMessage: 'Thank you so much for the support!',
  stripeAccountId: null as string | null,
  paypalEmail: null as string | null,
  ttsEnabled: false,
  ttsMinAmountCents: 100,
  ttsMonthlyCharLimit: 50_000,
  ttsCharsUsed: 0,
};

function normalizePresets(raw: unknown): number[] {
  const arr = Array.isArray(raw) ? raw : DEFAULT_SETTINGS.tipPresets;
  const nums = arr.map((v) => Math.trunc(Number(v))).filter((n) => n >= 1);
  return nums.length > 0 ? nums.slice(0, 8) : DEFAULT_SETTINGS.tipPresets;
}

function settingsToApi(row: any, env: Env) {
  const mod = moderationFromRow(row);
  const base = !row
    ? {
        ...DEFAULT_SETTINGS,
        stripeConnected: false,
        paypalConnected: false,
      }
    : {
        enabled: row.enabled,
        currency: normalizeTipCurrency(row.currency),
        minAmountCents: row.min_amount_cents,
        maxAmountCents: row.max_amount_cents ?? null,
        suggestedAmountCents: row.suggested_amount_cents ?? DEFAULT_SETTINGS.suggestedAmountCents,
        maxMessageLength: row.max_message_length ?? DEFAULT_SETTINGS.maxMessageLength,
        tipPresets: normalizePresets(row.tip_presets),
        thanksMessage: row.thanks_message,
        stripeAccountId: row.stripe_account_id,
        stripeConnected: !!row.stripe_account_id,
        paypalEmail: row.paypal_email ?? null,
        paypalConnected: !!row.paypal_email,
      };
  return {
    ...base,
    profanityEnabled: mod.profanityEnabled,
    customBlockedWords: mod.customBlockedWords,
    blockedDonors: mod.blockedDonors,
    filterAction: mod.filterAction,
    replacementText: mod.replacementText,
    manualApproval: mod.manualApproval,
    ttsAntiSpam: mod.ttsAntiSpam,
    ttsEnabled: row?.tts_enabled ?? DEFAULT_SETTINGS.ttsEnabled,
    ttsMinAmountCents: row?.tts_min_amount_cents ?? DEFAULT_SETTINGS.ttsMinAmountCents,
    ttsMonthlyCharLimit: row?.tts_monthly_char_limit ?? DEFAULT_SETTINGS.ttsMonthlyCharLimit,
    ttsCharsUsed: row?.tts_usage_month === new Date().toISOString().slice(0, 7) ? (row?.tts_chars_used ?? 0) : 0,
    pollyReady: pollyConfigured(env),
  };
}

function mapTipRow(t: Record<string, unknown>) {
  return {
    id: t.id,
    donorName: (t.display_donor_name as string) || (t.donor_name as string),
    amountCents: t.amount_cents,
    currency: t.currency,
    message: (t.display_message as string) || (t.message as string),
    rawMessage: t.message,
    status: t.status,
    provider: t.provider,
    createdAt: t.created_at,
    alertSuppressed: !!t.alert_suppressed,
    moderationStatus: t.moderation_status ?? null,
    moderationReason: t.moderation_reason ?? null,
  };
}

function normalizeWordListInput(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((w) => String(w).trim().toLowerCase()).filter((w) => w.length >= 2).slice(0, 200);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[\n,;]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 2)
      .slice(0, 200);
  }
  return [];
}

export async function handleTips(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response> {
  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const streamerId = user.id;
  const bot = botSchema(supabase);
  const seg = path.slice('/api/tips'.length).replace(/^\//, '').split('/').filter(Boolean);

  // ── Settings ─────────────────────────────────────────────────────────────
  if (seg[0] === 'settings' && method === 'PATCH') {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const patch: Record<string, any> = { streamer_id: streamerId, updated_at: new Date().toISOString() };
    if (Object.prototype.hasOwnProperty.call(body, 'enabled')) patch.enabled = !!body.enabled;
    if (Object.prototype.hasOwnProperty.call(body, 'currency')) {
      patch.currency = normalizeTipCurrency(body.currency, DEFAULT_SETTINGS.currency);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'minAmountCents')) patch.min_amount_cents = Math.max(50, Math.trunc(Number(body.minAmountCents) || 100));
    if (Object.prototype.hasOwnProperty.call(body, 'maxAmountCents')) {
      const v = body.maxAmountCents == null || body.maxAmountCents === '' ? null : Math.max(50, Math.trunc(Number(body.maxAmountCents)));
      patch.max_amount_cents = v;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'suggestedAmountCents')) {
      patch.suggested_amount_cents = Math.max(50, Math.trunc(Number(body.suggestedAmountCents) || DEFAULT_SETTINGS.suggestedAmountCents));
    }
    if (Object.prototype.hasOwnProperty.call(body, 'maxMessageLength')) {
      patch.max_message_length = Math.min(500, Math.max(20, Math.trunc(Number(body.maxMessageLength) || 255)));
    }
    if (Object.prototype.hasOwnProperty.call(body, 'tipPresets')) patch.tip_presets = normalizePresets(body.tipPresets);
    if (Object.prototype.hasOwnProperty.call(body, 'thanksMessage')) patch.thanks_message = String(body.thanksMessage ?? '').slice(0, 200);
    if (Object.prototype.hasOwnProperty.call(body, 'stripeAccountId')) patch.stripe_account_id = body.stripeAccountId ? String(body.stripeAccountId).trim().slice(0, 64) : null;
    if (Object.prototype.hasOwnProperty.call(body, 'paypalEmail')) {
      patch.paypal_email = body.paypalEmail ? String(body.paypalEmail).trim().slice(0, 120) : null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'profanityEnabled')) patch.profanity_enabled = !!body.profanityEnabled;
    if (Object.prototype.hasOwnProperty.call(body, 'customBlockedWords')) {
      patch.custom_blocked_words = normalizeWordListInput(body.customBlockedWords);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'blockedDonors')) {
      patch.blocked_donors = normalizeWordListInput(body.blockedDonors);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'filterAction')) {
      const a = String(body.filterAction);
      if (['allow', 'replace', 'hide_message', 'block_alert'].includes(a)) patch.filter_action = a;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'replacementText')) {
      patch.replacement_text = String(body.replacementText ?? '***').slice(0, 32) || '***';
    }
    if (Object.prototype.hasOwnProperty.call(body, 'manualApproval')) patch.manual_approval = !!body.manualApproval;
    if (Object.prototype.hasOwnProperty.call(body, 'ttsAntiSpam')) patch.tts_anti_spam = !!body.ttsAntiSpam;
    if (Object.prototype.hasOwnProperty.call(body, 'ttsEnabled')) patch.tts_enabled = !!body.ttsEnabled;
    if (Object.prototype.hasOwnProperty.call(body, 'ttsMinAmountCents')) {
      patch.tts_min_amount_cents = Math.max(0, Math.trunc(Number(body.ttsMinAmountCents) || DEFAULT_SETTINGS.ttsMinAmountCents));
    }
    if (Object.prototype.hasOwnProperty.call(body, 'ttsMonthlyCharLimit')) {
      patch.tts_monthly_char_limit = Math.min(500_000, Math.max(1000, Math.trunc(Number(body.ttsMonthlyCharLimit) || DEFAULT_SETTINGS.ttsMonthlyCharLimit)));
    }

    let { data, error: upsertErr } = await bot.from('tip_settings').upsert(patch, { onConflict: 'streamer_id' }).select('*').single();

    // Graceful fallback when extended columns (migration 024) are not applied yet.
    if (upsertErr && /column/i.test(upsertErr.message)) {
      const base: Record<string, any> = { streamer_id: streamerId, updated_at: patch.updated_at };
      if (patch.enabled !== undefined) base.enabled = patch.enabled;
      if (patch.currency !== undefined) base.currency = patch.currency;
      if (patch.min_amount_cents !== undefined) base.min_amount_cents = patch.min_amount_cents;
      if (patch.thanks_message !== undefined) base.thanks_message = patch.thanks_message;
      if (patch.stripe_account_id !== undefined) base.stripe_account_id = patch.stripe_account_id;
      ({ data, error: upsertErr } = await bot.from('tip_settings').upsert(base, { onConflict: 'streamer_id' }).select('*').single());
    }
    if (upsertErr) return error(upsertErr.message, 400, request, env);
    return json({ settings: settingsToApi(data, env) }, request, env);
  }

  // ── TTS preview (Polly Brian) ─────────────────────────────────────────────
  if (seg[0] === 'tts' && seg[1] === 'preview' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as Record<string, string>;
    const message = String(body.message ?? 'This is a test tip message.').slice(0, 500);
    const synth = await synthesizeTipTts(env, supabase, streamerId, message);
    if (!synth) return error('TTS unavailable or monthly limit reached', 503, request, env);
    return json({ url: synth.dataUrl, chars: synth.chars }, request, env);
  }

  // ── Approve / deny held tips ───────────────────────────────────────────────
  if (seg.length === 2 && seg[1] === 'approve' && method === 'POST') {
    const { data: tip } = await bot.from('tips').select('id, status').eq('streamer_id', streamerId).eq('id', seg[0]).maybeSingle();
    if (!tip) return error('Tip not found', 404, request, env);
    if (tip.status !== 'pending_approval') return error('Tip is not awaiting approval', 400, request, env);
    await finalizeTip(env, supabase, seg[0], { forceApprove: true });
    return json({ ok: true }, request, env);
  }

  if (seg.length === 2 && seg[1] === 'deny' && method === 'POST') {
    const { data: tip } = await bot.from('tips').select('id, status').eq('streamer_id', streamerId).eq('id', seg[0]).maybeSingle();
    if (!tip) return error('Tip not found', 404, request, env);
    if (tip.status !== 'pending_approval') return error('Tip is not awaiting approval', 400, request, env);
    await finalizeTip(env, supabase, seg[0], { forceDeny: true });
    return json({ ok: true }, request, env);
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  if (seg[0] && method === 'DELETE' && seg.length === 1) {
    const { data } = await bot.from('tips').delete().eq('streamer_id', streamerId).eq('id', seg[0]).select('id');
    if (!data?.length) return error('Tip not found', 404, request, env);
    return json({ ok: true }, request, env);
  }

  // ── Overview (GET /api/tips) ───────────────────────────────────────────────
  if (!seg.length && method === 'GET') {
    const [{ data: settings }, { data: recent }, { data: pending }, { data: total }, { data: board }] = await Promise.all([
      bot.from('tip_settings').select('*').eq('streamer_id', streamerId).maybeSingle(),
      bot
        .from('tips')
        .select('id, donor_name, display_donor_name, amount_cents, currency, message, display_message, status, provider, created_at, alert_suppressed, moderation_status, moderation_reason')
        .eq('streamer_id', streamerId)
        .order('created_at', { ascending: false })
        .limit(50),
      bot
        .from('tips')
        .select('id, donor_name, display_donor_name, amount_cents, currency, message, display_message, status, provider, created_at, alert_suppressed, moderation_status, moderation_reason')
        .eq('streamer_id', streamerId)
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false })
        .limit(20),
      bot.rpc('tip_total', { p_streamer_id: streamerId, p_since: null }),
      bot.rpc('tip_leaderboard', { p_streamer_id: streamerId, p_limit: 10 }),
    ]);

    const tips = (recent ?? []).map((t: Record<string, unknown>) => mapTipRow(t));
    const pendingReview = (pending ?? []).map((t: Record<string, unknown>) => mapTipRow(t));
    const leaderboard = (Array.isArray(board) ? board : []).map((r: any) => ({
      donorName: r.donor_name, totalCents: Number(r.total_cents), tipCount: Number(r.tip_count),
    }));

    return json(
      {
        settings: settingsToApi(settings, env),
        tips,
        pendingReview,
        totalCents: Number(Array.isArray(total) ? total[0] : total) || 0,
        leaderboard,
        stripeReady: !!env.STRIPE_SECRET_KEY,
      },
      request,
      env,
    );
  }

  return error('Not found', 404, request, env);
}
