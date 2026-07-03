import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { broadcast } from '../realtime';

/**
 * Giveaways — viewer chat commands.
 *
 *   !giveaway / !raffle   show the running giveaway + how to enter
 *   !enter / !join        join the open giveaway (atomic enter RPC)
 *
 * Handled directly in the chat pipeline (before custom-command lookup) so it
 * needs no seeded command rows. Entries broadcast on `giveaway:<streamerId>` so
 * the dashboard entry count + winners update live. Winners are drawn by the
 * creator from the dashboard (see routes/giveaways.ts).
 */

export const GIVEAWAY_INFO_TRIGGERS = new Set(['giveaway', 'raffle']);
export const GIVEAWAY_ENTER_TRIGGERS = new Set(['enter', 'join']);
export const GIVEAWAY_TRIGGERS = new Set([...GIVEAWAY_INFO_TRIGGERS, ...GIVEAWAY_ENTER_TRIGGERS]);

interface GiveawayCtx {
  env: Env;
  supabase: SupabaseClient;
  streamerId: string;
  viewerTwitchId: string;
  viewerName: string;
  isSubscriber: boolean;
  trigger: string;
  say: (msg: string) => Promise<unknown>;
}

const REASONS: Record<string, string> = {
  closed: 'the giveaway just closed',
  'already entered': "you're already entered",
  'no points': "you don't have enough Points to enter",
  'not enough points': "you don't have enough Points to enter",
};

/** Returns true when the message was a giveaway command (so the pipeline stops). */
export async function handleGiveawayCommand(ctx: GiveawayCtx): Promise<boolean> {
  const bot = botSchema(ctx.supabase);

  const { data: ga } = await bot
    .from('giveaways')
    .select('id, title, entry_cost, sub_luck')
    .eq('streamer_id', ctx.streamerId)
    .eq('status', 'open')
    .maybeSingle();

  if (GIVEAWAY_INFO_TRIGGERS.has(ctx.trigger)) {
    if (!ga) {
      await ctx.say('No giveaway is running right now — check back soon!');
      return true;
    }
    const { count } = await bot
      .from('giveaway_entries')
      .select('id', { count: 'exact', head: true })
      .eq('giveaway_id', ga.id);
    const cost = ga.entry_cost > 0 ? ` Entry costs ${ga.entry_cost} Points.` : '';
    await ctx.say(`🎉 "${ga.title}" is LIVE! Type !enter to join.${cost} ${count ?? 0} entered so far.`);
    return true;
  }

  // enter / join
  if (!ga) {
    await ctx.say(`@${ctx.viewerName}, there's no giveaway running right now.`);
    return true;
  }
  const weight = ctx.isSubscriber ? Math.max(1, ga.sub_luck) : 1;
  const { data, error } = await bot.rpc('enter_giveaway', {
    p_streamer_id: ctx.streamerId,
    p_giveaway_id: ga.id,
    p_viewer: ctx.viewerTwitchId,
    p_username: ctx.viewerName,
    p_weight: weight,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    await ctx.say(`@${ctx.viewerName}, couldn't enter you right now — try again.`);
    return true;
  }
  if (!row.ok) {
    await ctx.say(`@${ctx.viewerName}, ${REASONS[row.reason] ?? row.reason}.`);
    return true;
  }

  await ctx.say(`🎟️ @${ctx.viewerName} you're in! (${row.total_entries} entered)`);
  await broadcast(ctx.env, `giveaway:${ctx.streamerId}`, 'entry', {
    viewer: ctx.viewerName,
    total: row.total_entries,
  }).catch(() => undefined);
  return true;
}
