/**
 * Pure command-matching logic for the chat pipeline: user-level permissions
 * (from EventSub badge set_ids), trigger/alias/regex matching, and cooldown
 * arithmetic. DB access stays in pipeline.ts so this is unit-testable.
 */

import type { UserLevel } from './moderation';

export interface CommandRow {
  id: string;
  trigger: string;
  enabled: boolean;
  cooldown: number;
  user_cooldown: number;
  user_level: string;
  responses: string[];
  response_type: string; // SAY | MENTION | REPLY
  response_mode: string; // ALL | RANDOM
  aliases: string[];
  usages: number;
  is_built_in: boolean;
  is_regex: boolean;
  last_used_at: string | null;
}

/** Pick which stored responses to send for this invocation. */
export function pickCommandResponses(
  responses: string[],
  mode: string | null | undefined,
): string[] {
  const list = responses.map((r) => String(r ?? '').trim()).filter(Boolean);
  if (list.length <= 1) return list;
  if (mode === 'RANDOM') {
    return [list[Math.floor(Math.random() * list.length)]];
  }
  return list;
}

export interface ChatEvent {
  broadcasterTwitchId: string;
  broadcasterLogin: string;
  chatterTwitchId: string;
  chatterLogin: string;
  chatterName: string;
  messageId: string;
  text: string;
  /** EventSub badge set_ids (broadcaster, moderator, vip, subscriber, founder…). */
  badges: Set<string>;
  /** Emote image URLs parsed from the message fragments, one per occurrence (for the emote-wall overlay). */
  emotes?: string[];
}

/** Map EventSub badges to the platform's user-level ladder. */
export function userLevelFromEvent(ev: ChatEvent): UserLevel {
  if (ev.badges.has('broadcaster') || ev.chatterTwitchId === ev.broadcasterTwitchId) return 'BROADCASTER';
  if (ev.badges.has('moderator')) return 'MODERATOR';
  if (ev.badges.has('vip')) return 'VIP';
  if (ev.badges.has('subscriber') || ev.badges.has('founder')) return 'SUBSCRIBER';
  return 'VIEWER';
}

/** Whether `level` satisfies a command's required user level. */
export function hasPermission(level: UserLevel, required: string): boolean {
  const order: UserLevel[] = ['VIEWER', 'SUBSCRIBER', 'VIP', 'MODERATOR', 'BROADCASTER'];
  const have = order.indexOf(level);
  const need = order.indexOf(required as UserLevel);
  return need <= 0 || have >= need;
}

export interface ParsedBang {
  trigger: string;
  args: string[];
}

/** Parse a `!trigger arg arg` message; null when not a bang command. */
export function parseBang(text: string): ParsedBang | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('!') || trimmed.length < 2) return null;
  const parts = trimmed.split(/\s+/);
  const trigger = parts[0].slice(1).toLowerCase();
  if (!trigger) return null;
  return { trigger, args: parts.slice(1) };
}

/** Find the enabled non-regex command matching a trigger or alias. */
export function matchCommand(commands: CommandRow[], trigger: string): CommandRow | null {
  return (
    commands.find(
      (c) =>
        c.enabled &&
        !c.is_regex &&
        (c.trigger.toLowerCase() === trigger ||
          (Array.isArray(c.aliases) && c.aliases.some((a) => String(a).toLowerCase() === trigger))),
    ) ?? null
  );
}

export interface RegexMatch {
  command: CommandRow;
  /** Capture groups become $(1), $(2), … */
  args: string[];
}

/** All enabled regex commands whose pattern matches the message. */
export function matchRegexCommands(commands: CommandRow[], text: string): RegexMatch[] {
  const out: RegexMatch[] = [];
  for (const c of commands) {
    if (!c.enabled || !c.is_regex) continue;
    try {
      const m = text.match(new RegExp(c.trigger, 'i'));
      if (m) out.push({ command: c, args: m.slice(1) });
    } catch {
      // invalid pattern saved by the user — skip
    }
  }
  return out;
}

/**
 * Whether a command is off global cooldown. `lastUsedAt` comes from
 * bot.commands.last_used_at (stamped by increment_command_usage).
 */
export function offGlobalCooldown(cooldownSeconds: number, lastUsedAt: string | null, now = Date.now()): boolean {
  if (!cooldownSeconds || cooldownSeconds <= 0) return true;
  if (!lastUsedAt) return true;
  return now - new Date(lastUsedAt).getTime() >= cooldownSeconds * 1000;
}

/** Whether a chatter is off their per-user cooldown for a command. */
export function offUserCooldown(userCooldownSeconds: number, usedAt: string | null, now = Date.now()): boolean {
  if (!userCooldownSeconds || userCooldownSeconds <= 0) return true;
  if (!usedAt) return true;
  return now - new Date(usedAt).getTime() >= userCooldownSeconds * 1000;
}
