import { describe, it, expect } from 'vitest';
import {
  pickWeighted,
  sanitizeSegments,
  sanitizeConfig,
  segmentArcs,
  spinToAngle,
  DEFAULT_WHEEL_CONFIG,
} from '../src/integrations/wheel-spin/logic';

describe('wheel logic', () => {
  it('picks by weight (deterministic rng)', () => {
    const segs = [
      { label: 'A', weight: 1 },
      { label: 'B', weight: 3 },
    ]; // total 4: roll in [0,1) -> A, [1,4) -> B
    expect(pickWeighted(segs, () => 0)).toBe(0); // roll 0.0 -> A
    expect(pickWeighted(segs, () => 0.1)).toBe(0); // roll 0.4 -> A
    expect(pickWeighted(segs, () => 0.3)).toBe(1); // roll 1.2 -> B
    expect(pickWeighted(segs, () => 0.99)).toBe(1); // roll 3.96 -> B
  });

  it('never picks a zero-weight segment', () => {
    const segs = [
      { label: 'never', weight: 0 },
      { label: 'always', weight: 1 },
    ];
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(segs[pickWeighted(segs, () => r)].label).toBe('always');
    }
  });

  it('defaults missing weights to 1 (uniform)', () => {
    const segs = [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }];
    expect(pickWeighted(segs, () => 0)).toBe(0);
    expect(pickWeighted(segs, () => 0.5)).toBe(2);
  });

  it('falls back to uniform when all weights are zero', () => {
    const segs = [{ label: 'A', weight: 0 }, { label: 'B', weight: 0 }];
    expect(pickWeighted(segs, () => 0)).toBe(0);
    expect(pickWeighted(segs, () => 0.99)).toBe(1);
  });

  it('sanitizes raw segment input', () => {
    const out = sanitizeSegments([
      { label: '  Win  ', weight: 2, color: '#fff' },
      { label: '' }, // dropped (no label)
      { label: 'NoWeight' },
      { label: 'Neg', weight: -5 }, // weight dropped (negative)
      'garbage',
    ]);
    expect(out).toEqual([
      { label: 'Win', weight: 2, color: '#fff' },
      { label: 'NoWeight' },
      { label: 'Neg' },
    ]);
  });

  it('keeps a segment image when provided', () => {
    const out = sanitizeSegments([{ label: 'Pic', image: 'https://x/y.png' }]);
    expect(out[0].image).toBe('https://x/y.png');
  });
});

describe('wheel geometry', () => {
  it('lays equal slices when weights are absent', () => {
    const arcs = segmentArcs([{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }]);
    expect(arcs.map((a) => a.sweep)).toEqual([90, 90, 90, 90]);
    expect(arcs[0].mid).toBe(45);
    expect(arcs[3].end).toBeCloseTo(360);
  });

  it('sizes slices proportional to weight', () => {
    const arcs = segmentArcs([{ label: 'A', weight: 10 }, { label: 'B', weight: 30 }]);
    expect(arcs[0].sweep).toBeCloseTo(90); // 10/40
    expect(arcs[1].sweep).toBeCloseTo(270); // 30/40
  });

  it('falls back to equal slices when all weights are zero', () => {
    const arcs = segmentArcs([{ label: 'A', weight: 0 }, { label: 'B', weight: 0 }]);
    expect(arcs.map((a) => a.sweep)).toEqual([180, 180]);
  });

  it('spinToAngle lands the target under a top pointer and always moves forward', () => {
    // target mid at 90°, pointer at top (0): rotation so 90 -> 0 means +270 within turn.
    const next = spinToAngle(0, 90, 0, 5);
    expect(next).toBe(270 + 5 * 360);
    // resulting orientation places the target at the pointer angle
    expect(((90 + next) % 360 + 360) % 360).toBe(0);
    expect(next).toBeGreaterThan(0);
  });

  it('spinToAngle honors a non-zero pointer angle', () => {
    const next = spinToAngle(0, 90, 90, 0);
    expect(((90 + next) % 360 + 360) % 360).toBe(90);
  });
});

describe('wheel config', () => {
  it('returns defaults for empty/garbage input', () => {
    expect(sanitizeConfig(undefined)).toEqual(DEFAULT_WHEEL_CONFIG);
    expect(sanitizeConfig('nope')).toEqual(DEFAULT_WHEEL_CONFIG);
  });

  it('clamps and normalizes values', () => {
    const c = sanitizeConfig({
      size: 'huge',
      spinSpeed: 9,
      strokeWidth: 999,
      removeOnSelect: 1,
      pointer: { angle: 400, type: 'image', style: 'bogus', imageUrl: 'u' },
      announce: { chat: true, sound: { enabled: true, url: 's' } },
    });
    expect(c.size).toBe('md'); // invalid -> default
    expect(c.spinSpeed).toBe(2); // invalid -> default
    expect(c.strokeWidth).toBe(16); // clamped
    expect(c.removeOnSelect).toBe(true);
    expect(c.pointer.angle).toBe(40); // 400 % 360
    expect(c.pointer.type).toBe('image');
    expect(c.pointer.style).toBe('arrow'); // invalid -> default
    expect(c.announce.chat).toBe(true);
    expect(c.announce.sound).toEqual({ enabled: true, url: 's' });
  });
});
