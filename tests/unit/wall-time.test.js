import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertValidTimeZone,
  isValidTimeZone,
  utcIsoToWallLocal,
  wallLocalToUtcIso
} from '../../netlify/functions/_shared/wall-time.mjs';

test('rejects invalid IANA time zones', () => {
  assert.equal(isValidTimeZone('Not/AZone'), false);
  assert.throws(() => assertValidTimeZone('Nope'), /IANA/);
});

test('Sydney wall time converts independently of device offset', () => {
  // 2026-01-15 09:30 Australia/Sydney is AEDT (UTC+11)
  const iso = wallLocalToUtcIso('2026-01-15T09:30', 'Australia/Sydney');
  assert.equal(iso, '2026-01-14T22:30:00.000Z');
  assert.equal(utcIsoToWallLocal(iso, 'Australia/Sydney'), '2026-01-15T09:30');
});

test('London wall time converts for a different zone', () => {
  const iso = wallLocalToUtcIso('2026-03-10T14:00', 'Europe/London');
  assert.equal(iso, '2026-03-10T14:00:00.000Z');
  assert.equal(utcIsoToWallLocal(iso, 'Europe/London'), '2026-03-10T14:00');
});

test('Sydney daylight saving spring-forward still maps wall clock', () => {
  // First Sunday of October 2026: clocks spring forward 02:00 → 03:00 AEDT
  const before = wallLocalToUtcIso('2026-10-03T01:30', 'Australia/Sydney');
  const after = wallLocalToUtcIso('2026-10-04T03:30', 'Australia/Sydney');
  assert.equal(utcIsoToWallLocal(before, 'Australia/Sydney'), '2026-10-03T01:30');
  assert.equal(utcIsoToWallLocal(after, 'Australia/Sydney'), '2026-10-04T03:30');
  assert.ok(Date.parse(after) > Date.parse(before));
});

test('create and reschedule round-trips preserve wall clock in zone', () => {
  const created = wallLocalToUtcIso('2026-09-15T10:00', 'Australia/Sydney');
  const rescheduled = wallLocalToUtcIso('2026-09-16T11:15', 'Australia/Sydney');
  assert.equal(utcIsoToWallLocal(created, 'Australia/Sydney'), '2026-09-15T10:00');
  assert.equal(utcIsoToWallLocal(rescheduled, 'Australia/Sydney'), '2026-09-16T11:15');
  assert.notEqual(created, rescheduled);
});
