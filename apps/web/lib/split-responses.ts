/** Split pasted bulk text into separate command responses. */
export function splitResponseList(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').trim();
  if (!raw) return [];

  let lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);

  if (lines.length === 1 && lines[0].includes('|')) {
    const pipeParts = lines[0].split('|').map((p) => p.trim()).filter(Boolean);
    if (pipeParts.length > 1) lines = pipeParts;
  }

  return lines
    .map((line) =>
      line
        .replace(/^[-*•]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .trim(),
    )
    .filter(Boolean);
}

/** Parse JSON file content into response strings. */
export function parseResponsesJson(text: string): string[] {
  const parsed = JSON.parse(text) as unknown;

  if (Array.isArray(parsed)) {
    return parsed.map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object' && 'text' in item && typeof (item as { text: unknown }).text === 'string') {
        return (item as { text: string }).text.trim();
      }
      if (item && typeof item === 'object' && 'response' in item && typeof (item as { response: unknown }).response === 'string') {
        return (item as { response: string }).response.trim();
      }
      throw new Error('Array items must be strings or { text } / { response } objects.');
    }).filter(Boolean);
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.responses)) {
      return parseResponsesJson(JSON.stringify(obj.responses));
    }
    if (typeof obj.response === 'string' && obj.response.trim()) {
      return [obj.response.trim()];
    }
  }

  throw new Error('Expected a JSON array of strings or { "responses": [...] }.');
}
