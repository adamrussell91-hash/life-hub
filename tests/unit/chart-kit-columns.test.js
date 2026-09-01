import test from 'node:test';
import assert from 'node:assert/strict';
import { buildColumns } from '../../apps/life/js/app/chart-kit/columns.js';

test('buildColumns scales heights to max and preserves labels', () => {
  const chart = buildColumns([
    { key: 'breakfast', value: 10, label: 'B' },
    { key: 'lunch', value: 40, label: 'L' }
  ], { height: 100 });
  assert.equal(chart.bars[0].heightPct, 25);
  assert.equal(chart.bars[1].heightPct, 100);
  assert.equal(chart.bars[0].key, 'breakfast');
});

test('all-zero values yield zero heights without NaN', () => {
  const chart = buildColumns([{ key: 'a', value: 0, label: 'A' }], { height: 80 });
  assert.equal(chart.bars[0].heightPct, 0);
});
