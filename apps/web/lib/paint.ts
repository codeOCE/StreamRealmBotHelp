// Shared "paint" model for chat-name cosmetics. A paint is a CSS gradient that
// is clipped to the username text (like 7TV paints). The browser extension
// (apps/extension) renders the exact same model on twitch.tv; keep the two in
// sync if you change the schema.

import type { CSSProperties } from 'react';

export interface PaintStop {
  color: string;
  /** Position 0–100 (%). */
  at: number;
}

export type PaintAnimation = 'none' | 'shimmer' | 'sheen' | 'rainbow';

export interface Paint {
  function: 'linear-gradient' | 'radial-gradient';
  /** Degrees, for linear-gradient. */
  angle: number;
  stops: PaintStop[];
  animation: PaintAnimation;
  /** Optional CSS text-shadow (a coloured glow). */
  shadow?: string;
}

export const DEFAULT_PAINT: Paint = {
  function: 'linear-gradient',
  angle: 90,
  stops: [
    { color: '#a855f7', at: 0 },
    { color: '#22d3ee', at: 100 },
  ],
  animation: 'shimmer',
  shadow: '',
};

/** Build the CSS gradient string for a paint. */
export function paintGradient(paint: Paint): string {
  const stops = (paint.stops?.length ? paint.stops : DEFAULT_PAINT.stops)
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((s) => `${s.color} ${Math.max(0, Math.min(100, s.at))}%`)
    .join(', ');
  if (paint.function === 'radial-gradient') return `radial-gradient(circle, ${stops})`;
  return `linear-gradient(${paint.angle ?? 90}deg, ${stops})`;
}

/**
 * Inline style that clips a gradient to text. `animation` is applied via a class
 * name (cc-paint--<animation>) whose keyframes live in PAINT_KEYFRAMES_CSS.
 */
export function paintToStyle(paint: Paint | null | undefined): CSSProperties {
  if (!paint || !paint.stops) return {};
  const animated = paint.animation && paint.animation !== 'none';
  return {
    backgroundImage: paintGradient(paint),
    backgroundSize: animated ? '200% auto' : undefined,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
    ...(paint.shadow ? { textShadow: paint.shadow, filter: `drop-shadow(${paint.shadow})` } : {}),
  };
}

/** Keyframes + animation classes shared by the dashboard preview. */
export const PAINT_KEYFRAMES_CSS = `
@keyframes cc-paint-shimmer { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
@keyframes cc-paint-sheen { 0%,60% { background-position: -50% 50%; } 100% { background-position: 150% 50%; } }
@keyframes cc-paint-rainbow { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
.cc-paint--shimmer { animation: cc-paint-shimmer 4s linear infinite; }
.cc-paint--sheen { animation: cc-paint-sheen 3.5s ease-in-out infinite; }
.cc-paint--rainbow { animation: cc-paint-rainbow 6s linear infinite; }
`;
