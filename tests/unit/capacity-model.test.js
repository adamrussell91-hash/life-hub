import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPACITY,
  capacityForDates,
  dayCapacity,
  dayLoadHours,
  forecastCapacity,
  isOverCapacity,
  symptomsIn
} from '../../apps/life/js/app/capacity-model.js';

// Adam's real week, T3 W10 (21-27/09/26), as logged in the Life calendar screenshot.
const WEEK = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];
const EVENTS = [
  { record: { type: 'sleep', date: '2026-09-21', duration_h: 6.9 } },
  { record: { type: 'sleep', date: '2026-09-22', duration_h: 6.2 } },
  { record: { type: 'diary', date: '2026-09-22', mood: 'low', energy: 'low', mood_score: 3 }, body: '' },
  { record: { type: 'sleep', date: '2026-09-23', duration_h: 5.9 } },
  { record: { type: 'diary', date: '2026-09-23' }, body: 'Feeling run down, possible viral illness' },
  { record: { type: 'sleep', date: '2026-09-24', duration_h: 5.4 } },
  { record: { type: 'diary', date: '2026-09-24' }, body: 'Sore throat, sniffles, poor sleep' },
  { record: { type: 'meal', date: '2026-09-24', meal: 'breakfast' } }
];
const HOLIDAY = d => d >= '2026-09-26';

test('symptoms come from the diary field first, then from the text', () => {
  assert.deepEqual(symptomsIn({ symptoms: ['sore throat'] }, 'fine'), ['sore throat']);
  assert.deepEqual(symptomsIn({}, 'Sore throat, sniffles, poor sleep'), ['sore throat', 'sniffles']);
  assert.deepEqual(symptomsIn({}, 'Feeling run down, possible viral illness'), ['run down', 'viral']);
  assert.deepEqual(symptomsIn({}, 'Great session, cold brew after'), []);
});

test('the real week: Thursday is the lowest day and is flagged to soften', () => {
  const cap = capacityForDates(EVENTS, WEEK, { isHoliday: HOLIDAY });
  const pct = WEEK.map(d => cap.get(d).pct);
  assert.deepEqual(pct.slice(0, 4), [79, 51, 42, 34]);
  const thu = cap.get('2026-09-24');
  assert.equal(thu.note, 'sore throat, poor sleep');
  assert.equal(thu.soften, true);
  assert.equal(thu.forecast, false);
  assert.ok(thu.factors.some(f => f.id === 'streak' && f.label === '3rd low day in a row'));
});

test('days after the last log are forecasts that recover, faster in the holidays', () => {
  const cap = capacityForDates(EVENTS, WEEK, { isHoliday: HOLIDAY });
  const fri = cap.get('2026-09-25');
  const sat = cap.get('2026-09-26');
  const sun = cap.get('2026-09-27');
  assert.equal(fri.forecast, true);
  assert.equal(fri.note, 'forecast');
  assert.ok(fri.pct < sat.pct && sat.pct < sun.pct);
  assert.equal(forecastCapacity(30, 1).pct, 50);
  assert.equal(forecastCapacity(30, 1, { holiday: true }).pct, 55);
});

test('no logs at all falls back to baseline, marked as a forecast', () => {
  const cap = capacityForDates([], ['2026-09-21']);
  assert.equal(cap.get('2026-09-21').pct, CAPACITY.baseline);
  assert.equal(cap.get('2026-09-21').forecast, true);
});

test('a good day says so and is clamped to the ceiling', () => {
  const r = dayCapacity({ sleepHours: 8, diaries: [{ record: { energy: 'high' } }] });
  assert.equal(r.pct, 88);
  assert.equal(r.note, 'good energy');
  assert.equal(dayCapacity({ sleepHours: 8 }).note, 'steady');
});

test('the worst logged energy of the day wins', () => {
  const r = dayCapacity({ diaries: [{ record: { energy: 'high' } }, { record: { energy: 'low' } }] });
  assert.equal(r.pct, 65);
});

test('load ignores classes, Corey time, protected walls, logs and ghosts', () => {
  const thursday = [
    { start: 8 + 40 / 60, end: 9 + 35 / 60, kind: 'teaching', isClass: true },
    { start: 13.25, end: 14.25, kind: 'health' },
    { start: 18.25, end: 19 + 25 / 60, kind: 'fitness' },
    { start: 19.5, end: 21.5, kind: 'corey' },
    { start: 21.5, end: 22, kind: 'health', ghost: true }
  ];
  const load = dayLoadHours(thursday);
  assert.ok(Math.abs(load - (1 + 70 / 60)) < 1e-9);
  assert.equal(isOverCapacity(30, load), true);
  assert.equal(isOverCapacity(79, load), false);
});

test('forecastSeries: recovers, follows the term pattern, and widens with distance', async () => {
  const { forecastSeries } = await import('../../apps/life/js/app/capacity-model.js');
  const dates = ['2026-09-24', '2026-10-01', '2026-10-20', '2026-11-20', '2026-12-28'];
  const term = d => (d >= '2026-10-13' && d <= '2026-12-17');
  const s = forecastSeries(dates, {
    lastPct: 34, lastDate: '2026-09-24', isHoliday: d => !term(d),
    pattern: d => (term(d) ? -12 : 0) + (d >= '2026-11-16' && d <= '2026-11-29' ? -16 : 0)
  });
  assert.deepEqual(s.map(p => p.pct), [34, 84, 68, 52, 85]);
  assert.equal(s[0].low, s[0].high, 'today has no spread');
  const spread = p => p.high - p.low;
  assert.ok(spread(s[1]) < spread(s[2]) && spread(s[2]) < spread(s[3]), 'the band widens with distance');
});
