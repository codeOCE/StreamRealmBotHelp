import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { finalizeTip } from '../lib/finalize-tip';
import { error, json } from '../lib/response';
import { normalizeTipCurrency } from '../lib/tip-currencies';

/**
 * Tipping — PUBLIC routes (no session). Reached by supporters, not the creator.
 *
 *   GET  /api/tip/:channel            tip-page config for a channel (by login)
 *   POST /api/tip/:channel/checkout   start a Stripe Checkout session (needs keys)
 *   POST /api/tips/webhook            Stripe webhook → completes the tip + alerts
 *
 * Creator-authenticated routes (settings, manual tips, leaderboard) are in tips.ts.
 */

const MIN_FLOOR = 50; // Stripe's practical minimum (~$0.50)

async function resolveStreamer(supabase: SupabaseClient, channel: string) {
  const login = channel.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
  if (!login) return null;
  const { data } = await supabase
    .from('streamers')
    .select('id, username, display_name, avatar_url')
    .eq('username', login)
    .maybeSingle();
  return data as { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
}

/** Constant-time hex compare. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a Stripe webhook signature (Stripe-Signature: t=...,v1=...). */
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(sigHeader.split(',').map((kv) => kv.split('=')) as [string, string][]);
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(hex, v1);
}

/** Create a Stripe Checkout Session via the REST API (no SDK in Workers). */
async function createCheckoutSession(
  env: Env,
  opts: { amountCents: number; currency: string; channel: string; tipId: string; streamerId: string; connectedAccount: string | null },
): Promise<{ id: string; url: string } | null> {
  const successBase = `${env.FRONTEND_URL}/tip/${encodeURIComponent(opts.channel)}`;
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', `${successBase}?status=success`);
  form.set('cancel_url', `${successBase}?status=cancelled`);
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', opts.currency.toLowerCase());
  form.set('line_items[0][price_data][unit_amount]', String(opts.amountCents));
  form.set('line_items[0][price_data][product_data][name]', `Tip to ${opts.channel}`);
  form.set('metadata[tip_id]', opts.tipId);
  form.set('metadata[streamer_id]', opts.streamerId);
  form.set('payment_intent_data[metadata][tip_id]', opts.tipId);
  // Stripe Connect destination charge — route funds to the creator's account.
  if (opts.connectedAccount) {
    form.set('payment_intent_data[transfer_data][destination]', opts.connectedAccount);
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!res.ok) {
    console.error('[tips] Stripe checkout failed:', await res.text().catch(() => ''));
    return null;
  }
  const session = (await res.json()) as { id: string; url: string };
  return session.url ? { id: session.id, url: session.url } : null;
}

