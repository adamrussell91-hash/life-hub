// tests/unit/goal-read-v2.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildGoalRead, protectBlockProposal } from '../../netlify/functions/_shared/goal-read.mjs';
import { cooledKindsFromDecisions, quietLinesForCooled } from '../../netlify/functions/_shared/goal-dismissal-learn.mjs';

const goal = {
  id: 'g1', title: 'Recomp', sphere: 'life', status: 'active',
  lead_measure: { label: '4 sessions', per_week: 4 },
  week_log: {}, rest_weeks: [], milestones: [],
  created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
  signal: { source: 'binding_goal', row: 'weight' }
};

describe('G-30 protect_block + G-34 looked_at', () => {
  it('proposes a protect_block when behind and a slot exists', () => {
    const block = protectBlockProposal({
      goal,
      hostedTasks: [{ id: 't1', title: 'Lift', status: 'open', kind: 'task', estimated_duration: 45 }],
      today: '2026-11-04',
      slots: [{ date: '2026-11-05', start: '12:00' }],
      count: 1,
      perWeek: 4
    });
    assert.equal(block?.kind, 'protect_block');
    assert.equal(block?.id, 'goal-g1-block-2026-11-05');
    assert.equal(block?.title, 'Lift');
  });

  it('renames Term rhythm to Due-date load and adds Calendar / Life Hub when looked', () => {
    const read = buildGoalRead({
      goal,
      terms: [{ term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' }],
      today: '2026-11-04',
      calendarLooked: true,
      lifeHubLooked: true,
      binding: { bindingId: 'g1', rows: [{ id: 'weight', detail: '80 kg inside band.' }] }
    });
    assert.ok(read.looked_at.includes('Due-date load'));
    assert.ok(!read.looked_at.includes('Term rhythm'));
    assert.ok(read.looked_at.includes('Calendar'));
    assert.ok(read.looked_at.includes('Life Hub'));
    assert.ok(read.verdict.includes('80 kg'));
    assert.equal(read.binding, true);
  });
});

describe('G-33 dismissal learning', () => {
  it('cools a kind after 3 dismissals with no accepts in 30 days', () => {
    const now = Date.parse('2026-11-04T00:00:00.000Z');
    const decisions = [
      { kind: 'goal_rest_weeks', outcome: 'dismiss', at: '2026-10-20T00:00:00.000Z' },
      { kind: 'goal_rest_weeks', outcome: 'dismiss', at: '2026-10-25T00:00:00.000Z' },
      { kind: 'goal_rest_weeks', outcome: 'dismiss', at: '2026-11-01T00:00:00.000Z' }
    ];
    const cooled = cooledKindsFromDecisions(decisions, now);
    assert.ok(cooled.has('goal_rest_weeks'));
    const lines = quietLinesForCooled(cooled);
    assert.ok(lines[0].line.includes('rest weeks'));
  });
});
