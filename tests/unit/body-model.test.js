import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBodyModel,
  formatGrowthPercent,
  observationsFor,
  rangeGrowthPercent,
  rangeWindow,
  seriesInRange
} from '../../js/app/body-model.js';

test('rangeWindow covers weekly monthly and six_month', () => {
  assert.deepEqual(rangeWindow('2026-08-05', 'weekly'), {
    from: '2026-07-30',
    to: '2026-08-05',
    days: 7
  });
  assert.equal(rangeWindow('2026-08-05', 'monthly').days, 30);
  assert.equal(rangeWindow('2026-08-05', 'six_month').days, 182);
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
  const series = seriesInRange(obs, rangeWindow('2026-08-05', 'weekly'));
  assert.equal(series.length, 2);
  assert.equal(series[0].date, '2026-08-01');
});