export async function handleTipPublic(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response | null> {
  const bot = botSchema(supabase);

  // ── Stripe webhook ─────────────────────────────────────────────────────────
  if (path === '/api/tips/webhook' && method === 'POST') {
    if (!env.STRIPE_WEBHOOK_SECRET) return error('Webhooks not configured', 503, request, env);
    const raw = await request.text();
    const sig = request.headers.get('stripe-signature') ?? '';
    const valid = await verifyStripeSignature(raw, sig, env.STRIPE_WEBHOOK_SECRET).catch(() => false);
    if (!valid) return error('Invalid signature', 400, request, env);

    const evt = JSON.parse(raw) as { type: string; data: { object: any } };
    if (evt.type === 'checkout.session.completed') {
      const session = evt.data.object;
      const ref = session.id as string;
      const { data: tip } = await bot
        .from('tips')
        .select('id')
        .eq('provider', 'stripe')
        .eq('provider_ref', ref)
        .eq('status', 'pending')
        .maybeSingle();
      if (tip) await finalizeTip(env, supabase, tip.id);
    }
    return json({ received: true }, request, env);
  }

  // ── Public tip-page routes: /api/tip/:channel[/checkout] ─────────────────────
  if (!path.startsWith('/api/tip/')) return null;
  const seg = path.slice('/api/tip/'.length).split('/').filter(Boolean);
  const channel = decodeURIComponent(seg[0] ?? '');
  const action = seg[1];

  const streamer = await resolveStreamer(supabase, channel);
  if (!streamer) return error('Channel not found', 404, request, env);

  const { data: settings } = await bot
    .from('tip_settings')
    .select('enabled, currency, min_amount_cents, max_amount_cents, suggested_amount_cents, max_message_length, tip_presets, thanks_message, stripe_account_id, paypal_email')
    .eq('streamer_id', streamer.id)
    .maybeSingle();

  const enabled = settings ? settings.enabled : true;
  const currency = normalizeTipCurrency(settings?.currency);
  const minAmountCents = settings?.min_amount_cents ?? 100;
  const maxAmountCents = settings?.max_amount_cents ?? null;
  const suggestedAmountCents = settings?.suggested_amount_cents ?? 500;
  const maxMessageLength = settings?.max_message_length ?? 255;
  const tipPresets = (() => {
    const raw = settings?.tip_presets;
    const arr = Array.isArray(raw) ? raw : [5, 10, 25, 50];
    const nums = arr.map((v) => Math.trunc(Number(v))).filter((n) => n >= 1);
    return nums.length > 0 ? nums : [5, 10, 25, 50];
  })();

  if (!action && method === 'GET') {
    return json(
      {
        channel: streamer.username,
        displayName: streamer.display_name ?? streamer.username,
        avatarUrl: streamer.avatar_url,
        enabled,
        currency,
        minAmountCents,
        maxAmountCents,
        suggestedAmountCents,
        maxMessageLength,
        tipPresets,
        thanksMessage: settings?.thanks_message ?? 'Thank you so much for the support!',
        stripeReady: !!env.STRIPE_SECRET_KEY,
        paypalReady: !!settings?.paypal_email,
      },
      request,
      env,
    );
  }

  if (action === 'checkout' && method === 'POST') {
    if (!enabled) return error('This creator is not accepting tips right now', 403, request, env);
    if (!env.STRIPE_SECRET_KEY) return error('Card tips are not set up for this creator yet', 503, request, env);

    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const donorName = String(body.donorName ?? '').trim().slice(0, 60) || 'Anonymous';
    const message = String(body.message ?? '').slice(0, settings?.max_message_length ?? 255);
    const amountCents = Math.trunc(Number(body.amountCents) || 0);
    const maxCents = settings?.max_amount_cents ?? null;
    if (amountCents < Math.max(MIN_FLOOR, minAmountCents)) {
      return error(`Minimum tip is ${(Math.max(MIN_FLOOR, minAmountCents) / 100).toFixed(2)} ${currency}`, 400, request, env);
    }
    if (maxCents != null && amountCents > maxCents) {
      return error(`Maximum tip is ${(maxCents / 100).toFixed(2)} ${currency}`, 400, request, env);
    }

    // Create the pending tip first so the webhook has a row to complete.
    const { data: tip, error: insErr } = await bot
      .from('tips')
      .insert({ streamer_id: streamer.id, donor_name: donorName, amount_cents: amountCents, currency, message, status: 'pending', provider: 'stripe' })
      .select('id')
      .single();
    if (insErr || !tip) return error('Could not start checkout', 500, request, env);

    const session = await createCheckoutSession(env, {
      amountCents,
      currency,
      channel: streamer.username,
      tipId: tip.id,
      streamerId: streamer.id,
      connectedAccount: settings?.stripe_account_id ?? null,
    });
    if (!session) {
      await bot.from('tips').delete().eq('id', tip.id);
      return error('Payment provider error — please try again', 502, request, env);
    }
    // Stash the session id so the webhook can match + complete this tip.
    await bot.from('tips').update({ provider_ref: session.id }).eq('id', tip.id);
    return json({ url: session.url }, request, env);
  }

  return error('Not found', 404, request, env);
}
