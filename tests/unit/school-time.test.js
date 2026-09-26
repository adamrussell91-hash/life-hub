import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTimeScale,
  holidayRuns,
  isHoliday,
  mondayOf,
  termAt,
  termWeek,
  weekLabel
} from '../../packages/design-kit/js/school-time.js';

const TERMS = [
  { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
  { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
];

test('labels weeks from the Monday of the week the term starts', () => {
  assert.equal(weekLabel('2026-07-21', TERMS), 'T3 W1');
  assert.equal(weekLabel('2026-09-22', TERMS), 'T3 W10');
  assert.equal(weekLabel('2026-10-13', TERMS), 'T4 W1');
  assert.equal(weekLabel('2026-10-26', TERMS), 'T4 W3');
  assert.equal(termWeek('2026-10-26', TERMS), 3);
  assert.equal(weekLabel('2026-12-17', TERMS), 'T4 W10');
});

test('finds holidays between and after terms', () => {
  assert.equal(isHoliday('2026-09-28', TERMS), true);
  assert.equal(isHoliday('2026-10-12', TERMS), true);
  assert.equal(isHoliday('2026-10-13', TERMS), false);
  assert.equal(weekLabel('2026-09-28', TERMS), 'Hol W1');
  assert.equal(weekLabel('2026-10-01', TERMS), 'Hol W1');
  assert.equal(weekLabel('2026-10-05', TERMS), 'Hol W2');
  assert.equal(termWeek('2026-10-05', TERMS), null);
  assert.equal(termAt('2026-12-20', TERMS), null);
});

test('never treats days as holidays when no terms are set', () => {
  assert.equal(isHoliday('2026-10-01', []), false);
});

test('finds Mondays', () => {
  assert.equal(mondayOf('2026-09-22'), '2026-09-21');
  assert.equal(mondayOf('2026-09-27'), '2026-09-21');
  assert.equal(mondayOf('2026-09-21'), '2026-09-21');
});

test('compresses holiday days to a quarter width by default', () => {
  const scale = buildTimeScale({ start: '2026-09-21', end: '2026-10-18', terms: TERMS, dayWidth: 10 });
  const term = scale.days.find((d) => d.key === '2026-09-22');
  const hol = scale.days.find((d) => d.key === '2026-10-01');
  assert.equal(term.w, 10);
  assert.equal(hol.w, 2.5);
});

test('shows holidays at full width when asked', () => {
  const full = buildTimeScale({ start: '2026-09-21', end: '2026-10-18', terms: TERMS, dayWidth: 10, holidayFactor: 1 });
  assert.equal(full.width, 28 * 10);
});

test('round-trips date to x to date for every day', () => {
  const scale = buildTimeScale({ start: '2026-09-21', end: '2026-10-18', terms: TERMS, dayWidth: 10 });
  for (const d of scale.days) assert.equal(scale.dateAt(scale.x(d.key) + 0.01), d.key);
});

test('is continuous and increasing across the holiday boundary', () => {
  const scale = buildTimeScale({ start: '2026-09-21', end: '2026-10-18', terms: TERMS, dayWidth: 10 });
  let last = -1;
  for (const d of scale.days) {
    assert.ok(scale.x(d.key) > last);
    last = scale.x(d.key);
  }
  assert.ok(Math.abs(scale.x('2026-09-26') - (scale.x('2026-09-25') + 10)) < 1e-6);
});

test('clamps outside the range', () => {
  const scale = buildTimeScale({ start: '2026-09-21', end: '2026-10-18', terms: TERMS, dayWidth: 10 });
  assert.equal(scale.x('2026-01-01'), 0);
  assert.equal(scale.x('2027-01-01'), scale.width);
});

test('reports holiday runs for the axis', () => {
  const scale = buildTimeScale({ start: '2026-09-21', end: '2026-10-18', terms: TERMS, dayWidth: 10 });
  const runs = holidayRuns(scale);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].start, '2026-09-26');
  assert.equal(runs[0].end, '2026-10-12');
  assert.ok(Math.abs(runs[0].w - 17 * 2.5) < 1e-6);
});
