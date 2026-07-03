import type { Env } from '../env';
import type { SessionUser } from './session';

/**
 * Dev-only auth bypass — fail CLOSED.
 *
 * The bypass authenticates every request as the hardcoded dev streamer, so it
 * must NEVER engage by accident in a deploy. We only bypass when either:
 *   1. it is explicitly opted in (`DEV_SKIP_AUTH=true`), or
 *   2. the frontend is unambiguously a local dev origin (localhost/127.0.0.1).
 *
 * Crucially we do NOT bypass merely because `ENVIRONMENT !== 'production'`: an
 * unset/typo'd/staging ENVIRONMENT would otherwise silently disable auth for the
 * whole platform. A deployed non-prod environment must set DEV_SKIP_AUTH=true on
 * purpose to get the bypass.
 */
export function isDevSkipAuth(env: Env): boolean {
  if (env.DEV_SKIP_AUTH === 'true') return true;
  if (env.DEV_SKIP_AUTH === 'false') return false;
  const frontend = env.FRONTEND_URL ?? '';
  return frontend.includes('localhost') || frontend.includes('127.0.0.1');
}

export function devSessionUser(env: Env): SessionUser {
  return {
    id: env.DEV_STREAMER_ID || 'c2b3c127-3611-421d-8194-a35313090986',
    twitch_id: env.DEV_TWITCH_ID || '96085876',
    username: env.DEV_USERNAME || 'codeoce',
  };
}
