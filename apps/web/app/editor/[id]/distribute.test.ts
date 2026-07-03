// Run: npx tsx "apps/web/app/editor/[id]/distribute.test.ts"
import { distributeWidgets, Widget } from './store';
import assert from 'node:assert';

const w = (id: string, x: number, width: number): Widget => ({
    id, type: 'text', x, y: 0, width, height: 10, rotation: 0,
    config: {}, styles: {}, layer: 1, isVisible: true, isLocked: false,
});

// Three 100-wide widgets between x=0 and x=500. Free space = 500-300 = 200,
// two gaps -> 100 each. Middle widget starts at 0+100+100 = 200.
const out = distributeWidgets(
    [w('a', 0, 100), w('b', 130, 100), w('c', 400, 100)],
    ['a', 'b', 'c'],
    'horizontal',
);
assert.strictEqual(out.find(x => x.id === 'b')!.x, 200);
assert.strictEqual(out.find(x => x.id === 'a')!.x, 0);   // ends stay put
assert.strictEqual(out.find(x => x.id === 'c')!.x, 400);

// Fewer than 3 selected -> unchanged.
const same = distributeWidgets([w('a', 0, 100), w('b', 50, 100)], ['a', 'b'], 'horizontal');
assert.strictEqual(same.find(x => x.id === 'b')!.x, 50);

console.log('distribute.test.ts OK');
