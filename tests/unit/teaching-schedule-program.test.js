import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScheduleUnit } from '../../netlify/functions/_shared/teaching-schedule.mjs';

test('applyScheduleUnit refuses a program and leaves the class alone', () => {
  const cls = { id: 'c', active_unit_ids: [] };
  const result = applyScheduleUnit({
    cls,
    unit: { id: 'u', kind: 'program', lesson_ids: ['l1'] },
    existing: [],
    startDate: '2026-10-12',
    meetingDays: [1],
    nowIso: '2026-10-12T00:00:00Z',
    idFactory: (id) => `s_${id}`
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'program_not_schedulable');
  assert.match(result.message, /Programs aren't scheduled into classes\./);
  assert.deepEqual(cls.active_unit_ids, []);
});
