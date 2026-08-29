import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCalendarDays, daysBetween, enumerateDateKeys,
  formatDisplayDate, formatShortMonth, formatWeekday,
  getSydneyDateKey, getSydneyTimestamp, getSydneyWeekStart, isCalendarDate,
  sydneyLocalStamp
} from '../../js/core/time.js';

test('Sydney date key crosses the spring DST boundary by calendar date', () => {
  assert.equal(getSydneyDateKey(new Date('2026-10-03T15:30:00Z')), '2026-10-04');
  assert.equal(getSydneyTimestamp(new Date('2026-10-03T16:30:00Z')).endsWith('+11:00'), true);
});

test('Sydney timestamp uses standard time in July', () => {
  assert.equal(getSydneyTimestamp(new Date('2026-07-31T08:00:00Z')), '2026-07-31T18:00:00+10:00');
});

test('Sydney autumn transition represents both repeated-hour offsets', () => {
  assert.equal(
    getSydneyTimestamp(new Date('2026-04-04T15:30:00Z')),
    '2026-04-05T02:30:00+11:00'
  );
  assert.equal(
    getSydneyTimestamp(new Date('2026-04-04T16:30:00Z')),
    '2026-04-05T02:30:00+10:00'
  );
  assert.equal(addCalendarDays('2026-04-04', 1), '2026-04-05');
  assert.equal(addCalendarDays('2026-04-05', 1), '2026-04-06');
});

test('calendar arithmetic never passes through the device timezone', () => {
  assert.equal(addCalendarDays('2026-10-04', 1), '2026-10-05');
  assert.equal(getSydneyWeekStart('2026-07-31'), '2026-07-27');
  assert.equal(daysBetween('2026-07-27', '2026-07-31'), 4);
  assert.deepEqual(enumerateDateKeys('2026-07-30', '2026-08-01'), [
    '2026-07-30', '2026-07-31', '2026-08-01'
  ]);
});

test('calendar helpers reject impossible dates and preserve leap-day arithmetic', () => {
  assert.equal(isCalendarDate('2024-02-29'), true);
  assert.equal(isCalendarDate('2026-02-29'), false);
  assert.equal(addCalendarDays('2024-02-29', 1), '2024-03-01');
  assert.equal(getSydneyWeekStart('2024-02-29'), '2024-02-26');
  assert.equal(daysBetween('2024-02-28', '2024-03-01'), 2);
  assert.deepEqual(enumerateDateKeys('2024-02-28', '2024-03-01'), [
    '2024-02-28', '2024-02-29', '2024-03-01'
  ]);

  for (const impossible of ['2026-02-29', '2026-02-30', '2026-04-31']) {
    assert.throws(() => addCalendarDays(impossible, 1), TypeError);
    assert.throws(() => getSydneyWeekStart(impossible), TypeError);
    assert.throws(() => daysBetween(impossible, '2026-03-01'), TypeError);
    assert.throws(() => daysBetween('2026-02-01', impossible), TypeError);
    assert.throws(() => enumerateDateKeys(impossible, '2026-03-01'), TypeError);
    assert.throws(() => enumerateDateKeys('2026-02-01', impossible), TypeError);
  }
});

test('formatWeekday names the UTC calendar day', () => {
  assert.equal(formatWeekday('2026-07-30'), 'Thursday');
  assert.equal(formatWeekday('2026-08-01'), 'Saturday');
  assert.equal(formatWeekday('not-a-date'), '');
});

test('formatDisplayDate is always DD/MM/YY', () => {
  assert.equal(formatDisplayDate('2026-08-15'), '15/08/26');
  assert.equal(formatDisplayDate('2026-01-05'), '05/01/26');
  assert.equal(formatDisplayDate('2015-12-31'), '31/12/15');
  assert.equal(formatDisplayDate('not-a-date'), 'not-a-date');
  assert.equal(formatDisplayDate(''), '');
});

test('formatShortMonth labels a chart tick as month and short year', () => {
  assert.equal(formatShortMonth('2026-05-19'), 'May ’26');
  assert.equal(formatShortMonth('2019-07-19'), 'Jul ’19');
  assert.equal(formatShortMonth('not-a-date'), 'not-a-date');
  assert.equal(formatShortMonth(''), '');
});

test('sydneyLocalStamp picks AEDT (+11) in late March', () => {
  assert.equal(sydneyLocalStamp('2026-03-29', '12:00'), '2026-03-29T12:00:00+11:00');
});

test('sydneyLocalStamp picks AEST (+10) in July', () => {
  assert.equal(sydneyLocalStamp('2026-07-30', '07:00'), '2026-07-30T07:00:00+10:00');
});

test('sydneyLocalStamp picks AEST after the autumn changeover', () => {
  assert.equal(sydneyLocalStamp('2026-04-08', '12:00'), '2026-04-08T12:00:00+10:00');
});
