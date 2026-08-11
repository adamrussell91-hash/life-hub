import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BODY_RANGES,
  DEFAULT_BODY_RANGE,
  aggregateSeries,
  buildBodyModel,
  formatGrowthPercent,
  observationsFor,
  rangeGrowthPercent,
  rangeWindow,
  seriesInRange
} from '../../js/app/body-model.js';

test('BODY_RANGES are month 6M year 5Y', () => {
  assert.deepEqual(BODY_RANGES, ['monthly', 'six_month', 'year', 'five_year']);
  assert.equal(DEFAULT_BODY_RANGE, 'six_month');
});

test('rangeWindow covers monthly six_month year five_year', () => {
  assert.equal(rangeWindow('2026-08-05', 'monthly').days, 30);
  assert.equal(rangeWindow('2026-08-05', 'six_month').days, 182);
  assert.equal(rangeWindow('2026-08-05', 'year').days, 365);
  assert.equal(rangeWindow('2026-08-05', 'five_year').days, 1826);
  assert.throws(() => rangeWindow('2026-08-05', 'weekly'), /Unknown body range/);
});

test('aggregateSeries monthly means use bucket end date', () => {
  const points = [
    { date: '2026-01-10', value: 90 },
    { date: '2026-01-20', value: 88 },
    { date: '2026-02-05', value: 86 }
  ];
  const monthly = aggregateSeries(points, 'monthly');
  assert.equal(monthly.length, 2);
  assert.equal(monthly[0].date, '2026-01-31');
  assert.equal(monthly[0].value, 89);
  assert.equal(monthly[1].date, '2026-02-28');
  assert.equal(monthly[1].value, 86);
});

test('aggregateSeries half_year means', () => {
  const points = [
    { date: '2024-03-01', value: 100 },
    { date: '2024-08-01', value: 90 },
    { date: '2025-02-01', value: 80 }
  ];
  const half = aggregateSeries(points, 'half_year');
  assert.equal(half.length, 3);
  assert.equal(half[0].date, '2024-06-30');
  assert.equal(half[1].date, '2024-12-31');
  assert.equal(half[2].date, '2025-06-30');
});

test('seriesInRange uses raw for monthly and monthly means for six_month', () => {
  const obs = [
    { date: '2026-03-01', value: 92 },
    { date: '2026-03-15', value: 91 },
    { date: '2026-07-01', value: 88 },
    { date: '2026-08-01', value: 86 }
  ];
  const month = seriesInRange(obs, rangeWindow('2026-08-05', 'monthly'), 'monthly');
  assert.ok(month.every(p => p.date >= '2026-07-07'));
  assert.ok(month.some(p => p.date === '2026-07-01' || p.date === '2026-08-01'));
  const six = seriesInRange(obs, rangeWindow('2026-08-05', 'six_month'), 'six_month');
  assert.ok(six.length >= 2);
  assert.ok(six.every(p => /-(28|29|30|31)$/.test(p.date)));
});

test('rangeGrowthPercent is first-to-last percent change', () => {
  assert.equal(rangeGrowthPercent([{ value: 80 }, { value: 78 }]), -2.5);
  assert.equal(rangeGrowthPercent([{ value: 10 }]), null);
  const formatted = formatGrowthPercent(-2.5, { good: 'down' });
  assert.equal(formatted.colour, 'green');
  assert.equal(formatted.label, '−2.5%');
});

test('buildBodyModel groups scale composition and tape', () => {
  const events = [
    { record: { type: 'weight', date: '2026-07-20', weight_kg: 80 }, body: '', path: 'a' },
    { record: { type: 'weight', date: '2026-08-05', weight_kg: 78 }, body: '', path: 'b' },
    { record: { type: 'composition', date: '2026-07-20', body_fat_pct: 20 }, body: '', path: 'c' },
    { record: { type: 'composition', date: '2026-08-05', body_fat_pct: 18.5 }, body: '', path: 'd' },
    { record: { type: 'measurements', date: '2026-07-20', waist: 90 }, body: '', path: 'e' },
    { record: { type: 'measurements', date: '2026-08-05', waist: 88, chest: 100 }, body: '', path: 'f' }
  ];
  const model = buildBodyModel({ events, date: '2026-08-05', range: 'monthly' });
  assert.equal(model.range, 'monthly');
  assert.equal(model.rangeLabel, 'Month');
  assert.equal(model.scale.metrics[0].latest.value, 78);
  assert.ok(model.scale.metrics[0].primaryGrowth.pct != null);
  assert.equal(model.composition.metrics[0].key, 'body_fat_pct');
  assert.ok(model.tape.metrics.some(metric => metric.key === 'waist'));
  assert.ok(model.tape.metrics.some(metric => metric.key === 'chest'));
});

test('observations and series filter to range', () => {
  const events = [
    { record: { type: 'weight', date: '2026-01-01', weight_kg: 90 }, body: '', path: 'a' },
    { record: { type: 'weight', date: '2026-08-01', weight_kg: 80 }, body: '', path: 'b' },
    { record: { type: 'weight', date: '2026-08-05', weight_kg: 79 }, body: '', path: 'c' }
  ];
  const obs = observationsFor(events, 'weight', 'weight_kg');
  const series = seriesInRange(obs, rangeWindow('2026-08-05', 'monthly'), 'monthly');
  assert.equal(series.length, 2);
  assert.equal(series[0].date, '2026-08-01');
});
