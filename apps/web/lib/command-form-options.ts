export type CommandFormData = {
  id?: string;
  trigger: string;
  responses: string[];
  responseType: 'SAY' | 'MENTION' | 'REPLY' | 'WHISPER';
  responseMode?: 'ALL' | 'RANDOM';
  aliases?: string[];
  userLevel: string;
  cooldown: number;
  userCooldown?: number;
  enabled: boolean;
  isBuiltIn?: boolean;
  description?: string;
  category?: string;
  isRegex?: boolean;
};

export const COMMAND_CATEGORIES = [
  { value: 'General', label: 'General' },
  { value: 'Moderation', label: 'Moderation' },
  { value: 'Streaming', label: 'Streaming' },
  { value: 'Loyalty', label: 'Loyalty' },
  { value: 'Utility', label: 'Utility' },
];

export const RESPONSE_TYPES = [
  { value: 'SAY', label: 'Say' },
  { value: 'MENTION', label: 'Mention' },
  { value: 'REPLY', label: 'Reply' },
  { value: 'WHISPER', label: 'Whisper' },
] as const;

export const RESPONSE_MODES = [
  { value: 'ALL', label: 'Say all' },
  { value: 'RANDOM', label: 'Random' },
] as const;

export const USER_LEVELS = [
  { value: 'VIEWER', label: 'Everyone' },
  { value: 'SUBSCRIBER', label: 'Subscribers' },
  { value: 'MODERATOR', label: 'Moderators' },
  { value: 'BROADCASTER', label: 'Broadcaster' },
];

export function userLevelLabel(value: string): string {
  return USER_LEVELS.find((l) => l.value === value)?.label ?? value;
}

export function validateCommandForm(
  data: Pick<CommandFormData, 'trigger' | 'responses' | 'isRegex' | 'isBuiltIn'>,
): string | null {
  const filteredResponses = data.responses.filter((r) => r.trim());
  if (!data.trigger.trim()) return 'Trigger is required.';
  if (filteredResponses.length === 0 && !data.isBuiltIn) return 'At least one response is required.';
  if (data.isRegex) {
    try {
      new RegExp(data.trigger);
    } catch {
      return 'Invalid regular expression.';
    }
  } else if (!/^[a-zA-Z0-9_-]+$/.test(data.trigger)) {
    return 'Trigger can only contain letters, numbers, underscores, and dashes.';
  }
  return null;
}

export function normalizeCommandPayload(
  data: CommandFormData & { usages?: number },
): Omit<CommandFormData, 'id'> & { id?: string } {
  const filteredResponses = data.responses.filter((r) => r.trim());
  return {
    id: data.id,
    trigger: data.isRegex ? data.trigger : data.trigger.toLowerCase().replace('!', ''),
    responses: filteredResponses,
    responseType: data.responseType,
    responseMode: filteredResponses.length > 1 ? (data.responseMode === 'RANDOM' ? 'RANDOM' : 'ALL') : 'ALL',
    aliases: data.isRegex ? [] : (data.aliases ?? []).map((a) => a.toLowerCase().replace('!', '').trim()).filter(Boolean),
    userLevel: data.userLevel,
    cooldown: data.cooldown,
    userCooldown: data.userCooldown,
    description: data.description,
    category: data.category,
    enabled: data.enabled,
    isBuiltIn: data.isBuiltIn ?? false,
    isRegex: data.isRegex ?? false,
  };
}
