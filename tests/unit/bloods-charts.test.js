import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bandDomain,
  glucoseZones,
  rangeBarLayout,
  pointStatus,
  compareChartPoints,
  nextComparePins,
  pointHoverNote,
  allowanceUsed,
  buildFbcRadial,
  buildGlucoseMap,
  buildLipidRings
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

test('pointHoverNote shows date, amount, and percent change from the last check', () => {
  const note = pointHoverNote(
    { date: '2026-05-19', value: 42 },
    { date: '2026-02-01', value: 50 },
    { unit: 'U/L' }
  );
  assert.equal(note.date, '19/05/26');
  assert.equal(note.amount, '42 U/L');
  assert.equal(note.dir, 'down');
  assert.equal(note.change, '↓16%');
  assert.match(note.label, /19\/05\/26/);
  assert.match(note.label, /42 U\/L/);
  assert.match(note.label, /↓16%/);
});

test('pointHoverNote marks a rise from the previous draw', () => {
  const note = pointHoverNote(
    { date: '2026-08-01', value: 6.2 },
    { date: '2026-02-01', value: 5 }
  );
  assert.equal(note.amount, '6.2');
  assert.equal(note.dir, 'up');
  assert.equal(note.change, '↑24%');
});

test('pointHoverNote has no percent on the first draw', () => {
  const note = pointHoverNote({ date: '2026-02-01', value: 50 });
  assert.equal(note.date, '01/02/26');
  assert.equal(note.amount, '50');
  assert.equal(note.dir, null);
  assert.equal(note.change, '');
  assert.doesNotMatch(note.label, /[↑↓%]/);
});

test('pointHoverNote treats an unchanged reading as flat', () => {
  const note = pointHoverNote(
    { date: '2026-05-19', value: 42 },
    { date: '2026-02-01', value: 42 }
  );
  assert.equal(note.dir, 'flat');
  assert.equal(note.change, '→0%');
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
  const radialWidth = read('RADIAL_WIDTH');
  const radialHeight = read('RADIAL_HEIGHT');
  const glucoseWidth = read('GLUCOSE_WIDTH');
  const glucoseHeight = read('GLUCOSE_HEIGHT');
  const ringsWidth = read('RINGS_WIDTH');
  const ringsHeight = read('RINGS_HEIGHT');
  assert.ok(width && height && meterWidth && meterHeight && combinedWidth && combinedHeight);
  assert.ok(radialWidth && radialHeight && glucoseWidth && glucoseHeight && ringsWidth && ringsHeight);

  const css = readFileSync(new URL('../../css/app.css', import.meta.url), 'utf8');
  for (const [selector, ratio] of [
    ['\\.bloods-metric \\.body-chart', `${width} / ${height}`],
    ['\\.bloods-row__meter \\.body-chart', `${meterWidth} / ${meterHeight}`],
    ['\\.line-chart\\.bloods-combined-strip', `${combinedWidth} / ${combinedHeight}`],
    ['\\.line-chart\\.bloods-fbc-radial__chart', `${radialWidth} / ${radialHeight}`],
    ['\\.line-chart\\.bloods-glucose-map__chart', `${glucoseWidth} / ${glucoseHeight}`],
    ['\\.line-chart\\.bloods-lipid-rings__chart', `${ringsWidth} / ${ringsHeight}`]
  ]) {
    assert.match(css, new RegExp(`${selector}\\s*\\{[^}]*aspect-ratio:\\s*${ratio}`), selector);
  }
  assert.match(css, /\.bloods-fbc-radial\s*\{[^}]*width:\s*min\(100%,\s*38rem\)/);
});

