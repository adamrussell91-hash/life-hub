import test from 'node:test';
import assert from 'node:assert/strict';
import {
  proteinBandLayout,
  tubeLayout
} from '../../js/app/bloods-instruments.js';

function marker(key, value, {
  low = 0,
  high = 100,
  series = [{ date: '2026-05-19', value }]
} = {}) {
  return {
    key,
    label: key,
    latest: {
      date: '2026-05-19',
      value,
      unit: 'g/L',
      status: value > high ? 'High' : value < low ? 'Low' : 'Normal',
      ref_low: low,
      ref_high: high
    },
    series
  };
}

test('tube layout keeps the fill and reference band inside its plot', () => {
  const layout = tubeLayout(marker('creatinine', 91, {
    low: 60,
    high: 110,
    series: [
      { date: '2026-01-28', value: 94 },
      { date: '2026-02-20', value: 91 }
    ]
  }), { height: 160, padding: 8 });

  assert.ok(layout.fillY >= 8 && layout.fillY <= 152);
  assert.ok(layout.bandY >= 8 && layout.bandY <= 152);
  assert.ok(layout.bandHeight > 0);
  assert.ok(layout.bandY + layout.bandHeight <= 152);
  assert.equal(layout.history.length, 1);
  assert.ok(layout.history[0].y >= 8 && layout.history[0].y <= 152);
});

test('tube layout clamps a flagged reading without hiding it', () => {
  const layout = tubeLayout(marker('uric_acid', 0.47, {
    low: 0.2,
    high: 0.42
  }), { height: 160, padding: 8 });

  assert.ok(layout.fillY >= 8);
  assert.ok(layout.fillY < layout.bandY, 'a high result sits above the reference band');
});

test('protein band segments are proportional to concentration', () => {
  const segments = proteinBandLayout([
    marker('alpha_1_globulin', 3),
    marker('gamma_globulin', 12)
  ]);

  assert.equal(segments.length, 2);
  assert.ok(Math.abs(segments.reduce((sum, item) => sum + item.fraction, 0) - 1) < 1e-9);
  assert.ok(segments[1].fraction > segments[0].fraction);
  assert.equal(segments[0].shortLabel, 'α1');
  assert.equal(segments[1].shortLabel, 'γ');
});

test('protein band ignores non-numeric concentrations', () => {
  const missing = marker('igg4', null);
  missing.latest.value = null;
  const segments = proteinBandLayout([missing, marker('igg1', 6.5)]);

  assert.deepEqual(segments.map(segment => segment.key), ['igg1']);
  assert.equal(segments[0].fraction, 1);
});
