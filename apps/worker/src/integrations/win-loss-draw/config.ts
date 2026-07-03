/**
 * Default style config for a Win/Loss/Draw board, plus a deep-merge so a board's
 * stored `config` only needs to hold the overrides the creator changed. The full
 * shape is reconstructed on read (and picks up new defaults automatically).
 */

export const DEFAULT_CONFIG = {
  layout: 'horizontal' as 'horizontal' | 'vertical',
  showDraws: true,
  showTitle: true,
  showLabels: true,
  title: 'SESSION',
  labels: { win: 'W', loss: 'L', draw: 'D' },
  colors: {
    win: '#22c55e',
    loss: '#ef4444',
    draw: '#f59e0b',
    text: '#ffffff',
    title: '#94a3b8',
    background: '#0b0e14',
  },
  font: {
    family: 'Inter',
    size: 56,
    weight: 800,
    uppercase: true,
    letterSpacing: 0,
  },
  box: {
    backgroundOpacity: 0.55,
    radius: 24,
    padding: 24,
    gap: 28,
    borderWidth: 0,
    borderColor: '#ffffff',
  },
  separator: '', // text between counts, e.g. ' - '; '' = none
};

export type WldConfig = typeof DEFAULT_CONFIG;

function isPlainObject(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge `override` onto `base` (objects recurse; scalars/arrays replace). */
export function deepMerge<T extends Record<string, any>>(base: T, override: unknown): T {
  if (!isPlainObject(override)) return base;
  const out: Record<string, any> = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** Full config for a board = defaults with the stored overrides merged in. */
export function resolveConfig(stored: unknown): WldConfig {
  return deepMerge(DEFAULT_CONFIG, stored);
}
