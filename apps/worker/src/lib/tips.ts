import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from './supabase';
import { broadcast } from '../realtime';
import { pollyConfigured, synthesizeTipTts } from './polly-tts';

async function tipSpeakMessage(
  bot: ReturnType<typeof botSchema>,
  streamerId: string,
  amountCents: number,
  message: string,
): Promise<boolean> {
  const { data } = await bot
    .from('tip_settings')
    .select('tts_enabled, tts_min_amount_cents')
    .eq('streamer_id', streamerId)
    .maybeSingle();
  if (!data?.tts_enabled) return false;
  const min = data.tts_min_amount_cents ?? 100;
  return !!message.trim() && amountCents >= min;
}

export interface CompletedTip {
  streamerId: string;
  donorName: string;
  amountCents: number;
  currency: string;
  message: string;
}

/** Fire alerts + realtime + activity log for a completed tip. Best-effort. */
export async function emitTip(env: Env, supabase: SupabaseClient, tip: CompletedTip): Promise<void> {
  const bot = botSchema(supabase);
  const amountMajor = Math.round((tip.amountCents / 100) * 100) / 100;
  const tasks: Promise<unknown>[] = [];

  tasks.push(
    (async () => {
      const { data: overlays } = await bot.from('overlays').select('id').eq('streamer_id', tip.streamerId);
      if (!overlays?.length) return;
      const shouldSpeak = await tipSpeakMessage(bot, tip.streamerId, tip.amountCents, tip.message);
      let ttsUrl: string | null = null;
      if (shouldSpeak && pollyConfigured(env)) {
        const synth = await synthesizeTipTts(env, supabase, tip.streamerId, tip.message);
        if (synth?.dataUrl) ttsUrl = synth.dataUrl;
      }
      const alert = {
        type: 'donation',
        username: tip.donorName,
        message: tip.message,
        amount: amountMajor,
        tier: '',
        ttsUrl,
        speakMessage: shouldSpeak && !ttsUrl,
      };
      await Promise.allSettled(overlays.map((o: { id: string }) => broadcast(env, `overlay:${o.id}`, 'alert', alert)));
    })(),
  );

  tasks.push(
    broadcast(env, `tips:${tip.streamerId}`, 'tip', {
      donorName: tip.donorName,
      amountCents: tip.amountCents,
      currency: tip.currency,
      message: tip.message,
    }),
  );

  tasks.push(
    (async () => {
      await bot.from('event_logs').insert({
        streamer_id: tip.streamerId,
        type: 'donation',
        data: { donor: tip.donorName, amountCents: tip.amountCents, currency: tip.currency, message: tip.message },
      });
    })(),
  );

  await Promise.allSettled(tasks);
}
