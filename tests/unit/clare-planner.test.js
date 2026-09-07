/**
 * Clare operational planner — resulting plans, not “a tool fired”.
 * Deterministic workbench proof. Not a live conversational gate.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectBoard, planWork } from '../../netlify/functions/_shared/clare-work.mjs';
import { proposeAction, runAgentKernel } from '../../netlify/functions/_shared/agent-kernel.mjs';
import { createMemoryTurnStore } from '../../netlify/functions/_shared/agent-turn-store.mjs';
import { bindPendingToTurn, resumeConfirmedTurn } from '../../netlify/functions/_shared/agent-confirm.mjs';

const NOW = new Date('2026-09-06T01:00:00.000Z');
const DATE = '2026-09-06';

function task(partial) {
  return {
    status: 'open',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...partial
  };
}

test('lesson in the middle of the day is reserved; tasks sit around it', () => {
  const plan = planWork('time_block', {
    date: DATE,
    now: NOW,
    workday: { start: '08:00', end: '16:30' },
    tasks: [
      task({ id: 't1', title: 'Mark essays', due_date: DATE, estimated_duration: 45, priority: 'high' }),
      task({ id: 't2', title: 'Email parent', due_date: DATE, estimated_duration: 15 })
    ],
    lessons: [{ id: 'l1', title: 'Year 10 essay', date: DATE, starts_at: '11:00', duration_minutes: 60 }]
  });
  assert.ok(plan.reserved_lessons.some(item => item.start === '11:00' && item.end === '12:00'));
  assert.ok(plan.blocks.length >= 1);
  assert.ok(plan.blocks.every(block => block.end <= '11:00' || block.start >= '12:00'));
  const mark = plan.blocks.find(block => block.id === 't1');
  assert.equal(mark.estimate_source, 'task.estimated_duration');
  assert.equal(mark.duration_unknown, false);
});

test('multiple fixed commitments leave named leftover slots', () => {
  const plan = planWork('time_block', {
    date: DATE,
    now: NOW,
    workday: { start: '08:00', end: '16:30' },
    tasks: [task({ id: 't1', title: 'Mark essays', due_date: DATE, estimated_duration: 30 })],
    lessons: [
      { id: 'l1', title: 'Period 1', date: DATE, starts_at: '09:00', duration_minutes: 60 },
      { id: 'l2', title: 'Period 3', date: DATE, starts_at: '13:00', duration_minutes: 90 }
    ]
  });
  assert.equal(plan.reserved_lessons.length, 2);
  assert.ok(plan.blocks[0].end <= '09:00' || (plan.blocks[0].start >= '10:00' && plan.blocks[0].end <= '13:00') || plan.blocks[0].start >= '14:30');
  assert.ok(plan.leftover_slots.some(slot => slot.start === '10:00' || slot.start === '08:00'));
});

test('insufficient capacity defers later work with a reason', () => {
  const plan = planWork('time_block', {
    date: DATE,
    now: NOW,
    workday: { start: '08:00', end: '16:30' },
    capacity_minutes: 40,
    tasks: [
      task({ id: 'overdue', title: 'Reports', due_date: '2026-09-01', estimated_duration: 30, priority: 'high' }),
      task({ id: 'later', title: 'Newsletter', due_date: DATE, estimated_duration: 30 })
    ]
  });
  assert.ok(plan.blocks.some(block => block.id === 'overdue'));
  assert.ok(plan.deferred.some(item => item.id === 'later' && /capacity/i.test(item.reason)));
  assert.equal(plan.insufficient_capacity, true);
});

test('energy-constrained day uses the supplied level', () => {
  const energy = planWork('energy', {
    now: NOW,
    energy: { level: 'low', cognitive_load: 8 },
    tasks: [
      task({ id: 'long', title: 'Rewrite unit', estimated_duration: 90, priority: 'medium' }),
      task({ id: 'short', title: 'Send reminder', estimated_duration: 15, tags: ['comms'], priority: 'high' })
    ]
  });
  assert.equal(energy.energy_applied, true);
  assert.equal(energy.sequence[0].id, 'short');
  assert.ok(energy.sequence.find(item => item.id === 'short').energy_level_used === 'low');
});

test('stale project is returned beside rotting tasks', () => {
  const stale = inspectBoard('stale', {
    tasks: [task({ id: 'old_task', title: 'Rotting mark', due_date: '2026-08-01' })],
    projects: [{ id: 'proj_stale', title: 'Unit redesign', updated_at: '2026-05-01T00:00:00.000Z' }]
  }, NOW);
  assert.ok(stale.results.some(item => item.id === 'proj_stale' && item.health === 'stale'));
});

test('semantic duplicates with different titles are grouped', () => {
  const dupes = inspectBoard('duplicates', {
    tasks: [
      task({ id: 'a', title: 'Write permission note' }),
      task({ id: 'b', title: 'Permission note write-up' }),
      task({ id: 'c', title: 'Buy printer paper' })
    ]
  });
  assert.ok(dupes.count >= 1);
  assert.equal(dupes.method, 'token_overlap');
  const group = dupes.results.find(items => items.some(item => item.id === 'a') && items.some(item => item.id === 'b'));
  assert.ok(group);
});

test('blocked dependency is deferred, not scheduled', () => {
  const plan = planWork('time_block', {
    date: DATE,
    now: NOW,
    workday: { start: '08:00', end: '16:30' },
    tasks: [
      task({ id: 'parent', title: 'Draft report', due_date: DATE, estimated_duration: 30 }),
      task({ id: 'child', title: 'Send report', due_date: DATE, estimated_duration: 15, blocked_by: 'parent' })
    ]
  });
  assert.ok(plan.blocks.some(block => block.id === 'parent'));
  assert.ok(plan.deferred.some(item => item.id === 'child' && /blocked/i.test(item.reason)));
});

test('unknown duration is labelled and uses a 30-minute fallback', () => {
  const plan = planWork('time_block', {
    date: DATE,
    now: NOW,
    workday: { start: '08:00', end: '16:30' },
    tasks: [task({ id: 'untimed', title: 'Triage inbox', due_date: DATE })]
  });
  assert.equal(plan.blocks[0].duration_unknown, true);
  assert.equal(plan.blocks[0].estimate_source, 'unknown_fallback');
  assert.equal(plan.blocks[0].minutes, 30);
});

test('interrupted today starts after the current hub time', () => {
  const plan = planWork('time_block', {
    date: DATE,
    now: NOW,
    tasks: [task({ id: 't1', title: 'Mark essays', due_date: DATE, estimated_duration: 30 })]
  });
  assert.match(plan.workday, /interrupted_today|preference|fallback/);
  assert.ok(plan.blocks[0].start >= '11:00', `expected start at or after 11:00, got ${plan.blocks[0].start}`);
});

test('write proposal binds to a persisted turn and resumes once', () => {
  const persist = createMemoryTurnStore();
  const kernel = runAgentKernel({
    slug: 'clare',
    message: 'What should I focus on today?',
    today: DATE,
    now: NOW,
    stores: { tasks: [task({ id: '1', title: 'Mark essays', due_date: '2026-08-10' })] },
    persist
  });
  const proposed = proposeAction(kernel, {
    intent: 'create_task',
    snapshot: { title: 'Mark essays' },
    idempotencyKey: 'clare-write-1'
  });
  persist.save(kernel);
  const pending = bindPendingToTurn({ id: proposed.action.id, slug: 'clare' }, kernel.id);
  const restarted = createMemoryTurnStore();
  restarted.importJson(persist.exportJson());
  const first = resumeConfirmedTurn({
    persist: restarted,
    turnId: pending.turnId,
    actionId: proposed.action.id,
    decision: 'confirm',
    currentRecords: { title: 'Mark essays' }
  });
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  const second = resumeConfirmedTurn({
    persist: restarted,
    turnId: pending.turnId,
    actionId: proposed.action.id,
    decision: 'confirm',
    currentRecords: { title: 'Mark essays' }
  });
  assert.equal(second.duplicate, true);
});
