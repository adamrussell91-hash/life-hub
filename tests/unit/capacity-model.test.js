import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPACITY,
  capacityForDates,
  dayLoadHours,
  forecastCapacity,
  forecastSeries,
  isOverCapacity,
  symptomsIn
} from '../../apps/life/js/app/capacity-model.js';
import { checkinEvents } from '../../packages/design-kit/js/calendar/readiness-model.js';

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

test('the real week: it slides to Thursday, which is flagged to soften', () => {
  const cap = capacityForDates(EVENTS, WEEK, { isHoliday: HOLIDAY });
  const pct = WEEK.map(d => cap.get(d).pct);
  assert.deepEqual(pct.slice(0, 4), [79, 67, 56, 51]);
  const thu = cap.get('2026-09-24');
  assert.equal(thu.note, 'sore throat, energy reduced');
  assert.equal(thu.soften, true, 'unwell on known poor sleep softens whatever the number');
  assert.equal(thu.forecast, false);
  assert.ok(thu.low < thu.pct && thu.pct < thu.high, 'every computed day carries its band');
  assert.ok(thu.factors.some(f => f.id === 'symptoms' && f.symptoms[0] === 'sore throat'));
});

test('days after the last log are forecasts that recover, faster in the holidays', () => {
  const cap = capacityForDates(EVENTS, WEEK, { isHoliday: HOLIDAY });
  const fri = cap.get('2026-09-25');
  const sat = cap.get('2026-09-26');
  const sun = cap.get('2026-09-27');
  assert.equal(fri.forecast, true);
  assert.equal(fri.note, 'forecast');
  assert.ok(fri.pct < sat.pct && sat.pct < sun.pct);
  assert.ok(sun.high - sun.low > fri.high - fri.low, 'the band widens with distance');
  assert.equal(forecastCapacity(30, 1).pct, 48);
  assert.equal(forecastCapacity(30, 1, { holiday: true }).pct, 53);
});

test('no logs at all falls back to baseline, marked as a forecast', () => {
  const cap = capacityForDates([], ['2026-09-21']);
  assert.equal(cap.get('2026-09-21').pct, CAPACITY.baseline);
  assert.equal(cap.get('2026-09-21').forecast, true);
});

test('today is always computed; a check-in moves it and the days after it', () => {
  const plain = capacityForDates(EVENTS, WEEK, { today: '2026-09-25' });
  assert.equal(plain.get('2026-09-25').readiness != null, true, 'today has a readiness forecast even with no logs');
  const checked = capacityForDates([...EVENTS, ...checkinEvents([{ id: 'o1', local_date: '2026-09-25', observed_at: '2026-09-25T07:05:00Z', answers: { overall: 'strong', sleep: 'restorative' }, reported_estimate: 80 }])], WEEK, { today: '2026-09-25' });
  assert.ok(checked.get('2026-09-25').pct > plain.get('2026-09-25').pct);
  assert.equal(checked.get('2026-09-25').checkedIn, true);
  assert.ok(checked.get('2026-09-26').pct > plain.get('2026-09-26').pct, 'forecasts recover from the checked-in day');
  const deleted = capacityForDates([...EVENTS, ...checkinEvents([{ id: 'o1', local_date: '2026-09-25', answers: { overall: 'strong' }, deleted_at: 'x' }])], WEEK, { today: '2026-09-25' });
  assert.equal(deleted.get('2026-09-25').pct, plain.get('2026-09-25').pct, 'a deleted check-in never counts');
});

test('100 is reachable and the old 95 ceiling is gone', () => {
  const perfect = checkinEvents([{ id: 'p', local_date: '2026-09-21', answers: { sleep: 'restorative', energy: 'energised', focus: 'sharp', mood: 'good' } }]);
  assert.equal(capacityForDates(perfect, ['2026-09-21']).get('2026-09-21').pct, 100);
  assert.equal(CAPACITY.ceiling, 100);
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

test('forecastSeries (visual fixture path): same recovery, widening band', () => {
  const dates = ['2026-09-24', '2026-10-01', '2026-10-20', '2026-11-20', '2026-12-28'];
  const s = forecastSeries(dates, { lastPct: 51, lastDate: '2026-09-24', isHoliday: () => false });
  assert.equal(s[0].pct, 51);
  assert.equal(s[0].low, s[0].high, 'today has no spread');
  assert.ok(s.every(p => p.pct <= CAPACITY.baseline));
  const spread = p => p.high - p.low;
  assert.ok(spread(s[1]) < spread(s[2]) && spread(s[2]) < spread(s[3]), 'the band widens with distance');
});
