/**
 * Chat moderation rule evaluation — ported from the NestJS ModerationService
 * (apps/api/src/bot/moderation.service.ts). Pure: given the streamer's enabled
 * rules and a message, decide whether it violates one and what action to take.
 * The pipeline executes the action via Helix (bans/timeouts) and handles
 * permits (which moved from process memory to bot.permits).
 */

export type UserLevel = 'VIEWER' | 'SUBSCRIBER' | 'VIP' | 'MODERATOR' | 'BROADCASTER';

export interface ModRule {
  id: string;
  type: string; // CAPS | LINKS | SPAM | SYMBOLS | EMOTES | BANNED_WORDS
  enabled: boolean;
  settings: {
    threshold?: number;
    /** BANNED_WORDS: plain substrings, `*` wildcards, or `/regex/` entries. */
    words?: string[];
    /** LINKS: domains that never trip the filter (suffix match, e.g. "youtube.com"). */
    allowedDomains?: string[];
    bypassLevel?: string;
    minLength?: number;
    action?: 'DELETE' | 'TIMEOUT' | 'BAN' | 'WARN';
    duration?: number;
    silent?: boolean;
    customMsg?: string;
  } | null;
}

export interface Violation {
  rule: ModRule;
  action: 'DELETE' | 'TIMEOUT' | 'BAN' | 'WARN';
  duration: number;
  silent: boolean;
  feedback: string;
}

const LEVEL_RANK: Record<string, number> = {
  VIEWER: 0,
  SUBSCRIBER: 1,
  VIP: 1, // bypassLevel compat: VIP treated alongside SUBSCRIBER as in old ranks
  MODERATOR: 2,
  BROADCASTER: 3,
};

export function levelRank(level: string): number {
  return LEVEL_RANK[level] ?? 0;
}

/**
 * First violated rule, or null when the message is clean.
 * `emoteCount` is the real emote count from EventSub message fragments; when
 * absent (dev simulator) the EMOTES rule falls back to an ALL-CAPS heuristic.
 */
export function evaluateRules(
  rules: ModRule[],
  message: string,
  userLevel: UserLevel,
  emoteCount?: number,
): Violation | null {
  const userRank = levelRank(userLevel);
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const settings = rule.settings ?? {};
    if (settings.bypassLevel && userRank >= levelRank(settings.bypassLevel)) continue;
    if (settings.minLength && message.length < settings.minLength) continue;
    if (!checkRule(rule.type, settings, message, emoteCount)) continue;

    return {
      rule,
      action: settings.action || 'TIMEOUT',
      duration: settings.duration || 600,
      silent: settings.silent || false,
      feedback: settings.customMsg || defaultWarning(rule.type),
    };
  }
  return null;
}

export function defaultWarning(type: string): string {
  switch (type) {
    case 'CAPS': return 'please stop using excessive caps!';
    case 'LINKS': return 'links are not allowed in this channel.';
    case 'SPAM': return 'stop spamming, please.';
    case 'SYMBOLS': return 'too many symbols!';
    case 'EMOTES': return 'too many emotes!';
    case 'BANNED_WORDS': return 'that word is not allowed here.';
    default: return 'please follow the chat rules.';
  }
}

function checkRule(
  type: string,
  settings: NonNullable<ModRule['settings']>,
  message: string,
  emoteCount?: number,
): boolean {
  const threshold = settings.threshold ?? 0.7;
  switch (type) {
    case 'CAPS': return isExcessiveCaps(message, threshold);
    case 'LINKS': return containsLinks(message, settings.allowedDomains || []);
    case 'SPAM': return isSpam(message, threshold);
    case 'SYMBOLS': return isExcessiveSymbols(message, threshold);
    case 'EMOTES': return isExcessiveEmotes(message, threshold, emoteCount);
    case 'BANNED_WORDS': return hasBannedWords(message, settings.words || []);
    default: return false;
  }
}

/** Thresholds > 1 are percentages (seeded defaults: CAPS 70, SYMBOLS 50). */
function ratio(threshold: number): number {
  return threshold > 1 ? threshold / 100 : threshold;
}

function isExcessiveCaps(message: string, threshold: number): boolean {
  if (message.length === 0) return false;
  const caps = message.replace(/[^A-Z]/g, '').length;
  return caps / message.length > ratio(threshold);
}

/** True when the message has a link whose host is NOT on the allowlist.
 *  Allowlist entries match the host or any subdomain ("youtube.com" allows
 *  "www.youtube.com" but not "notyoutube.com"). */
function containsLinks(message: string, allowedDomains: string[]): boolean {
  const urls = message.match(/https?:\/\/[^\s]+/g);
  if (!urls) return false;
  if (!allowedDomains.length) return true;
  const allowed = allowedDomains.map((d) => d.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean);
  return urls.some((u) => {
    let host: string;
    try {
      host = new URL(u).hostname.toLowerCase();
    } catch {
      return true; // unparseable → treat as a link
    }
    return !allowed.some((d) => host === d || host.endsWith('.' + d));
  });
}

/** Threshold > 1 = max times any single word may repeat (seeded default 4);
 *  <= 1 = repeated-word ratio. */
function isSpam(message: string, threshold: number): boolean {
  const words = message.trim().toLowerCase().split(/\s+/);
  if (words.length < 3) return false;
  if (threshold > 1) {
    const counts = new Map<string, number>();
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    return Math.max(...counts.values()) > threshold;
  }
  const unique = new Set(words).size;
  return 1 - unique / words.length > threshold;
}

function isExcessiveSymbols(message: string, threshold: number): boolean {
  if (message.length === 0) return false;
  const symbols = message.replace(/[a-zA-Z0-9\s]/g, '').length;
  return symbols / message.length > ratio(threshold);
}

/** Threshold > 1 = max emotes per message (seeded default 10); <= 1 = emote/word ratio. */
function isExcessiveEmotes(message: string, threshold: number, emoteCount?: number): boolean {
  const words = message.trim().split(/\s+/);
  if (words.length === 0) return false;
  const count =
    typeof emoteCount === 'number'
      ? emoteCount
      // No fragment data (dev simulator) — heuristic: emote names look like CAPS tokens.
      : words.filter((w) => w.length > 2 && w === w.toUpperCase()).length;
  return threshold > 1 ? count > threshold : count / words.length > threshold;
}

/** Entry syntax: `/pattern/` = case-insensitive regex, `*` = wildcard, else substring. */
function hasBannedWords(message: string, banned: string[]): boolean {
  if (!banned.length) return false;
  const lower = message.toLowerCase();
  return banned.some((word) => {
    const w = word.trim();
    if (!w || w.length > 200) return false;
    if (w.length > 2 && w.startsWith('/') && w.endsWith('/')) {
      try {
        return new RegExp(w.slice(1, -1), 'i').test(message);
      } catch {
        return false; // invalid regex entry — ignore rather than block everything
      }
    }
    if (w.includes('*')) {
      const pattern = w.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^\\s]*');
      try {
        return new RegExp(pattern, 'i').test(message);
      } catch {
        return false;
      }
    }
    return lower.includes(w.toLowerCase());
  });
}
