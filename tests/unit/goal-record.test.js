// tests/unit/goal-record.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGoalRecord } from '../../netlify/functions/_shared/goal-record.mjs';

const BASE = {
  schema_version: 1,
  id: 'goal_1',
  title: 'HA evidence',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z'
};

test('a legacy goal gains every v2 default', () => {
  const goal = normalizeGoalRecord({ ...BASE });
  assert.equal(goal.sphere, 'life');
  assert.equal(goal.status, 'active');
  assert.equal(goal.structure, 'woop');
  assert.deepEqual(goal.frame, {});
  assert.equal(goal.lead_measure, null);
  assert.deepEqual(goal.week_log, {});
  assert.deepEqual(goal.rest_weeks, []);
  assert.equal(goal.if_then, null);
  assert.equal(goal.next_start, null);
  assert.equal(goal.due_date, null);
  assert.deepEqual(goal.milestones, []);
  assert.deepEqual(goal.tags, []);
  assert.equal(goal.description, '');
});

test('known values survive, junk is dropped', () => {
  const goal = normalizeGoalRecord({
    ...BASE,
    sphere: 'professional',
    status: 'parked',
    structure: 'floor_target_stretch',
    frame: {
      woop: { wish: ' Be strong ', outcome: 'x', obstacle: 7, plan: 'y', extra: 'no' },
      floor_target_stretch: { unit: 'standards', floor: 3, target: 5, stretch: 7, current: Number.NaN },
      okr: { objective: 'Ship', key_results: [{ label: 'Users', target: 10, current: 2 }, { label: '' }] },
      nonsense: { a: 1 }
    },
    lead_measure: { label: '1 write-up', per_week: 1 },
    week_log: { '2026-09-28': { manual: 2 }, '2026-09-29': { manual: 1 }, junk: {} },
    rest_weeks: ['2026-10-05', '2026-10-05', '2026-10-06', 'x'],
    if_then: { cue: 'Tue P5', action: 'open the doc', obstacle: 'email' },
    next_start: '  Open the spreadsheet ',
    due_date: '2027-03-20',
    milestones: [{ title: 'Floor', due_date: '2026-11-20', status: 'done' }, { title: '' }],
    tags: ['term-4', 3, ' ']
  });
  assert.equal(goal.sphere, 'professional');
  assert.equal(goal.status, 'parked');
  assert.equal(goal.structure, 'floor_target_stretch');
  assert.deepEqual(goal.frame.woop, { wish: 'Be strong', outcome: 'x', obstacle: '', plan: 'y' });
  assert.deepEqual(goal.frame.floor_target_stretch, { unit: 'standards', floor: 3, target: 5, stretch: 7, current: null });
  assert.deepEqual(goal.frame.okr, {
    objective: 'Ship',
    key_results: [{ id: 'kr1', label: 'Users', target: 10, current: 2 }]
  });
  assert.equal('nonsense' in goal.frame, false);
  assert.deepEqual(goal.lead_measure, { label: '1 write-up', per_week: 1 });
  assert.deepEqual(goal.week_log, { '2026-09-28': { manual: 2 } });
  assert.deepEqual(goal.rest_weeks, ['2026-10-05']);
  assert.deepEqual(goal.if_then, { cue: 'Tue P5', action: 'open the doc', obstacle: 'email' });
  assert.equal(goal.next_start, 'Open the spreadsheet');
  assert.equal(goal.due_date, '2027-03-20');
  assert.deepEqual(goal.milestones, [{ id: 'ms1', title: 'Floor', due_date: '2026-11-20', status: 'done' }]);
  assert.deepEqual(goal.tags, ['term-4']);
});

test('invalid enums fall back and a half-filled lead measure is null', () => {
  const goal = normalizeGoalRecord({ ...BASE, sphere: 'x', status: 'y', structure: 'z', lead_measure: { label: 'a', per_week: 0 } });
  assert.equal(goal.sphere, 'life');
  assert.equal(goal.status, 'active');
  assert.equal(goal.structure, 'woop');
  assert.equal(goal.lead_measure, null);
});
