import type { Env } from './env';
import { createSupabaseClient, botSchema } from './lib/supabase';
import { sendChatMessage } from './lib/creator-chat';
import { getCreatorCreds } from './token-do';

/**
 * Cron-driven work. Wired to the Worker's scheduled() handler (see index.ts) by
 * a Cron Trigger in wrangler.jsonc. Replaces the always-on Node schedulers from
 * apps/api (which held one setInterval per timer in memory).
 *
 * Timer sweep: every minute, post any enabled timer whose interval has elapsed
 * AND whose channel has seen at least `chat_lines` messages since its last fire
 * (so timers stay quiet in a dead chat). The line counter is bumped per message
 * by the chat pipeline (bot.chat_activity, migration 013); each timer stores
 * the counter value at its last fire in last_fired_count.
 */

const MIN_INTERVAL_SECONDS = 60;

interface TimerRow {
  id: string;
  streamer_id: string;
  message: string;
  interval_seconds: number;
  chat_lines: number;
  last_fired_at: string | null;
  last_fired_count: number | null;
}

export async function runTimerSweep(env: Env): Promise<void> {
  const supabase = createSupabaseClient(env);
  const bot = botSchema(supabase);

  const { data, error } = await bot
    .from('timers')
    .select('id, streamer_id, message, interval_seconds, chat_lines, last_fired_at, last_fired_count')
    .eq('enabled', true);
  if (error) {
    console.error('[timers] load failed:', error.message);
    return;
  }
  const timers = (data ?? []) as TimerRow[];
  if (timers.length === 0) return;

  const now = Date.now();
  const intervalDue = timers.filter((t) => {
    const intervalMs = Math.max(MIN_INTERVAL_SECONDS, Number(t.interval_seconds) || 300) * 1000;
    const last = t.last_fired_at ? new Date(t.last_fired_at).getTime() : 0;
    return now - last >= intervalMs;
  });
  if (intervalDue.length === 0) return;

  // Chat-lines gate: fetch each affected channel's message counter once.
  const streamerIds = [...new Set(intervalDue.map((t) => t.streamer_id))];
  const { data: activity } = await bot
    .from('chat_activity')
    .select('streamer_id, message_count')
    .in('streamer_id', streamerIds);
  const counts = new Map<string, number>(
    ((activity ?? []) as { streamer_id: string; message_count: number }[]).map((a) => [
      a.streamer_id,
      Number(a.message_count),
    ]),
  );

  const due = intervalDue.filter((t) => {
    const required = Number(t.chat_lines) || 0;
    if (required <= 1) return true; // no meaningful gate
    const current = counts.get(t.streamer_id) ?? 0;
    // Never-fired timers (last_fired_count 0) still respect the gate so a
    // fresh timer doesn't post into an empty chat.
    return current - Number(t.last_fired_count ?? 0) >= required;
  });
  if (due.length === 0) return;

  // Group by streamer so creator creds (and any token refresh) are fetched once.
  const byStreamer = new Map<string, TimerRow[]>();
  for (const t of due) {
    const arr = byStreamer.get(t.streamer_id) ?? [];
    arr.push(t);
    byStreamer.set(t.streamer_id, arr);
  }

  for (const [streamerId, list] of byStreamer) {
    const creds = await getCreatorCreds(env, streamerId);
    if (!creds) continue; // creator not connected — skip their timers
    for (const t of list) {
      const sent = await sendChatMessage(env, creds, String(t.message ?? ''));
      if (sent) {
        await bot
          .from('timers')
          .update({
            last_fired_at: new Date().toISOString(),
            last_fired_count: counts.get(streamerId) ?? 0,
          })
          .eq('id', t.id);
      }
    }
  }
}
