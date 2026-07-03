export type TipFilterAction = 'allow' | 'replace' | 'hide_message' | 'block_alert';

export interface TipModerationSettings {
  profanityEnabled: boolean;
  customBlockedWords: string[];
  blockedDonors: string[];
  filterAction: TipFilterAction;
  replacementText: string;
  manualApproval: boolean;
  ttsAntiSpam: boolean;
}

export const DEFAULT_MODERATION: TipModerationSettings = {
  profanityEnabled: true,
  customBlockedWords: [],
  blockedDonors: [],
  filterAction: 'replace',
  replacementText: '***',
  manualApproval: false,
  ttsAntiSpam: true,
};

export interface ModerationResult {
  displayMessage: string;
  displayDonorName: string;
  alertSuppressed: boolean;
  requiresApproval: boolean;
  flagged: boolean;
  moderationStatus: string | null;
  moderationReason: string | null;
}

const BUILTIN_BAD_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'nigga', 'faggot', 'retard',
  'whore', 'slut', 'dick', 'cock', 'pussy', 'bastard',
];

function normalizeWordList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((w) => String(w).trim().toLowerCase())
    .filter((w) => w.length >= 2)
    .slice(0, 200);
}

export function moderationFromRow(row: Record<string, unknown> | null | undefined): TipModerationSettings {
  if (!row) return { ...DEFAULT_MODERATION };
  const action = String(row.filter_action ?? 'replace');
  const filterAction: TipFilterAction =
    action === 'allow' || action === 'hide_message' || action === 'block_alert' ? action : 'replace';
  return {
    profanityEnabled: row.profanity_enabled !== false,
    customBlockedWords: normalizeWordList(row.custom_blocked_words),
    blockedDonors: normalizeWordList(row.blocked_donors),
    filterAction,
    replacementText: String(row.replacement_text ?? '***').slice(0, 32) || '***',
    manualApproval: !!row.manual_approval,
    ttsAntiSpam: row.tts_anti_spam !== false,
  };
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordPattern(word: string) {
  if (word.includes('*')) {
    const parts = word.split('*').map(escapeRegExp).filter(Boolean);
    if (parts.length === 0) return null;
    return new RegExp(parts.join('.*'), 'i');
  }
  return new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i');
}

function containsBlockedWord(text: string, words: string[]): string | null {
  for (const word of words) {
    const pat = wordPattern(word);
    if (pat && pat.test(text)) return word;
  }
  return null;
}

function isTtsSpam(text: string): boolean {
  if (/(.)\1{7,}/i.test(text)) return true;
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length >= 4) {
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const n of counts.values()) if (n >= 4) return true;
  }
  return false;
}

function isDonorBlocked(donorName: string, blocked: string[]): boolean {
  const d = donorName.trim().toLowerCase();
  return blocked.some((b) => d === b || d.includes(b));
}

function applyFilterAction(message: string, action: TipFilterAction, replacement: string, flagged: boolean): { message: string; suppressAlert: boolean } {
  if (!flagged) return { message, suppressAlert: false };
  switch (action) {
    case 'allow':
      return { message, suppressAlert: false };
    case 'hide_message':
      return { message: '', suppressAlert: false };
    case 'block_alert':
      return { message, suppressAlert: true };
    case 'replace':
    default:
      return { message, suppressAlert: false };
  }
}

function censorMessage(message: string, words: string[], replacement: string): string {
  let out = message;
  for (const word of words) {
    const pat = wordPattern(word);
    if (!pat) continue;
    out = out.replace(pat, replacement);
  }
  return out;
}

export function moderateTip(
  settings: TipModerationSettings,
  donorName: string,
  message: string,
): ModerationResult {
  const displayDonorName = donorName.trim().slice(0, 60) || 'Anonymous';
  let flagged = false;
  let reason: string | null = null;

  if (isDonorBlocked(displayDonorName, settings.blockedDonors)) {
    return {
      displayMessage: '',
      displayDonorName,
      alertSuppressed: true,
      requiresApproval: false,
      flagged: true,
      moderationStatus: 'blocked_donor',
      moderationReason: 'Blocked donor',
    };
  }

  if (settings.manualApproval) {
    return {
      displayMessage: message,
      displayDonorName,
      alertSuppressed: true,
      requiresApproval: true,
      flagged: true,
      moderationStatus: 'pending_approval',
      moderationReason: 'Awaiting manual approval',
    };
  }

  let workingMessage = message;

  if (settings.ttsAntiSpam && isTtsSpam(workingMessage)) {
    flagged = true;
    reason = 'TTS spam pattern';
  }

  if (settings.profanityEnabled) {
    const allWords = [...BUILTIN_BAD_WORDS, ...settings.customBlockedWords];
    const hit = containsBlockedWord(workingMessage, allWords);
    if (hit) {
      flagged = true;
      reason = reason ?? `Blocked word: ${hit}`;
      if (settings.filterAction === 'replace') {
        workingMessage = censorMessage(workingMessage, allWords, settings.replacementText);
      }
    }
  }

  const filtered = applyFilterAction(workingMessage, settings.filterAction, settings.replacementText, flagged);

  return {
    displayMessage: filtered.message,
    displayDonorName,
    alertSuppressed: filtered.suppressAlert,
    requiresApproval: false,
    flagged,
    moderationStatus: flagged ? 'filtered' : 'approved',
    moderationReason: reason,
  };
}
