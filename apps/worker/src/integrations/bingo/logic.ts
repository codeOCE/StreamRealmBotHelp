/**
 * Pure bingo logic — no I/O, unit-testable on its own.
 *
 * v3 model (multi-check + image tiles):
 *  - A game's `tiles` is a list of {@link Tile} objects: `{ id, label?, image?, count }`.
 *    `count` (>=1) is how many times the event must happen for the square to clear
 *    (multi-check). `image` makes it an image tile instead of text.
 *  - A card's `cells` is a flat array (row-major) of tile **ids**; the literal
 *    'FREE' marks the free space.
 *  - A game's `called` is a map `{ [tileId]: timesCalled }` set by the creator.
 *  - A card's `marks` is a map `{ [cellIndex]: timesChecked }` set by the viewer.
 *  - A cell is "complete" when it's FREE or `marks[i] >= count(tile)`.
 *  - A BINGO claim is valid when the complete cells form the win pattern AND every
 *    complete (non-FREE) cell's tile was called at least `count` times.
 */

export const FREE = 'FREE';

export type WinCondition = 'line' | 'double_line' | 'four_corners' | 'x' | 'full';

export const WIN_PATTERNS: { id: WinCondition; label: string }[] = [
  { id: 'line', label: 'Any line' },
  { id: 'double_line', label: 'Two lines' },
  { id: 'four_corners', label: 'Four corners' },
  { id: 'x', label: 'X (both diagonals)' },
  { id: 'full', label: 'Full board' },
];

export interface Tile {
  id: string;
  label?: string;
  image?: string;
  count: number;
}

export type CalledMap = Record<string, number>; // tileId -> timesCalled
export type MarkMap = Record<string, number>; // cellIndex -> timesChecked

/** Lowercase a-z0-9 slug for deriving a stable tile id from a label. */
function slug(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tile';
}

/** Coerce a string (legacy) or partial object into a full {@link Tile}. */
export function normalizeTile(input: unknown, fallbackId: string): Tile {
  if (typeof input === 'string') {
    const label = input.trim();
    return { id: slug(label) || fallbackId, label, count: 1 };
  }
  const o = (input ?? {}) as Partial<Tile>;
  const label = o.label?.toString().trim();
  const image = o.image?.toString().trim() || undefined;
  return {
    id: (o.id?.toString().trim() || (label ? slug(label) : fallbackId)) as string,
    label: label || undefined,
    image,
    count: Math.max(1, Math.floor(Number(o.count ?? 1)) || 1),
  };
}

/** Normalize a tile list and guarantee unique, non-empty ids. */
export function normalizeTiles(tiles: unknown): Tile[] {
  const arr = Array.isArray(tiles) ? tiles : [];
  const seen = new Set<string>();
  const out: Tile[] = [];
  arr.forEach((t, i) => {
    const tile = normalizeTile(t, `tile-${i}`);
    let id = tile.id;
    let n = 2;
    while (seen.has(id)) id = `${tile.id}-${n++}`;
    seen.add(id);
    out.push({ ...tile, id });
  });
  return out;
}

export function tileMap(tiles: Tile[]): Map<string, Tile> {
  return new Map(tiles.map((t) => [t.id, t]));
}
export function tileCount(tiles: Tile[], id: string): number {
  return tiles.find((t) => t.id === id)?.count ?? 1;
}

function markCount(marks: MarkMap | undefined, i: number): number {
  if (!marks) return 0;
  return Number(marks[String(i)] ?? (marks as any)[i] ?? 0) || 0;
}
function calledCount(called: CalledMap | undefined, tileId: string): number {
  if (!called) return 0;
  return Number(called[tileId] ?? 0) || 0;
}

/** Free space only exists on odd-sized boards (the center cell). */
export function hasFreeSpace(size: number, freeSpace: boolean): boolean {
  return freeSpace && size % 2 === 1;
}

/** How many tiles a board needs (total cells minus the free space, if any). */
export function tilesNeeded(size: number, freeSpace: boolean): number {
  return size * size - (hasFreeSpace(size, freeSpace) ? 1 : 0);
}

/** Fisher–Yates shuffle (returns a new array; uses the optional rng for tests). */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a randomized card (array of tile ids) from the tile pool. Throws if the
 * pool is too small. Places FREE in the center on odd boards when freeSpace is on.
 */
