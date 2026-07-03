import { describe, it, expect } from 'vitest';
import {
  FREE,
  generateCells,
  hasBingoFromMarks,
  hasFreeSpace,
  tilesNeeded,
  validateClaim,
  completeFlags,
  normalizeTiles,
  type Tile,
  type MarkMap,
  type CalledMap,
} from '../src/integrations/bingo/logic';

const pool: Tile[] = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, label: `Tile ${i}`, count: 1 }));

/** marks map for a set of cell indices, each checked `times`. */
function marks(indices: number[], times = 1): MarkMap {
  const m: MarkMap = {};
  for (const i of indices) m[String(i)] = times;
  return m;
}
/** called map for the tiles sitting at the given cell indices. */
function calledAt(cells: string[], indices: number[], times = 1): CalledMap {
  const c: CalledMap = {};
  for (const i of indices) if (cells[i] !== FREE) c[cells[i]] = times;
  return c;
}

describe('bingo logic — tiles, generation, patterns', () => {
  it('counts tiles needed, accounting for the free space on odd boards', () => {
    expect(tilesNeeded(5, true)).toBe(24);
    expect(tilesNeeded(5, false)).toBe(25);
    expect(hasFreeSpace(5, true)).toBe(true);
    expect(hasFreeSpace(4, true)).toBe(false);
  });

  it('generates a card of tile ids with FREE in the centre of an odd board', () => {
    const cells = generateCells(pool, 5, true);
    expect(cells).toHaveLength(25);
    expect(cells[12]).toBe(FREE);
    expect(new Set(cells.filter((c) => c !== FREE)).size).toBe(24);
  });

  it('throws when the pool is too small', () => {
    expect(() => generateCells(pool.slice(0, 2), 5, true)).toThrow(/at least 24 tiles/);
  });

  it('normalizeTiles coerces strings, fills counts, and de-dupes ids', () => {
    const tiles = normalizeTiles(['First blood', 'First blood', { label: 'Ace', count: 3 }]);
    expect(tiles[0].id).not.toBe(tiles[1].id); // unique ids
    expect(tiles[2].count).toBe(3);
    expect(tiles[0].count).toBe(1);
  });

  it('hasBingoFromMarks wins on a marked row (FREE auto-counts)', () => {
    const cells = generateCells(pool, 5, false);
    expect(hasBingoFromMarks(cells, pool, marks([0, 1, 2, 3, 4]), 'line')).toBe(true);
    expect(hasBingoFromMarks(cells, pool, marks([0, 1, 2, 3]), 'line')).toBe(false);
  });

  it('four_corners / x / double_line patterns', () => {
    const cells = generateCells(pool, 5, true);
    expect(hasBingoFromMarks(cells, pool, marks([0, 4, 20, 24]), 'four_corners')).toBe(true);
    expect(hasBingoFromMarks(cells, pool, marks([0, 6, 18, 24, 4, 8, 16, 20]), 'x')).toBe(true);
    expect(hasBingoFromMarks(cells, pool, marks([0, 1, 2, 3, 4]), 'double_line')).toBe(false);
    expect(hasBingoFromMarks(cells, pool, marks([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), 'double_line')).toBe(true);
  });
});

describe('bingo logic — multi-check + claim validation', () => {
  // A 5x5 where each cell has its own tile; t0 needs 2 checks (multi-check).
  const cells = Array.from({ length: 25 }, (_, i) => `t${i}`);
  const tiles: Tile[] = cells.map((id) => ({ id, label: id, count: id === 't0' ? 2 : 1 }));

  it('a multi-check cell is only complete once checked enough times', () => {
    expect(completeFlags(cells, tiles, marks([0], 1))[0]).toBe(false); // 1 of 2
    expect(completeFlags(cells, tiles, marks([0], 2))[0]).toBe(true); // 2 of 2
  });

  it('rejects a claim when a completed tile was not called enough times', () => {
    const m = marks([0, 1, 2, 3, 4], 1); // but t0 needs 2 checks
    m['0'] = 2; // complete t0
    const called = calledAt(cells, [0, 1, 2, 3, 4], 1); // t0 only called once
    const res = validateClaim(cells, tiles, m, called, 'line');
    expect(res.valid).toBe(false);
    expect(res.verifying).toBe(true);
    expect(res.reason).toMatch(/verifying/i);
  });

  it('accepts a claim when the row is complete and every tile was called enough', () => {
    const m = marks([1, 2, 3, 4], 1);
    m['0'] = 2;
    const called = calledAt(cells, [1, 2, 3, 4], 1);
    called['t0'] = 2; // called the multi-check tile twice
    expect(validateClaim(cells, tiles, m, called, 'line')).toEqual({ valid: true });
  });

  it('rejects when called enough but the pattern is incomplete', () => {
    const m = marks([1, 2, 3], 1);
    m['0'] = 2;
    const called = { ...calledAt(cells, [1, 2, 3], 1), t0: 2 };
    const res = validateClaim(cells, tiles, m, called, 'line');
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/line/i);
  });
});
