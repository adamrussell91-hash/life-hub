import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldRunCareerScanNow,
  sourceRefsHash,
  isoWeekKey
} from '../../netlify/functions/_shared/career-scan-service.mjs';

test('sourceRefsHash is order-insensitive', () => {
  assert.equal(
    sourceRefsHash(['tasks:task:a', 'professional:meeting:b']),
    sourceRefsHash(['professional:meeting:b', 'tasks:task:a'])
  );
});

test('shouldRunCareerScanNow is Sunday 17–19 Sydney with once-per-week success', () => {
  // 2026-09-27 is a Sunday. 07:00 UTC = 17:00 Sydney (AEST, UTC+10).
  const sunday1700 = new Date('2026-09-27T07:00:00Z');
  const gate = shouldRunCareerScanNow(sunday1700, {});
  assert.equal(gate.run, true);
  assert.ok(gate.weekKey);

  const already = shouldRunCareerScanNow(sunday1700, { last_success_week: gate.weekKey });
  assert.equal(already.run, false);

  assert.equal(shouldRunCareerScanNow(new Date('2026-09-27T08:00:00Z'), {}).run, true);
  assert.equal(shouldRunCareerScanNow(new Date('2026-09-27T09:00:00Z'), {}).run, true);

  const monday = new Date('2026-09-28T07:00:00Z');
  assert.equal(shouldRunCareerScanNow(monday, {}).run, false);
});

test('isoWeekKey is stable for a Sydney Sunday', () => {
  const key = isoWeekKey(new Date('2026-09-27T07:00:00Z'));
  assert.match(key, /^\d{4}-W\d{2}$/);
});