export function generateCells(
  tiles: Tile[],
  size: number,
  freeSpace: boolean,
  rng: () => number = Math.random,
): string[] {
  const needed = tilesNeeded(size, freeSpace);
  if (tiles.length < needed) {
    throw new Error(`Need at least ${needed} tiles, have ${tiles.length}`);
  }
  const picked = shuffle(tiles, rng).slice(0, needed).map((t) => t.id);
  const free = hasFreeSpace(size, freeSpace);
  const centerIndex = free ? Math.floor(size / 2) * size + Math.floor(size / 2) : -1;
  const cells: string[] = [];
  let k = 0;
  for (let i = 0; i < size * size; i++) {
    cells.push(i === centerIndex ? FREE : picked[k++]);
  }
  return cells;
}

/** Per-cell completion flags from the viewer's mark counts vs tile counts. */
export function completeFlags(cells: string[], tiles: Tile[], marks: MarkMap): boolean[] {
  const counts = tileMap(tiles);
  return cells.map((cid, i) => {
    if (cid === FREE) return true;
    const need = counts.get(cid)?.count ?? 1;
    return markCount(marks, i) >= need;
  });
}

/** Side length from a flat cells array (square boards). */
function sizeOf(cells: string[]): number {
  return Math.round(Math.sqrt(cells.length));
}

/** Count how many full lines (rows + cols + the two diagonals) are complete. */
function completedLines(marked: boolean[], size: number): number {
  let count = 0;
  for (let r = 0; r < size; r++) {
    let row = true;
    let col = true;
    for (let c = 0; c < size; c++) {
      if (!marked[r * size + c]) row = false;
      if (!marked[c * size + r]) col = false;
    }
    if (row) count++;
    if (col) count++;
  }
  let diag = true;
  let anti = true;
  for (let i = 0; i < size; i++) {
    if (!marked[i * size + i]) diag = false;
    if (!marked[i * size + (size - 1 - i)]) anti = false;
  }
  if (diag) count++;
  if (anti) count++;
  return count;
}

/** Does a per-cell completion array satisfy the win pattern? */
export function patternComplete(marked: boolean[], size: number, winCondition: WinCondition): boolean {
  switch (winCondition) {
    case 'full':
      return marked.every(Boolean);
    case 'four_corners':
      return marked[0] && marked[size - 1] && marked[size * (size - 1)] && marked[size * size - 1];
    case 'x': {
      for (let i = 0; i < size; i++) {
        if (!marked[i * size + i] || !marked[i * size + (size - 1 - i)]) return false;
      }
      return true;
    }
    case 'double_line':
      return completedLines(marked, size) >= 2;
    case 'line':
    default:
      return completedLines(marked, size) >= 1;
  }
}

/** Does the card win based on the viewer's own mark counts? */
export function hasBingoFromMarks(
  cells: string[],
  tiles: Tile[],
  marks: MarkMap,
  winCondition: WinCondition,
): boolean {
  return patternComplete(completeFlags(cells, tiles, marks), sizeOf(cells), winCondition);
}

export interface ClaimResult {
  valid: boolean;
  reason?: string;
  /** Pattern is complete, but some tiles haven't been called yet — awaiting the streamer. */
  verifying?: boolean;
}

/**
 * Validate a BINGO claim. Valid only when the completed cells form the win
 * pattern AND every completed (non-FREE) cell's tile was called at least `count`
 * times (the creator's calls are the validation ground truth).
 */
export function validateClaim(
  cells: string[],
  tiles: Tile[],
  marks: MarkMap,
  called: CalledMap,
  winCondition: WinCondition,
): ClaimResult {
  const counts = tileMap(tiles);
  const complete = completeFlags(cells, tiles, marks);

  const short: string[] = [];
  cells.forEach((cid, i) => {
    if (!complete[i] || cid === FREE) return;
    const t = counts.get(cid);
    const need = t?.count ?? 1;
    if (calledCount(called, cid) < need) short.push(t?.label || t?.id || cid);
  });
  if (short.length > 0) {
    return {
      valid: false,
      verifying: true,
      reason: `Bingo verifying — waiting on: ${[...new Set(short)].slice(0, 3).join(', ')}`,
    };
  }

  if (!patternComplete(complete, sizeOf(cells), winCondition)) {
    const label = WIN_PATTERNS.find((p) => p.id === winCondition)?.label ?? 'pattern';
    return { valid: false, reason: `You haven't completed "${label}" yet` };
  }
  return { valid: true };
}
