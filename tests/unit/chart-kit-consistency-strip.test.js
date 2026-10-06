import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConsistencyStrip } from '../../apps/life/js/app/chart-kit/consistency-strip.js';

const values = [140, 113, 140, 70, 104, 82, 107, 143, 46, 98, 14, 92, 136, 118, 126, 126, 119, 126, 134, 81, 125, 85, 84, 125, 165, 112, 30, 30, 0, 30.4];
const month = values.map((protein_g, index) => ({
  date: `2026-09-${String(index + 1).padStart(2, '0')}`,
  protein_g,
  proteinTarget: 120,
  hitProtein: protein_g >= 120
}));

test('hits, best run and stubs come from the month', () => {
  const strip = buildConsistencyStrip(month);
  assert.equal(strip.bars.length, 30);
  assert.equal(strip.hits, 11);
  assert.equal(strip.bestRun, 2);
  assert.equal(strip.bars[28].state, 'none');
  assert.equal(strip.bars[0].state, 'hit');
  assert.equal(strip.bars[1].state, 'under');
});

test('labels fall every seven days and on the last day', () => {
  const strip = buildConsistencyStrip(month);
  assert.deepEqual(strip.bars.flatMap((bar, index) => (bar.label ? [index] : [])), [0, 7, 14, 21, 29]);
});

test('goal height is relative to the tallest of goal and bars', () => {
  const strip = buildConsistencyStrip(month);
  assert.ok(Math.abs(strip.goalPct - (120 / 165) * 100) < 1e-9);
  assert.equal(buildConsistencyStrip(month.map(day => ({ ...day, protein_g: 10 }))).goalPct, 100);
});
