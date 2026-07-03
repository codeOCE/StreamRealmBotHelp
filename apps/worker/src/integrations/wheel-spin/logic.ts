/**
 * Pure wheel logic — no I/O, unit-testable.
 */

export interface WheelSegment {
  label: string;
  /**
   * Relative weight; defaults to 1. Drives BOTH the win odds AND the visual
   * slice size, so creators can type "10, 30, 30, 50" for bigger/smaller
   * wedges. Zero-weight segments are never picked and render with no slice.
   */
  weight?: number;
  color?: string;
  /** Optional image rendered inside the wedge. */
  image?: string;
}

/** Effective non-negative weight used for both odds and slice size. */
export function effectiveWeight(s: WheelSegment): number {
  return Math.max(0, s.weight ?? 1);
}

/**
 * Pick a segment index by weight. Falls back to a uniform pick when all weights
 * are zero/negative. `rng` is injectable for deterministic tests.
 */
export function pickWeighted(segments: WheelSegment[], rng: () => number = Math.random): number {
  if (segments.length === 0) return -1;
  const weights = segments.map(effectiveWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return Math.floor(rng() * segments.length);
  let roll = rng() * total;
  for (let i = 0; i < segments.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return segments.length - 1;
}

export interface Arc {
  /** Degrees clockwise from the top (12 o'clock). */
  start: number;
  mid: number;
  end: number;
  sweep: number;
}

/**
 * Lay the segments out around the wheel proportional to their weights. Returns
 * one arc per segment in degrees clockwise from the top. When every weight is
 * zero the segments fall back to equal slices.
 */
export function segmentArcs(segments: WheelSegment[]): Arc[] {
  const n = segments.length;
  if (n === 0) return [];
  let weights = segments.map(effectiveWeight);
  let total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    weights = segments.map(() => 1);
    total = n;
  }
  const arcs: Arc[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const sweep = (weights[i] / total) * 360;
    const start = cursor;
    const end = cursor + sweep;
    arcs.push({ start, end, sweep, mid: start + sweep / 2 });
    cursor = end;
  }
  return arcs;
}

/**
 * Compute the next absolute rotation (deg) so the wheel-local angle
 * `targetDeg` (e.g. a segment's mid) lands under a pointer fixed at
 * `pointerAngle` degrees clockwise from the top. Spins clockwise through
 * `extraSpins` full turns first; always returns a value >= `current` so a CSS
 * transition animates forward.
 */
export function spinToAngle(
  current: number,
  targetDeg: number,
  pointerAngle = 0,
  extraSpins = 5,
): number {
  const targetWithin = (((pointerAngle - targetDeg) % 360) + 360) % 360;
  const currentMod = ((current % 360) + 360) % 360;
  const delta = ((targetWithin - currentMod + 360) % 360) + extraSpins * 360;
  return current + delta;
}

/** Normalize raw segment input from the API into clean WheelSegments. */
export function sanitizeSegments(raw: unknown): WheelSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s: any) => {
      const label = String(s?.label ?? '').trim();
      if (!label) return null;
      const seg: WheelSegment = { label: label.slice(0, 60) };
      const w = Number(s?.weight);
      if (Number.isFinite(w) && w >= 0) seg.weight = w;
      if (typeof s?.color === 'string') seg.color = s.color.slice(0, 32);
      if (typeof s?.image === 'string' && s.image) seg.image = s.image.slice(0, 512);
      return seg;
    })
    .filter((s): s is WheelSegment => s !== null);
}

// ============================================================================
// Wheel look-and-feel + behavior config (stored per-wheel; merged over defaults)
// ============================================================================

export type WheelSize = 'sm' | 'md' | 'lg' | 'xl';
export type PointerStyle = 'arrow' | 'triangle' | 'pin';

