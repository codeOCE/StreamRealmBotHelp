/**
 * Per-widget animation system, shared by the editor canvas and the live overlay
 * so a widget animates identically in both.
 *
 * A widget stores its animation in `config.animation` (AnimationConfig). We
 * compose an entrance (one-shot) and a loop (infinite) into a single CSS
 * `animation` shorthand: the loop is delayed until the entrance finishes, and
 * because the loop is listed last it wins control of any shared property once
 * active — so the two never fight. Keyframes (`wa-*`) live in globals.css.
 *
 * Apply the returned style to a wrapper that has NO other transform (so it
 * doesn't clash with widget position/rotation).
 */

export interface AnimationConfig {
  /** entrance preset id, e.g. 'fade' | 'slide-up' (or 'none'). */
  in?: string;
  inDuration?: number; // ms
  inDelay?: number; // ms
  /** idle loop preset id, e.g. 'float' | 'pulse' (or 'none'). */
  loop?: string;
  loopDuration?: number; // ms
}

export const ENTRANCE_PRESETS = [
  { id: 'none', name: 'None' },
  { id: 'fade', name: 'Fade In' },
  { id: 'slide-up', name: 'Slide Up' },
  { id: 'slide-down', name: 'Slide Down' },
  { id: 'slide-left', name: 'Slide Left' },
  { id: 'slide-right', name: 'Slide Right' },
  { id: 'zoom', name: 'Zoom In' },
  { id: 'pop', name: 'Pop' },
  { id: 'bounce', name: 'Bounce In' },
  { id: 'flip', name: 'Flip In' },
] as const;

export const LOOP_PRESETS = [
  { id: 'none', name: 'None' },
  { id: 'float', name: 'Float' },
  { id: 'bob', name: 'Bob' },
  { id: 'pulse', name: 'Pulse' },
  { id: 'sway', name: 'Sway' },
  { id: 'glow', name: 'Glow' },
  { id: 'spin', name: 'Spin' },
] as const;

const DEFAULT_IN_DURATION = 600;
const DEFAULT_LOOP_DURATION = 2600;

/** Build the CSS `animation` shorthand for a widget's animation config. */
export function getAnimationStyle(a?: AnimationConfig): { animation?: string } {
  if (!a) return {};
  const inOn = !!a.in && a.in !== 'none';
  const loopOn = !!a.loop && a.loop !== 'none';
  const inDur = a.inDuration ?? DEFAULT_IN_DURATION;
  const inDelay = a.inDelay ?? 0;
  const loopDur = a.loopDuration ?? DEFAULT_LOOP_DURATION;

  const parts: string[] = [];
  if (inOn) parts.push(`wa-${a.in} ${inDur}ms cubic-bezier(.22,1,.36,1) ${inDelay}ms both`);
  // Loop starts after the entrance so it doesn't override the intro motion.
  if (loopOn) parts.push(`wa-${a.loop} ${loopDur}ms ease-in-out ${inOn ? inDelay + inDur : 0}ms infinite`);
  return parts.length ? { animation: parts.join(', ') } : {};
}

/** Stable key that changes when the animation config does, to replay it in the editor. */
export function animationReplayKey(a?: AnimationConfig): string {
  if (!a) return 'none';
  return `${a.in ?? 'none'}-${a.inDuration ?? ''}-${a.inDelay ?? ''}-${a.loop ?? 'none'}-${a.loopDuration ?? ''}`;
}
