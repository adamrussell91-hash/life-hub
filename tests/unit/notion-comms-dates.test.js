import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNotionDate } from '../../scripts/lib/notion-comms/dates.mjs';

test('parseNotionDate keeps date-only Notion values all-day', () => {
  assert.deepEqual(parseNotionDate('August 28, 2025'), {
    start: '2025-08-28', end: null, allDay: true, timeZone: 'Australia/Sydney'
  });
});

test('parseNotionDate parses a same-day explicit-offset range', () => {
  assert.deepEqual(parseNotionDate('August 28, 2025 10:36 AM (GMT+10) → 10:51 AM'), {
    start: '2025-08-28T00:36:00.000Z', end: '2025-08-28T00:51:00.000Z', allDay: false, timeZone: 'Australia/Sydney'
  });
});

test('parseNotionDate applies Sydney daylight saving to wall times', () => {
  assert.equal(parseNotionDate('April 6, 2025 10:36 AM').start, '2025-04-06T00:36:00.000Z');
  assert.equal(parseNotionDate('October 5, 2025 10:36 AM').start, '2025-10-04T23:36:00.000Z');
});

test('parseNotionDate accepts the day-first date format exported by the live dashboard', () => {
  assert.deepEqual(parseNotionDate('17 September 2026 11:50 → 12:43'), {
    start: '2026-09-17T01:50:00.000Z', end: '2026-09-17T02:43:00.000Z', allDay: false, timeZone: 'Australia/Sydney'
  });
  assert.equal(parseNotionDate('27 July 2026').start, '2026-07-27');
});

test('parseNotionDate supports a range whose end names another day', () => {
  assert.deepEqual(parseNotionDate('August 28, 2025 11:30 PM → August 29, 2025 1:15 AM'), {
    start: '2025-08-28T13:30:00.000Z',
    end: '2025-08-28T15:15:00.000Z',
    allDay: false,
    timeZone: 'Australia/Sydney'
  });
});
