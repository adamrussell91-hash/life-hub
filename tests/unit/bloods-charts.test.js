import test from 'node:test';
import assert from 'node:assert/strict';
import { glucoseZones, rangeBarLayout, rangeTrackLayout, compareChartPoints, nextComparePins } from '../../js/app/bloods-charts.js';

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

test('rangeTrackLayout parks a high value on the shore past the sage band', () => {
  const layout = rangeTrackLayout({
    value: 117,
    previous: 242,
    refLow: 0,
    refHigh: 50,
    width: 320,
    padding: 16
  });
  assert.equal(layout.overflow, 'high');
  assert.ok(layout.latestX > layout.bandEndX);
  assert.ok(layout.previousX > layout.latestX);
  assert.equal(layout.arrow, 'left');
  assert.ok(layout.bandStartX < layout.bandEndX);
});

test('rangeTrackLayout omits ghost and arrow when there is no previous', () => {
  const layout = rangeTrackLayout({
    value: 15,
    refLow: 0,
    refHigh: 20,
    width: 200,
    padding: 0
  });
  assert.equal(layout.overflow, null);
  assert.equal(layout.previousX, null);
  assert.equal(layout.arrow, null);
  assert.equal(layout.latestX, layout.bandEndX * (15 / 20));
});

test('glucoseZones uses mmol/mol bands by default and percent when unit is %', () => {
  const mol = glucoseZones('mmol/mol');
  assert.equal(mol.length, 3);
  assert.equal(mol[0].to, 39);
  const pct = glucoseZones('%');
  assert.equal(pct[1].from, 5.7);
});

test('compareChartPoints names the delta, span, and intensity', () => {
  const cmp = compareChartPoints(
    { date: '2026-02-01', value: 50 },
    { date: '2026-05-19', value: 42 }
  );
  assert.equal(cmp.delta, -8);
  assert.equal(cmp.days, 107);
  assert.equal(cmp.meaningful, true);
  assert.match(cmp.label, /↓8/);
  assert.match(cmp.label, /107/);
});

test('compareChartPoints treats a tiny move as not meaningful', () => {
  const cmp = compareChartPoints(
    { date: '2026-02-01', value: 50 },
    { date: '2026-03-01', value: 50.5 }
  );
  assert.equal(cmp.meaningful, false);
  assert.equal(cmp.intensity, 'none');
});

test('nextComparePins pins two points then resets on a third', () => {
  const a = { date: '2026-01-01', value: 10 };
  const b = { date: '2026-06-01', value: 20 };
  const c = { date: '2026-08-01', value: 15 };
  assert.deepEqual(nextComparePins([], a), [a]);
  assert.deepEqual(nextComparePins([a], b), [a, b]);
  assert.deepEqual(nextComparePins([a, b], c), [c]);
});
