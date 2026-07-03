import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { broadcast } from '../realtime';

/**
 * Polls — viewer chat commands.
 *
 *   !poll                 show the running poll + its options
 *   !vote <n>             vote for option n (1-based in chat; one vote/viewer)
 *
 * Handled directly in the chat pipeline (before custom-command lookup). Votes
 * broadcast on `poll:<streamerId>` with the live tally so the dashboard/overlay
 * update instantly.
 */

export const POLL_INFO_TRIGGERS = new Set(['poll']);
export const POLL_VOTE_TRIGGERS = new Set(['vote']);
export const POLL_TRIGGERS = new Set([...POLL_INFO_TRIGGERS, ...POLL_VOTE_TRIGGERS]);

interface PollCtx {
  env: Env;
  supabase: SupabaseClient;
  streamerId: string;
  viewerTwitchId: string;
  viewerName: string;
  trigger: string;
  args: string[];
  say: (msg: string) => Promise<unknown>;
}

/** Returns true when the message was a poll command (so the pipeline stops). */
export async function handlePollCommand(ctx: PollCtx): Promise<boolean> {
  const bot = botSchema(ctx.supabase);

  const { data: poll } = await bot
    .from('polls')
    .select('id, question, options')
    .eq('streamer_id', ctx.streamerId)
    .eq('status', 'open')
    .maybeSingle();

  if (POLL_INFO_TRIGGERS.has(ctx.trigger)) {
    if (!poll) {
      await ctx.say('No poll is running right now.');
      return true;
    }
    const opts = (Array.isArray(poll.options) ? poll.options : []) as string[];
    const list = opts.map((o, i) => `${i + 1}) ${o}`).join('  ');
    await ctx.say(`📊 ${poll.question} — vote with !vote <number>: ${list}`.slice(0, 480));
    return true;
  }

  // vote
  if (!poll) {
    await ctx.say(`@${ctx.viewerName}, there's no poll running right now.`);
    return true;
  }
  const n = parseInt(ctx.args[0] ?? '', 10);
  const opts = (Array.isArray(poll.options) ? poll.options : []) as string[];
  if (isNaN(n) || n < 1 || n > opts.length) {
    await ctx.say(`@${ctx.viewerName}, usage: !vote <1-${opts.length}>`);
    return true;
  }

  const { data, error } = await bot.rpc('cast_poll_vote', {
    p_streamer_id: ctx.streamerId,
    p_poll_id: poll.id,
    p_viewer: ctx.viewerTwitchId,
    p_option: n - 1,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row || !row.ok) {
    // Stay quiet on bad/closed votes to avoid chat spam; only ack success.
    return true;
  }

  await broadcast(ctx.env, `poll:${ctx.streamerId}`, 'vote', {
    pollId: poll.id,
    counts: row.counts ?? [],
  }).catch(() => undefined);
  return true;
}
