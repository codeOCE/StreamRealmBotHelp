/**
 * Custom chat emote matching (the 7TV/BTTV-style emote platform).
 *
 * Pure, dependency-free helpers so the same logic is testable and shared by the
 * overlay pipeline (feeding the emote-wall) and the public API. Codes are
 * matched case-sensitively on whole whitespace-delimited tokens — exactly how
 * 7TV/BTTV resolve emotes — so "catJAM" matches but "catJAMs" does not.
 */

export interface EmoteRow {
  id: string;
  code: string;
  image_url: string;
  width: number;
  animated: boolean;
  zero_width?: boolean;
}

/** A viewer-facing emote (what the extension/overlay renders from). */
export interface PublicEmote {
  url: string;
  w: number;
  animated: boolean;
  /** zero-width: rendered stacked over the preceding emote in chat. */
  z?: boolean;
}

/**
 * Merge a channel's own emotes with emotes it added from the directory into a
 * `code -> PublicEmote` map. Own emotes are applied last-wins-off: we add `own`
 * FIRST and never let an `added` emote overwrite a code the channel already
 * defines, so a channel's own code always beats a borrowed one.
 */
export function buildEmoteMap(own: EmoteRow[], added: EmoteRow[]): Record<string, PublicEmote> {
  const map: Record<string, PublicEmote> = {};
  const pub = (e: EmoteRow): PublicEmote => ({ url: e.image_url, w: e.width, animated: e.animated, z: !!e.zero_width });
  for (const e of own) map[e.code] = pub(e);
  for (const e of added) if (!(e.code in map)) map[e.code] = pub(e);
  return map;
}

/**
 * Return the emote image URL for every emote-code occurrence in `text`, in
 * order (repeats included) — this is what the emote-wall rains. Capped so a
 * message spamming one emote can't flood the overlay.
 */
export function emoteUrlsInText(text: string, map: Record<string, PublicEmote>, limit = 25): string[] {
  if (!text) return [];
  const urls: string[] = [];
  for (const token of text.split(/\s+/)) {
    const e = map[token];
    if (e) {
      urls.push(e.url);
      if (urls.length >= limit) break;
    }
  }
  return urls;
}

/** A code is a chat-typeable token: starts alphanumeric, 2–30 of [A-Za-z0-9_]. */
export function isValidEmoteCode(code: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_]{1,29}$/.test(code);
}
