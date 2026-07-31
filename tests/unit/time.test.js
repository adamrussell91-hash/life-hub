import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCalendarDays, daysBetween, enumerateDateKeys,
  getSydneyDateKey, getSydneyTimestamp, getSydneyWeekStart
} from '../../js/core/time.js';

test('Sydney date key crosses the spring DST boundary by calendar date', () => {
  assert.equal(getSydneyDateKey(new Date('2026-10-03T15:30:00Z')), '2026-10-04');
  assert.equal(getSydneyTimestamp(new Date('2026-10-03T16:30:00Z')).endsWith('+11:00'), true);
});

test('Sydney timestamp uses standard time in July', () => {
  assert.equal(getSydneyTimestamp(new Date('2026-07-31T08:00:00Z')), '2026-07-31T18:00:00+10:00');
});

test('calendar arithmetic never passes through the device timezone', () => {
  assert.equal(addCalendarDays('2026-10-04', 1), '2026-10-05');
  assert.equal(getSydneyWeekStart('2026-07-31'), '2026-07-27');
  assert.equal(daysBetween('2026-07-27', '2026-07-31'), 4);
  assert.deepEqual(enumerateDateKeys('2026-07-30', '2026-08-01'), [
    '2026-07-30', '2026-07-31', '2026-08-01'
  ]);
});
