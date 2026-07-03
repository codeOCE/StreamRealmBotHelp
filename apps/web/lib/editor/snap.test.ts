// Run: npx tsx apps/web/lib/editor/snap.test.ts
import { computeSnap } from './snap';
import assert from 'node:assert';

const C = 1000;

// Left edge near canvas left (0) -> snaps to 0, guide at x:0.
let r = computeSnap({ x: 4, y: 200, w: 100, h: 50 }, [], C, C, 6);
assert.strictEqual(r.dx, -4);
assert.deepStrictEqual(r.guides.find(g => g.axis === 'x'), { axis: 'x', pos: 0 });

// Centre near canvas centre -> snaps box centre to 500.
r = computeSnap({ x: 448, y: 0, w: 100, h: 10 }, [], C, C, 6);
assert.strictEqual(r.dx, 2); // centre 498 -> 500

// Out of threshold -> no movement, no guide.
r = computeSnap({ x: 40, y: 40, w: 100, h: 100 }, [], C, C, 6);
assert.strictEqual(r.dx, 0);
assert.strictEqual(r.dy, 0);
assert.strictEqual(r.guides.length, 0);

// Snaps to another widget's left edge.
r = computeSnap({ x: 303, y: 0, w: 50, h: 50 }, [{ x: 300, y: 600, w: 80, h: 80 }], C, C, 6);
assert.strictEqual(r.dx, -3);

console.log('snap.test.ts OK');