test('biochemistry instrument viewBoxes match their CSS geometry', () => {
  const js = readFileSync(new URL('../../js/app/bloods-instruments.js', import.meta.url), 'utf8');
  const read = name => Number(new RegExp(`(?:export )?const ${name} = (\\d+)`).exec(js)?.[1]);
  const meterWidth = read('INSTRUMENT_METER_WIDTH');
  const meterHeight = read('INSTRUMENT_METER_HEIGHT');
  const tubeWidth = read('TUBE_WIDTH');
  const tubeHeight = read('TUBE_HEIGHT');
  const proteinWidth = read('PROTEIN_WIDTH');
  const proteinHeight = read('PROTEIN_HEIGHT');
  assert.ok(meterWidth && meterHeight && tubeWidth && tubeHeight && proteinWidth && proteinHeight);

  const css = readFileSync(new URL('../../css/app.css', import.meta.url), 'utf8');
  for (const [selector, ratio] of [
    ['\\.bloods-instrument-meter\\s*', `${meterWidth} / ${meterHeight}`],
    ['\\.bloods-tube\\s*', `${tubeWidth} / ${tubeHeight}`],
    ['\\.bloods-protein-band\\s*', `${proteinWidth} / ${proteinHeight}`]
  ]) {
    assert.match(css, new RegExp(`${selector}\\{[^}]*aspect-ratio:\\s*${ratio}`), selector);
  }

  const control = css.match(/\.bloods-instrument-marker\s*\{[^}]+\}/);
  assert.ok(control, 'expected a shared interactive marker rule');
  assert.match(control[0], /min-height:\s*44px/);
  assert.match(css, /\[data-bloods-marker\]\.is-highlight\s*\{/);

  const instrumentCss = css.match(/\.bloods-instrument-groups\s*\{[\s\S]+?#body-bloods-dashboard \.line-chart\.bloods-combined-strip/);
  assert.ok(instrumentCss, 'expected one bounded instrument CSS section');
  assert.doesNotMatch(instrumentCss[0], /#[0-9a-f]{3,8}\b/i, 'instrument colours use design-kit tokens');

  const noteCss = css.match(/\.bloods-point-note\s*\{[\s\S]+?\.bloods-point-note__change\[data-dir="down"\][^}]+\}/);
  assert.ok(noteCss, 'expected a hover-note rule in the bloods chart styles');
  assert.doesNotMatch(noteCss[0], /#[0-9a-f]{3,8}\b/i, 'hover notes use design-kit tokens');
});

test('allowanceUsed is 0 at mid-band and 1 at either edge', () => {
  assert.equal(allowanceUsed({ value: 15, refLow: 10, refHigh: 20 }), 0);
  assert.equal(allowanceUsed({ value: 10, refLow: 10, refHigh: 20 }), 1);
  assert.equal(allowanceUsed({ value: 20, refLow: 10, refHigh: 20 }), 1);
  assert.ok(allowanceUsed({ value: 22, refLow: 10, refHigh: 20 }) > 1);
});

test('allowanceUsed treats a lone high as a ceiling and a lone low as a floor', () => {
  assert.equal(allowanceUsed({ value: 2.8, refHigh: 3.1 }), 2.8 / 3.1);
  assert.equal(allowanceUsed({ value: 1.3, refLow: 0.9 }), 0.9 / 1.3);
  assert.equal(allowanceUsed({ value: 1.3, refLow: 0.9, refHigh: 2, favourHigh: true }), 0.9 / 1.3);
});

test('allowanceUsed skips a reading with no usable limits', () => {
  assert.equal(allowanceUsed({ value: 12 }), null);
  assert.equal(allowanceUsed({ value: null, refLow: 1, refHigh: 2 }), null);
});

function fbcMarker(overrides = {}) {
  return {
    key: 'haemoglobin',
    label: 'Haemoglobin',
    qualitative: false,
    latest: { date: '2026-05-19', value: 151, unit: 'g/L', ref_low: 130, ref_high: 180 },
    series: [
      { date: '2026-04-10', value: 141 },
      { date: '2026-05-19', value: 151 }
    ],
    ...overrides
  };
}

test('buildFbcRadial places numeric markers on spokes and keeps a previous ghost', () => {
  const layout = buildFbcRadial([
    fbcMarker(),
    fbcMarker({
      key: 'haematocrit',
      label: 'Haematocrit',
      latest: { date: '2026-05-19', value: 0.5, unit: 'L/L', ref_low: 0.4, ref_high: 0.5 },
      series: [
        { date: '2026-02-20', value: 0.46 },
        { date: '2026-05-19', value: 0.5 }
      ]
    }),
    fbcMarker({
      key: 'hepb_sag',
      label: 'HepB sAg',
      qualitative: true,
      latest: { date: '2026-05-19', value: null, unit: 'Qualitative' },
      series: []
    })
  ]);
  assert.equal(layout.spokes.length, 2);
  assert.equal(layout.spokes[0].label, 'Haematocrit');
  assert.equal(layout.spokes[1].label, 'Haemoglobin');
  assert.equal(layout.spokes[0].used, 1);
  assert.ok(layout.spokes[0].prevUsed < 1);
  assert.notEqual(layout.spokes[0].angle, layout.spokes[1].angle);
});

test('buildGlucoseMap pairs fasting with HbA1c and captions insulin', () => {
  const layout = buildGlucoseMap([
    {
      key: 'fasting_glucose',
      latest: { date: '2026-05-19', value: 5.3, unit: 'mmol/L' },
      series: [
        { date: '2025-11-03', value: 4.6 },
        { date: '2026-02-20', value: 4.7 },
        { date: '2026-05-19', value: 5.3 }
      ]
    },
    {
      key: 'hba1c_ngsp',
      latest: { date: '2026-05-19', value: 5.0, unit: '%' },
      series: [
        { date: '2025-11-03', value: 5.6 },
        { date: '2026-02-20', value: 5.7 },
        { date: '2026-05-19', value: 5.0 }
      ]
    },
    {
      key: 'insulin',
      latest: { date: '2026-02-20', value: 7.7, unit: 'mIU/L' },
      series: [{ date: '2026-02-20', value: 7.7 }]
    }
  ]);
  assert.equal(layout.points.length, 3);
  assert.equal(layout.points[0].fasting, 4.6);
  assert.equal(layout.points[0].hba1c, 5.6);
  assert.equal(layout.points.at(-1).fasting, 5.3);
  assert.equal(layout.points.at(-1).hba1c, 5.0);
  assert.equal(layout.insulin.value, 7.7);
  assert.match(layout.insulin.caption, /7\.7/);
});

test('buildGlucoseMap converts IFCC HbA1c and stays empty without a pair', () => {
  const converted = buildGlucoseMap([
    {
      key: 'fasting_glucose',
      latest: { date: '2026-02-20', value: 4.7, unit: 'mmol/L' },
      series: [{ date: '2026-02-20', value: 4.7 }]
    },
    {
      key: 'hba1c_ifcc',
      latest: { date: '2026-02-20', value: 39, unit: 'mmol/mol' },
      series: [{ date: '2026-02-20', value: 39 }]
    }
  ]);
  assert.equal(converted.points.length, 1);
  assert.ok(Math.abs(converted.points[0].hba1c - 5.72) < 0.05);

  const empty = buildGlucoseMap([
    { key: 'fasting_glucose', latest: { value: 5.3 }, series: [{ date: '2026-05-19', value: 5.3 }] }
  ]);
  assert.equal(empty.points.length, 0);
});

test('buildLipidRings nests total, non-HDL and ratio with previous arrows', () => {
  const layout = buildLipidRings([
    {
      key: 'cholesterol',
      latest: { date: '2026-02-20', value: 4.5, unit: 'mmol/L', ref_high: 5.6 },
      series: [
        { date: '2025-11-03', value: 5.2 },
        { date: '2026-02-20', value: 4.5 }
      ]
    },
    {
      key: 'hdl',
      latest: { date: '2026-02-20', value: 1.3, unit: 'mmol/L', ref_low: 0.9 },
      series: [
        { date: '2025-11-03', value: 1.28 },
        { date: '2026-02-20', value: 1.3 }
      ]
    },
    {
      key: 'ldl',
      latest: { date: '2026-02-20', value: 2.8, unit: 'mmol/L', ref_high: 3.1 },
      series: [
        { date: '2025-11-03', value: 3.3 },
        { date: '2026-02-20', value: 2.8 }
      ]
    }
  ]);
  assert.equal(layout.rings.length, 3);
  assert.equal(layout.rings[0].id, 'total');
  assert.equal(layout.rings[0].value, 4.5);
  assert.equal(layout.rings[0].used, 4.5 / 5.6);
  assert.ok(layout.rings[0].prevUsed > layout.rings[0].used);
  assert.equal(layout.rings[0].direction, 'in');
  const segs = layout.rings[0].segs;
  assert.equal(segs.find(s => s.id === 'hdl').value, 1.3);
  assert.equal(segs.find(s => s.id === 'ldl').value, 2.8);
  assert.ok(Math.abs(segs.find(s => s.id === 'other').value - 0.4) < 0.001);
  assert.equal(layout.rings[1].id, 'non_hdl');
  assert.ok(Math.abs(layout.rings[1].value - 3.2) < 0.001);
  assert.equal(layout.rings[1].limit, 4);
  assert.equal(layout.rings[2].id, 'ratio');
  assert.ok(Math.abs(layout.rings[2].value - 4.5 / 1.3) < 0.001);
});