export interface WheelConfig {
  /** Overlay render size bucket. */
  size: WheelSize;
  /** Spin energy 1 (slow) … 4 (fast); maps to duration + extra turns. */
  spinSpeed: 1 | 2 | 3 | 4;
  /** Wedge outline thickness in px (0 = none). */
  strokeWidth: number;
  strokeColor: string;
  /** Remove the winning wedge from the wheel after it's selected. */
  removeOnSelect: boolean;
  pointer: {
    /** Degrees clockwise from the top where the pointer sits. */
    angle: number;
    type: 'default' | 'image';
    /** Fill for the built-in pointer. */
    color: string;
    style: PointerStyle;
    imageUrl: string | null;
  };
  centerImage: {
    enabled: boolean;
    url: string | null;
  };
  announce: {
    /** Show the winner banner on the overlay. */
    enabled: boolean;
    /** Post the result to Twitch chat as the creator. */
    chat: boolean;
    /** Sound when a result is revealed. */
    sound: { enabled: boolean; url: string | null };
    /** Looping sound while the wheel is spinning. */
    spinSound: { enabled: boolean; url: string | null };
  };
}

export const DEFAULT_WHEEL_CONFIG: WheelConfig = {
  size: 'md',
  spinSpeed: 2,
  strokeWidth: 2,
  strokeColor: 'rgba(0,0,0,0.25)',
  removeOnSelect: false,
  pointer: { angle: 0, type: 'default', color: '#ffffff', style: 'arrow', imageUrl: null },
  centerImage: { enabled: false, url: null },
  announce: {
    enabled: true,
    chat: false,
    sound: { enabled: false, url: null },
    spinSound: { enabled: false, url: null },
  },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v ? v.slice(0, max) : null;

/** Merge + clamp raw config input over the defaults. Unknown keys are dropped. */
export function sanitizeConfig(raw: unknown): WheelConfig {
  const r = (raw ?? {}) as any;
  const d = DEFAULT_WHEEL_CONFIG;
  const sizes: WheelSize[] = ['sm', 'md', 'lg', 'xl'];
  const styles: PointerStyle[] = ['arrow', 'triangle', 'pin'];
  const p = r.pointer ?? {};
  const c = r.centerImage ?? {};
  const a = r.announce ?? {};
  const aSound = a.sound ?? {};
  const aSpin = a.spinSound ?? {};
  return {
    size: sizes.includes(r.size) ? r.size : d.size,
    spinSpeed: ([1, 2, 3, 4] as const).includes(r.spinSpeed) ? r.spinSpeed : d.spinSpeed,
    strokeWidth: Number.isFinite(Number(r.strokeWidth)) ? clamp(Number(r.strokeWidth), 0, 16) : d.strokeWidth,
    strokeColor: str(r.strokeColor, 32) ?? d.strokeColor,
    removeOnSelect: Boolean(r.removeOnSelect ?? d.removeOnSelect),
    pointer: {
      angle: Number.isFinite(Number(p.angle)) ? ((Number(p.angle) % 360) + 360) % 360 : d.pointer.angle,
      type: p.type === 'image' ? 'image' : 'default',
      color: str(p.color, 32) ?? d.pointer.color,
      style: styles.includes(p.style) ? p.style : d.pointer.style,
      imageUrl: str(p.imageUrl, 512),
    },
    centerImage: {
      enabled: Boolean(c.enabled ?? d.centerImage.enabled),
      url: str(c.url, 512),
    },
    announce: {
      enabled: Boolean(a.enabled ?? d.announce.enabled),
      chat: Boolean(a.chat ?? d.announce.chat),
      sound: { enabled: Boolean(aSound.enabled ?? false), url: str(aSound.url, 512) },
      spinSound: { enabled: Boolean(aSpin.enabled ?? false), url: str(aSpin.url, 512) },
    },
  };
}

/** Map spin speed to an animation duration (seconds) for the overlay/dashboard. */
export function spinDurationSeconds(speed: number): number {
  return ({ 1: 6, 2: 4.5, 3: 3.2, 4: 2.2 } as Record<number, number>)[speed] ?? 4.5;
}

/** Map spin speed to the number of extra full turns before settling. */
export function spinExtraTurns(speed: number): number {
  return ({ 1: 3, 2: 5, 3: 7, 4: 9 } as Record<number, number>)[speed] ?? 5;
}
