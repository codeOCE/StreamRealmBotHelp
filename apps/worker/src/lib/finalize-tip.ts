import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from './supabase';
import { broadcast } from '../realtime';
import { emitTip } from './tips';
import { moderateTip, moderationFromRow, type TipModerationSettings } from './tip-moderation';

type TipRow = {
  id: string;
  streamer_id: string;
  donor_name: string;
  amount_cents: number;
  currency: string;
  message: string;
  status: string;
};

async function loadModerationSettings(bot: ReturnType<typeof botSchema>, streamerId: string): Promise<TipModerationSettings> {
  const { data } = await bot.from('tip_settings').select('*').eq('streamer_id', streamerId).maybeSingle();
  return moderationFromRow(data as Record<string, unknown> | null);
}

/** Run moderation after payment and optionally fire alerts. */
export async function finalizeTip(
  env: Env,
  supabase: SupabaseClient,
  tipId: string,
  opts?: { forceApprove?: boolean; forceDeny?: boolean },
): Promise<void> {
  const bot = botSchema(supabase);
  const { data: tip } = await bot.from('tips').select('*').eq('id', tipId).maybeSingle();
  if (!tip) return;
  const row = tip as TipRow;
  if (!['pending', 'pending_approval'].includes(row.status)) return;

  const settings = await loadModerationSettings(bot, row.streamer_id);
  const modSettings = opts?.forceApprove ? { ...settings, manualApproval: false } : settings;
  const mod = moderateTip(modSettings, row.donor_name, row.message ?? '');

  if (opts?.forceDeny) {
    await bot
      .from('tips')
      .update({
        status: 'denied',
        display_message: '',
        display_donor_name: 'Anonymous',
        alert_suppressed: true,
        moderation_status: 'denied',
        moderation_reason: 'Denied by creator',
        completed_at: new Date().toISOString(),
      })
      .eq('id', tipId);
    await broadcast(env, `tips:${row.streamer_id}`, 'tip', { action: 'denied', id: tipId });
    return;
  }

  const approved = opts?.forceApprove || !mod.requiresApproval;

  if (!approved) {
    await bot
      .from('tips')
      .update({
        status: 'pending_approval',
        display_message: mod.displayMessage,
        display_donor_name: mod.displayDonorName,
        alert_suppressed: true,
        moderation_status: mod.moderationStatus,
        moderation_reason: mod.moderationReason,
        completed_at: new Date().toISOString(),
      })
      .eq('id', tipId);
    await broadcast(env, `tips:${row.streamer_id}`, 'tip', { action: 'pending_review', id: tipId });
    return;
  }

  const displayMessage = mod.displayMessage;
  const displayDonor = mod.displayDonorName;

  await bot
    .from('tips')
    .update({
      status: 'completed',
      display_message: displayMessage,
      display_donor_name: displayDonor,
      alert_suppressed: mod.alertSuppressed,
      moderation_status: opts?.forceApprove ? 'approved' : mod.moderationStatus,
      moderation_reason: mod.moderationReason,
      completed_at: new Date().toISOString(),
    })
    .eq('id', tipId);

  if (!mod.alertSuppressed) {
    await emitTip(env, supabase, {
      streamerId: row.streamer_id,
      donorName: displayDonor,
      amountCents: row.amount_cents,
      currency: row.currency,
      message: displayMessage,
    });
  } else {
    await broadcast(env, `tips:${row.streamer_id}`, 'tip', {
      donorName: displayDonor,
      amountCents: row.amount_cents,
      currency: row.currency,
      message: displayMessage,
      alertSuppressed: true,
    });
  }
}
