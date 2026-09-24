import test from 'node:test';
import assert from 'node:assert/strict';
import { findOpenings } from '../../packages/design-kit/js/openings.js';
import { ALMANAC_WANTS } from '../../apps/life/js/app/almanac-rules.js';

// 24/09 – 11/10/26: T3 ends 25/09, holidays to 12/10. Sundays walled. Conferral 30/09 and ToM 03/10 take the day.
function day(date, pct, extra = {}) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const school = date <= '2026-09-25' && weekday >= 1 && weekday <= 5;
  return { date, pct, weekday, holiday: date >= '2026-09-26', walled: weekday === 0, freeDay: school ? 0 : 12, freeEvening: school && weekday !== 5 ? 3 : 4.5, tags: [], ...extra };
}
const DAYS = [
  day('2026-09-24', 34), day('2026-09-25', 52), day('2026-09-26', 68, { freeEvening: 0 }), day('2026-09-27', 75),
  day('2026-09-28', 79), day('2026-09-29', 81), day('2026-09-30', 83, { freeDay: 0 }), day('2026-10-01', 84),
  day('2026-10-02', 84), day('2026-10-03', 85, { freeDay: 0 }), day('2026-10-04', 85, { tags: ['dst-start'] }),
  day('2026-10-05', 85), day('2026-10-06', 85), day('2026-10-07', 85), day('2026-10-08', 85)
];

test('the real wants find real windows, Corey first', () => {
  const got = findOpenings(DAYS, ALMANAC_WANTS);
  assert.deepEqual(got.map(o => [o.wantId, o.dates]), [
    ['good-night', ['2026-10-02']],
    ['keep-empty', ['2026-10-04']],
    ['bob', ['2026-09-28']],
    ['newcastle', ['2026-10-05', '2026-10-06']]
  ]);
  assert.equal(got[0].with, 'corey');
});

test('an opening is the earliest window that clears the bar', () => {
  const got = findOpenings(DAYS, [{ id: 'e', title: 'E', span: 'evening', minPct: 60 }]);
  assert.deepEqual(got[0].dates, ['2026-09-28'], 'Sat 26 evening taken, Sun 27 walled, so Mon 28');
});

test('parts of a day are never double-booked, but lunch and evening can share a day', () => {
  const got = findOpenings(DAYS, [
    { id: 'a', title: 'A', span: 'evening', minPct: 60 },
    { id: 'b', title: 'B', span: 'lunch', minPct: 60, holidayOnly: true },
    { id: 'c', title: 'C', span: 'day', minPct: 60 }
  ]);
  assert.deepEqual(got.map(o => o.dates[0]), ['2026-09-28', '2026-09-28', '2026-09-29']);
});

test('a day whose evening is taken is not a whole free day', () => {
  const got = findOpenings(DAYS, [{ id: 'd', title: 'D', span: 'day', minPct: 60 }]);
  assert.notEqual(got[0].dates[0], '2026-09-26');
});

test('a want with no window says so', () => {
  const got = findOpenings(DAYS, [{ id: 'z', title: 'Z', span: 'days2', minPct: 99 }]);
  assert.deepEqual(got[0].dates, []);
  assert.equal(got[0].pct, null);
});
