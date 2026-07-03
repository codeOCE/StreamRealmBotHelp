import { describe, it, expect } from 'vitest';
import {
  EIGHT_BALL_ANSWERS,
  DAD_JOKES,
  FACTS,
  pick,
  rollDice,
  coinFlip,
  lovePercent,
} from '../src/chat/fun';

describe('fun commands', () => {
  it('pick returns a member of the pool', () => {
    for (const pool of [EIGHT_BALL_ANSWERS, DAD_JOKES, FACTS]) {
      expect(pool).toContain(pick(pool));
    }
  });

  describe('rollDice', () => {
    it('defaults to 1d6', () => {
      const r = rollDice(undefined, () => 0.999);
      expect(r?.total).toBe(6);
      const low = rollDice(undefined, () => 0);
      expect(low?.total).toBe(1);
    });

    it('accepts a bare sides count', () => {
      const r = rollDice('20', () => 0.999);
      expect(r?.total).toBe(20);
    });

    it('accepts NdM and sums rolls with detail', () => {
      const r = rollDice('2d6', () => 0.999);
      expect(r?.total).toBe(12);
      expect(r?.detail).toBe('6 + 6 = 12');
    });

    it('rejects garbage and degenerate dice', () => {
      expect(rollDice('banana')).toBeNull();
      expect(rollDice('0')).toBeNull();
      expect(rollDice('1d1')).toBeNull();
    });

    it('caps the dice count at 20', () => {
      const r = rollDice('99d6', () => 0);
      expect(r?.total).toBe(20); // 20 dice × minimum roll of 1
    });
  });

  it('coinFlip maps rand to heads/tails', () => {
    expect(coinFlip(() => 0.2)).toBe('Heads');
    expect(coinFlip(() => 0.8)).toBe('Tails');
  });

  describe('lovePercent', () => {
    it('is deterministic and order-insensitive', () => {
      expect(lovePercent('Alice', 'Bob')).toBe(lovePercent('bob', 'ALICE'));
    });

    it('stays within 0-100', () => {
      for (const pair of [['a', 'b'], ['streamer', 'viewer'], ['x', 'longername_123']]) {
        const pct = lovePercent(pair[0], pair[1]);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }
    });
  });
});
