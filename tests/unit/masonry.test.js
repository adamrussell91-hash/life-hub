import test from 'node:test';
import assert from 'node:assert/strict';
import { packMasonry } from '../../js/app/chart-kit/masonry.js';

test('packMasonry fills short columns and never leaves a hole', () => {
  const packed = packMasonry(
    [
      { id: 'a', height: 80, span: 1 },
      { id: 'b', height: 40, span: 1 },
      { id: 'c', height: 40, span: 1 }
    ],
    { columns: 2, gap: 12, columnWidth: 100 }
  );
  assert.equal(packed.length, 3);
  const b = packed.find(p => p.id === 'b');
  const c = packed.find(p => p.id === 'c');
  assert.equal(b.y, 0);
  assert.equal(c.y, 40 + 12);
  assert.equal(packed.find(p => p.id === 'a').x, 0);
});

test('span 2 occupies two columns when it fits', () => {
  const packed = packMasonry(
    [{ id: 'wide', height: 60, span: 2 }],
    { columns: 4, gap: 12, columnWidth: 100 }
  );
  assert.equal(packed[0].width, 100 * 2 + 12);
  assert.equal(packed[0].span, 2);
});
