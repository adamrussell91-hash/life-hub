import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bandDomain,
  glucoseZones,
  rangeBarLayout,
  pointStatus,
  compareChartPoints,
  nextComparePins
} from '../../js/app/bloods-charts.js';

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

test('bandDomain anchors the scale on the reference range, not on the readings', () => {
  // Two markers that barely move sit in the same place on their charts, because
  // the band -- not the spread of the readings -- sets the scale.
  const calm = bandDomain({ values: [2.4, 2.5, 2.45], refLow: 2.1, refHigh: 2.6 });
  const bandShare = (calm.bandHigh - calm.bandLow) / (calm.max - calm.min);
  assert.ok(bandShare > 0.6 && bandShare < 0.7, `band filled ${bandShare} of the plot`);
  assert.equal(calm.bandLow, 2.1);
  assert.equal(calm.bandHigh, 2.6);

  const flat = bandDomain({ values: [0.87, 0.87], refLow: 0.7, refHigh: 1.1 });
  const flatShare = (flat.bandHigh - flat.bandLow) / (flat.max - flat.min);
  assert.ok(Math.abs(bandShare - flatShare) < 0.01, 'identical band padding regardless of movement');
});

test('bandDomain keeps out-of-range readings inside the plot', () => {
  const domain = bandDomain({ values: [242, 320, 117], refLow: 0, refHigh: 50 });
  assert.ok(domain.min <= 0);
  assert.ok(domain.max >= 320);
  assert.ok(domain.fraction(320) > 0.95, 'the extreme reading sits near the top with a little air');
  assert.ok(domain.fraction(117) > 0 && domain.fraction(117) < 1);
});

test('bandDomain invents a working band for an open-ended reference range', () => {
  const openLow = bandDomain({ values: [1], refHigh: 8 });
  assert.equal(openLow.bandLow, null);
  assert.equal(openLow.bandHigh, 8);
  assert.ok(openLow.min < 1, 'the reading still has room beneath it');

  const openHigh = bandDomain({ values: [86, 90], refLow: 59 });
  assert.equal(openHigh.bandHigh, null);
  assert.equal(openHigh.bandLow, 59);
  assert.ok(openHigh.max >= 90);
});

test('pointStatus judges a single draw and stays silent without limits', () => {
  assert.equal(pointStatus(23, 0, 16), 'High');
  assert.equal(pointStatus(15, 0, 16), 'Normal');
  assert.equal(pointStatus(4, 10, 30), 'Low');
  assert.equal(pointStatus(4, null, null), null);
  assert.equal(pointStatus(null, 0, 16), null);
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

test('chart viewBoxes match the aspect ratio the stylesheet gives them, so nothing is letterboxed', () => {
  const js = readFileSync(new URL('../../js/app/bloods-charts.js', import.meta.url), 'utf8');
  const read = name => Number(new RegExp(`const ${name} = (\\d+)`).exec(js)?.[1]);
  const width = read('CHART_WIDTH');
  const height = read('CHART_HEIGHT');
  const meterWidth = read('METER_WIDTH');
  const meterHeight = read('METER_HEIGHT');
  const combinedWidth = read('COMBINED_WIDTH');
  const combinedHeight = read('COMBINED_HEIGHT');
  assert.ok(width && height && meterWidth && meterHeight && combinedWidth && combinedHeight);

  const css = readFileSync(new URL('../../css/app.css', import.meta.url), 'utf8');
  for (const [selector, ratio] of [
    ['\\.bloods-metric \\.body-chart', `${width} / ${height}`],
    ['\\.bloods-row__meter \\.body-chart', `${meterWidth} / ${meterHeight}`],
    ['\\.line-chart\\.bloods-combined-strip', `${combinedWidth} / ${combinedHeight}`]
  ]) {
    assert.match(css, new RegExp(`${selector}\\s*\\{[^}]*aspect-ratio:\\s*${ratio}`), selector);
  }
});
