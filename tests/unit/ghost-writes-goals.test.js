// tests/unit/ghost-writes-goals.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptPlan, validateGhost, GHOST_KINDS } from '../../apps/life/js/app/ghost-writes.js';
import { validateCentralNodePatchInput } from '../../netlify/functions/_shared/hammond-tools.mjs';

const TODAY = '2026-11-04';

test('split_task posts one step per title with stable suffixes and goal fields', () => {
  const plan = acceptPlan({
    id: 'goal-g1-split-t1', agent: 'hammond', kind: 'split_task', taskId: 't1', title: 'Write up 6.3',
    steps: ['Pull examples', 'Draft 150 words', 'Attach artefacts'], goalId: 'g1', domain: 'other'
  }, { today: TODAY });
  const posts = plan.steps.filter(step => step.target === 'tasks');
  assert.deepEqual(posts.map(step => step.suffix), ['s1', 's2', 's3']);
  assert.deepEqual(posts[0], {
    target: 'tasks', method: 'POST', suffix: 's1',
    body: { title: 'Pull examples', kind: 'step', parent_task_id: 't1', step_order: 1, status: 'open', parent_goal_id: 'g1', domain: 'other' }
  });
  const cn = plan.steps.filter(step => step.target === 'central_node');
  assert.equal(cn.length, 1);
  assert.ok(validateCentralNodePatchInput(cn[0].patch));
  assert.match(plan.receipt, /now has 3 steps/);
});

test('goal_rest_weeks patches the goal with the full rest list', () => {
  const plan = acceptPlan({
    id: 'goal-g1-rest-2026-11-16', agent: 'hammond', kind: 'goal_rest_weeks', goalId: 'g1', title: 'HA evidence',
    weeks: ['2026-11-16'], rest_weeks: ['2026-10-19', '2026-11-16']
  }, { today: TODAY });
  assert.deepEqual(plan.steps[0], {
    target: 'tasks', collection: 'goals', method: 'PATCH', id: 'g1', body: { rest_weeks: ['2026-10-19', '2026-11-16'] }
  });
  assert.match(plan.receipt, /16\/11/);
});

test('create_task carries goalId and domain', () => {
  const plan = acceptPlan({
    id: 'goal-g1-start', agent: 'hammond', kind: 'create_task', title: 'Open the spreadsheet', due: '2026-11-06', goalId: 'g1', domain: 'other'
  }, { today: TODAY });
  assert.equal(plan.steps[0].body.parent_goal_id, 'g1');
  assert.equal(plan.steps[0].body.domain, 'other');
});

test('validateGhost rejects malformed goal ghosts', () => {
  assert.ok(GHOST_KINDS.includes('split_task') && GHOST_KINDS.includes('goal_rest_weeks'));
  assert.throws(() => validateGhost({ id: 'x', agent: 'hammond', kind: 'split_task', taskId: 't1', steps: [] }), /1–6 step titles/);
  assert.throws(() => validateGhost({ id: 'x', agent: 'hammond', kind: 'split_task', steps: ['a'] }), /taskId/);
  assert.throws(() => validateGhost({ id: 'x', agent: 'hammond', kind: 'goal_rest_weeks', goalId: 'g', weeks: ['bad'], rest_weeks: [] }), /weeks/);
  assert.throws(() => validateGhost({ id: 'x', agent: 'hammond', kind: 'goal_rest_weeks', goalId: 'g', weeks: ['2026-11-16'], rest_weeks: [] }), /rest_weeks/);
});
