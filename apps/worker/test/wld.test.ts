import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, deepMerge, resolveConfig } from '../src/integrations/win-loss-draw/config';

describe('win-loss-draw config', () => {
  it('deep-merges nested overrides without dropping siblings', () => {
    const merged = deepMerge(DEFAULT_CONFIG, { colors: { win: '#000' } });
    expect(merged.colors.win).toBe('#000'); // overridden
    expect(merged.colors.loss).toBe(DEFAULT_CONFIG.colors.loss); // preserved
    expect(merged.font.size).toBe(DEFAULT_CONFIG.font.size); // untouched branch
  });

  it('replaces scalars and ignores non-object overrides', () => {
    expect(deepMerge(DEFAULT_CONFIG, { showDraws: false }).showDraws).toBe(false);
    expect(deepMerge(DEFAULT_CONFIG, null).layout).toBe('horizontal');
    expect(deepMerge(DEFAULT_CONFIG, 'nope').showDraws).toBe(true);
  });

  it('does not mutate the defaults', () => {
    deepMerge(DEFAULT_CONFIG, { box: { gap: 999 } });
    expect(DEFAULT_CONFIG.box.gap).toBe(28);
  });

  it('resolveConfig fills a complete config from sparse overrides', () => {
    const full = resolveConfig({ title: 'My Run', font: { size: 80 } });
    expect(full.title).toBe('My Run');
    expect(full.font.size).toBe(80);
    expect(full.font.family).toBe(DEFAULT_CONFIG.font.family);
    expect(full.labels.win).toBe('W');
  });
});
