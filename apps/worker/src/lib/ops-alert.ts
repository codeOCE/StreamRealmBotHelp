import type { Env } from '../env';

/**
 * Fire-and-forget ops alert to a Discord/Slack incoming webhook. The point is
 * "we knew before the streamer did" — call it from the worker's top-level catch.
 * No-op when OPS_WEBHOOK_URL is unset, and it never throws (alerting must not
 * break the request it's reporting on).
 *
 * One body works for both: Discord reads `content`, Slack reads `text`.
 */
export async function reportError(env: Env, where: string, e: unknown): Promise<void> {
  const url = env.OPS_WEBHOOK_URL;
  if (!url) return;
  const detail = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  const msg = `🚨 [${env.ENVIRONMENT ?? 'worker'}] ${where}\n${detail}`.slice(0, 1800);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: msg, text: msg }),
    });
  } catch {
    /* swallow — never let alerting fail the request */
  }
}
