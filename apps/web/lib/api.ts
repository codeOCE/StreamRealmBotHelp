// Base URL of the CreatorCastle Worker API (apps/worker).
//
// In the browser we use same-origin relative paths (/api/...) so Next.js rewrites
// proxy to wrangler dev on :8787 — no CORS, cookies stay on the web origin.
// Set NEXT_PUBLIC_WORKER_URL only when the API lives on another host (prod).
//
// IMPORTANT: resolve at call time, not module load — Next bundles client code
// when `window` is undefined, so a top-level constant would stick to :8787.

/** Worker HTTP origin, resolved at runtime. Empty string = same-origin (relative URLs). */
export function getWorkerOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_WORKER_URL?.replace(/\/$/, '');
  if (explicit) return explicit;
  if (typeof window !== 'undefined') return '';
  return process.env.WORKER_SSR_URL?.replace(/\/$/, '') || 'http://127.0.0.1:8787';
}

/** @deprecated Use getWorkerOrigin() — kept for imports that expect a string getter. */
export function getWorkerUrl(): string {
  const origin = getWorkerOrigin();
  return origin || (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8787');
}

/** Build a Worker API URL, e.g. apiUrl('/api/commands'). */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = getWorkerOrigin();
  return base ? `${base}${p}` : p;
}

/** Parse a fetch Response as JSON; returns null on empty body, HTML, or plain-text errors. */
export async function parseJsonResponse(res: Response): Promise<unknown | null> {
  const text = await res.text();
  if (!text.trim()) return null;
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(text);
    } catch {
      console.warn(`Invalid JSON from ${res.url}:`, text.slice(0, 120));
      return null;
    }
  }
  if (!res.ok) {
    console.warn(`HTTP ${res.status} from ${res.url}:`, text.slice(0, 120));
  }
  return null;
}

export type FetchJsonResult = {
  data: unknown | null;
  ok: boolean;
  status: number;
  /** Human-readable failure reason when data is null or an error payload. */
  error?: string;
};

/** Same-origin fetch + safe JSON parse with status/error details. */
export async function fetchJsonDetailed(path: string, init?: RequestInit): Promise<FetchJsonResult> {
  try {
    const res = await fetch(apiUrl(path), { credentials: 'include', ...init });
    const data = await parseJsonResponse(res);
    if (data !== null) {
      if (!res.ok && typeof data === 'object' && data !== null && 'error' in data) {
        return { data, ok: false, status: res.status, error: String((data as { error: unknown }).error) };
      }
      return { data, ok: res.ok, status: res.status };
    }
    const hint = res.status === 500 || res.status === 502 || res.status === 503
      ? ' Is the worker running? (npm run dev:worker on :8787)'
      : '';
    return {
      data: null,
      ok: false,
      status: res.status,
      error: `API returned a non-JSON response (HTTP ${res.status}).${hint}`,
    };
  } catch {
    return {
      data: null,
      ok: false,
      status: 0,
      error: 'Could not reach the API. Is the worker running? (npm run dev includes it on :8787)',
    };
  }
}

/** Same-origin fetch + safe JSON parse. Returns null on network or parse failure. */
export async function fetchJson(path: string, init?: RequestInit): Promise<unknown | null> {
  const { data } = await fetchJsonDetailed(path, init);
  return data;
}

/** WebSocket origin for /api/realtime (ws:// or wss://). */
export function workerWsOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_WORKER_URL?.replace(/\/$/, '');
  if (explicit) return explicit.replace(/^http/, 'ws');
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
  return 'ws://127.0.0.1:8787';
}
