// tests/unit/goal-plan-term.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPlanTerm, nextTermRef } from '../../netlify/functions/_shared/goal-plan-term.mjs';

test('nextTermRef rolls term 4 into the next year', () => {
  assert.deepEqual(nextTermRef({ year: 2026, term: 3 }), { year: 2026, term: 4 });
  assert.deepEqual(nextTermRef({ year: 2026, term: 4 }), { year: 2027, term: 1 });
});

test('applyPlanTerm carries, parks, achieves and drops with term_history', () => {
  const at = '2026-09-26T03:00:00.000Z';
  const goals = [
    {
      id: 'g1', title: 'Carry me', status: 'active',
      term: { year: 2026, term: 3 }, term_history: [],
      updated_at: 'a', created_at: 'a', schema_version: 1
    },
    {
      id: 'g2', title: 'Park me', status: 'active',
      term: { year: 2026, term: 3 }, term_history: [],
      updated_at: 'a', created_at: 'a', schema_version: 1
    },
    {
      id: 'g3', title: 'Done', status: 'active',
      term: { year: 2026, term: 3 }, term_history: [],
      updated_at: 'a', created_at: 'a', schema_version: 1
    },
    {
      id: 'g4', title: 'Drop', status: 'active',
      term: { year: 2026, term: 3 }, term_history: [],
      updated_at: 'a', created_at: 'a', schema_version: 1
    }
  ];
  const result = applyPlanTerm({
    goals,
    from: { year: 2026, term: 3 },
    decisions: [
      { goal_id: 'g1', outcome: 'carried' },
      { goal_id: 'g2', outcome: 'parked' },
      { goal_id: 'g3', outcome: 'achieved' },
      { goal_id: 'g4', outcome: 'dropped' }
    ],
    at
  });
  assert.equal(result.error, undefined);
  const byId = Object.fromEntries(result.goals.map(g => [g.id, g]));
  assert.deepEqual(byId.g1.term, { year: 2026, term: 4 });
  assert.equal(byId.g1.status, 'active');
  assert.equal(byId.g2.status, 'parked');
  assert.equal(byId.g3.status, 'achieved');
  assert.equal(byId.g4.status, 'dropped');
  for (const id of ['g1', 'g2', 'g3', 'g4']) {
    assert.equal(byId[id].term_history.length, 1);
    assert.equal(byId[id].term_history[0].year, 2026);
    assert.equal(byId[id].term_history[0].term, 3);
    assert.equal(byId[id].term_history[0].at, at);
  }
  assert.equal(byId.g1.term_history[0].outcome, 'carried');
});

test('applyPlanTerm rejects a goal outside the from term', () => {
  const result = applyPlanTerm({
    goals: [{
      id: 'g1', title: 'Other', status: 'active',
      term: { year: 2026, term: 2 }, term_history: [],
      updated_at: 'a', created_at: 'a', schema_version: 1
    }],
    from: { year: 2026, term: 3 },
    decisions: [{ goal_id: 'g1', outcome: 'carried' }],
    at: '2026-09-26T03:00:00.000Z'
  });
  assert.equal(result.error?.code, 'validation_error');
});
