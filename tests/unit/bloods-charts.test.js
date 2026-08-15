import test from 'node:test';
import assert from 'node:assert/strict';
import { glucoseZones, rangeBarLayout } from '../../js/app/bloods-charts.js';

test('rangeBarLayout places an in-range value between the ends', () => {
  const layout = rangeBarLayout(20, 10, 30, { width: 320, padding: 10 });
  assert.equal(layout.clamped, false);
  assert.equal(layout.x, 10 + 0.5 * 300);
});

test('rangeBarLayout clamps values outside the reference range', () => {
  const high = rangeBarLayout(50, 10, 30, { width: 200, padding: 0 });
  assert.equal(high.clamped, true);
  assert.equal(high.overflow, 'high');
  assert.equal(high.x, 200);
  const low = rangeBarLayout(0, 10, 30, { width: 200, padding: 0 });
  assert.equal(low.overflow, 'low');
  assert.equal(low.x, 0);
});

test('glucoseZones uses mmol/mol bands by default and percent when unit is %', () => {
  const mol = glucoseZones('mmol/mol');
  assert.equal(mol.length, 3);
  assert.equal(mol[0].to, 39);
  const pct = glucoseZones('%');
  assert.equal(pct[1].from, 5.7);
});
