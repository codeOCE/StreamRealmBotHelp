/**
 * Shield Mode (hate-raid / follow-bot protection) — pure decision logic, kept
 * dependency-free so it's unit-testable without Helix/Supabase/Cloudflare. The
 * enforcement (Helix bans, audit) lives in chat/pipeline.ts.
 */

export interface ShieldSettings {
  enabled?: boolean;
  /** Block accounts younger than this many days (0 = don't check age). */
  maxAccountAgeDays?: number;
  /** Block non-followers. */
  requireFollow?: boolean;
  action?: 'timeout' | 'delete' | 'ban';
  duration?: number;
  silent?: boolean;
}

/**
 * Given what we learned about a chatter, return the reason to block them, or
 * null to let them through. `null` facts mean "unknown" (lookup failed) and
 * never trigger a block — fail open, not closed, so a Helix hiccup can't
 * mass-ban your chat.
 */
export function shieldReason(
  facts: { ageDays: number | null; following: boolean | null },
  shield: ShieldSettings,
): string | null {
  const maxAgeDays = Number(shield.maxAccountAgeDays ?? 7);
  if (maxAgeDays > 0 && facts.ageDays != null && facts.ageDays < maxAgeDays) {
    return `account ${facts.ageDays.toFixed(1)}d old (< ${maxAgeDays}d)`;
  }
  if (shield.requireFollow && facts.following === false) return 'not following';
  return null;
}
