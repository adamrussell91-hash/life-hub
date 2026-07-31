import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePeriods, downsampleWeekly, getTrend } from '../../js/core/trends.js';

const weight = { field: 'weight_kg', unit: 'kg', good: 'down', thresholds: [0.2, 0.5, 1.0] };
const steps = { field: 'steps', unit: 'steps', good: 'up', thresholds: [500, 1_000, 2_000] };

test('first observation is neutral', () => {
  assert.deepEqual(getTrend({ date: '2026-07-31', weight_kg: 86.3 }, null, weight), {
    direction: 'neutral', colour: 'neutral', intensity: 'none', label: 'First reading', delta: null
  });
});

test('old comparison includes its date and correct good direction', () => {
  const trend = getTrend(
    { date: '2026-07-31', weight_kg: 86.3 },
    { date: '2026-05-21', weight_kg: 87.5 }, weight
  );
  assert.equal(trend.direction, 'down');
  assert.equal(trend.colour, 'green');
  assert.equal(trend.intensity, 'strong');
  assert.match(trend.label, /−1.2 kg since 21 May/);
  assert.ok(Math.abs(trend.delta - (-1.2)) < 1e-12);
});

test('recent upward observation uses metric direction and omits comparison date', () => {
  assert.deepEqual(
    getTrend(
      { date: '2026-07-31', steps: 11_000 },
      { date: '2026-06-01', steps: 10_000 },
      steps
    ),
    {
      direction: 'up',
      colour: 'green',
      intensity: 'medium',
      label: '+1000.0 steps',
      delta: 1_000
    }
  );
});

test('flat observation is neutral with no intensity', () => {
  assert.deepEqual(
    getTrend(
      { date: '2026-07-31', weight_kg: 86.3 },
      { date: '2026-07-30', weight_kg: 86.3 },
      weight
    ),
    {
      direction: 'flat',
      colour: 'neutral',
      intensity: 'none',
      label: '0.0 kg',
      delta: 0
    }
  );
});

test('observation trends reject non-finite and non-number metric values', () => {
  for (const invalid of [Number.NaN, Infinity, -Infinity, '86.3']) {
    assert.throws(() => getTrend(
      { date: '2026-07-31', weight_kg: invalid },
      { date: '2026-07-30', weight_kg: 86.4 },
      weight
    ), TypeError);
    assert.throws(() => getTrend(
      { date: '2026-07-31', weight_kg: 86.3 },
      { date: '2026-07-30', weight_kg: invalid },
      weight
    ), TypeError);
  }
});

test('comparison with no previous data is neutral', () => {
  assert.deepEqual(comparePeriods(120, null, weight), {
    direction: 'neutral',
    colour: 'neutral',
    intensity: 'none',
    label: 'no prior data',
    delta: null
  });
});

test('period comparison operates on scalar aggregates', () => {
  const weightComparison = comparePeriods(85.8, 86.4, weight);
  const { delta, ...weightChip } = weightComparison;
  assert.deepEqual(weightChip, {
    direction: 'down',
    colour: 'green',
    intensity: 'medium',
    label: '−0.6 kg'
  });
  assert.ok(Math.abs(delta - (-0.6)) < 1e-12);
  assert.deepEqual(comparePeriods(12_500, 10_000, steps), {
    direction: 'up',
    colour: 'green',
    intensity: 'strong',
    label: '+2500.0 steps',
    delta: 2_500
  });
});

test('period comparisons reject non-finite and non-number aggregates', () => {
  for (const invalid of [Number.NaN, Infinity, -Infinity, '120']) {
    assert.throws(() => comparePeriods(invalid, 100, steps), TypeError);
    assert.throws(() => comparePeriods(120, invalid, steps), TypeError);
  }
});

test('weeks without observations remain null gaps', () => {
  const weekly = downsampleWeekly([
    { date: '2026-07-01', value: 80 },
    { date: '2026-07-03', value: 82 },
    { date: '2026-07-20', value: 79 }
  ], 'value');
  assert.deepEqual(weekly, [
    { date: '2026-06-29', value: 81 },
    { date: '2026-07-06', value: null },
    { date: '2026-07-13', value: null },
    { date: '2026-07-20', value: 79 }
  ]);
});

test('weekly downsampling sorts a copy without mutating caller order', () => {
  const points = [
    { date: '2026-07-20', value: 79 },
    { date: '2026-07-03', value: 82 },
    { date: '2026-07-01', value: 80 }
  ];

  assert.deepEqual(downsampleWeekly(points, 'value'), [
    { date: '2026-06-29', value: 81 },
    { date: '2026-07-06', value: null },
    { date: '2026-07-13', value: null },
    { date: '2026-07-20', value: 79 }
  ]);
  assert.deepEqual(points, [
    { date: '2026-07-20', value: 79 },
    { date: '2026-07-03', value: 82 },
    { date: '2026-07-01', value: 80 }
  ]);
});

test('weekly downsampling rejects semantically impossible date keys', () => {
  assert.throws(() => downsampleWeekly([
    { date: '2026-02-01', value: 1 },
    { date: '2026-02-30', value: 2 },
    { date: '2026-03-10', value: 3 }
  ], 'value'), TypeError);
});

test('weekly means use only available non-null observations', () => {
  assert.deepEqual(downsampleWeekly([
    { date: '2026-07-06', score: null },
    { date: '2026-07-07', score: 3 },
    { date: '2026-07-12', score: 6 }
  ], 'score'), [
    { date: '2026-07-06', value: 4.5 }
  ]);
});

test('weekly downsampling rejects present non-finite and non-number values', () => {
  for (const invalid of [Number.NaN, Infinity, -Infinity, '3']) {
    assert.throws(() => downsampleWeekly([
      { date: '2026-07-06', score: invalid }
    ], 'score'), TypeError);
  }
});

test('weekly downsampling treats null and undefined values as missing', () => {
  assert.deepEqual(downsampleWeekly([
    { date: '2026-07-06', score: null },
    { date: '2026-07-07' }
  ], 'score'), [
    { date: '2026-07-06', value: null }
  ]);
});

test('weekly output enforces the 120-point cap', () => {
  assert.throws(
    () => downsampleWeekly([
      { date: '2024-04-15', value: 1 },
      { date: '2026-08-03', value: 2 }
    ], 'value'),
    /120/
  );
  assert.equal(downsampleWeekly([
    { date: '2024-04-22', value: 1 },
    { date: '2026-08-03', value: 2 }
  ], 'value').length, 120);
});

test('weekly output rejects a millennia span before day-scale allocation', () => {
  const started = performance.now();
  assert.throws(
    () => downsampleWeekly([
      { date: '1000-01-01', value: 1 },
      { date: '9000-01-01', value: 2 }
    ], 'value'),
    error => error instanceof RangeError && /120/.test(error.message)
  );
  assert.ok(performance.now() - started < 500, 'millennia span must be rejected in constant space');
});

test('empty weekly series stays empty', () => {
  assert.deepEqual(downsampleWeekly([], 'value'), []);
});
