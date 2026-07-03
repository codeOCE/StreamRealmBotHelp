/**
 * Collapse `$(urlfetch <url>)` / `$(customapi <url>)` calls to a bare
 * `$(customapi)` for public display — keeps the third-party URL (which may
 * carry an API key in its query string) out of a page anyone can load.
 * Paren-balanced (not a single regex) because the URL can itself contain a
 * nested variable, e.g. `$(urlfetch https://api.x.com/hug?to=$(touser))`.
 */
export function maskCustomApi(text: string): string {
  const open = /\$\(\s*(?:urlfetch|customapi)\b/gi;
  let result = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = open.exec(text))) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') depth--;
      i++;
    }
    result += text.slice(last, m.index) + '$(customapi)';
    last = i;
    open.lastIndex = i;
  }
  return result + text.slice(last);
}
