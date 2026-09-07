/**
 * Typed kernel claim provenance. Deterministic. Not a live conversational gate.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { kernelTraceEvent, runAgentKernel } from '../../netlify/functions/_shared/agent-kernel.mjs';
import { composeEvidenceClaims } from '../../netlify/functions/_shared/evidence-packs.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

function usableProvenance(provenance) {
  if (!provenance || typeof provenance !== 'object') return false;
  if (provenance.recordId || provenance.recordPath) return true;
  return typeof provenance.reason === 'string' && provenance.reason.length > 0;
}

test('composeEvidenceClaims does not attach an unrelated first-record id to aggregate counts', () => {
  const composed = composeEvidenceClaims({
    get_tasks_focus: {
      ok: true,
      store: 'tasks_hub',
      open_count: 3,
      overdue: [{ id: 'task-overdue', title: 'STEAM plan', due_date: '2026-08-10', updated_at: '2026-08-01' }],
      due_soon: [{ id: 'task-today', title: 'SMART goals', due_date: TODAY }],
      results: [{ id: 'first-unrelated', title: 'Ignore me' }],
      truncated: true,
      kept: 12,
      omitted: 2
    }
  });
  const count = composed.claims.find(claim => claim.fact === 'open_count');
  assert.equal(count.provenance.reason, 'derived_from_aggregate');
  assert.notEqual(count.provenance.recordId, 'first-unrelated');
  const overdue = composed.claims.find(claim => claim.fact === 'overdue_title');
  assert.equal(overdue.provenance.sourceType, 'record');
  assert.equal(overdue.provenance.recordId, 'task-overdue');
  assert.ok(composed.limitations.some(item => item.kind === 'truncated'));
});

test('Clare material claims carry typed provenance instead of silent null', () => {
  const kernel = runAgentKernel({
    slug: 'clare',
    message: 'What should I focus on today?',
    today: TODAY,
    now: NOW,
    stores: {
      tasks: [
        { id: 'steam', title: 'Plan STEAM extension', status: 'open', due_date: '2026-08-10', updated_at: '2026-08-01' },
        { id: 'smart', title: 'Draft SMART goals', status: 'open', due_date: TODAY, estimated_duration: 45 }
      ],
      projects: [],
      lessons: []
    }
  });
  const overdue = kernel.claims.find(claim => claim.fact === 'overdue_title');
  const open = kernel.claims.find(claim => claim.fact === 'open_count');
  const dueSoon = kernel.claims.find(claim => claim.fact === 'due_soon_title');
  assert.equal(overdue.value, 'Plan STEAM extension');
  assert.equal(overdue.provenance.recordId, 'steam');
  assert.equal(overdue.provenance.store, 'tasks_hub');
  assert.ok(usableProvenance(open.provenance));
  assert.equal(open.provenance.reason, 'derived_from_aggregate');
  assert.equal(dueSoon?.value, 'Draft SMART goals');
  assert.equal(dueSoon.provenance.recordId, 'smart');
  const unexplained = kernel.claims.filter(claim => !usableProvenance(claim.provenance));
  assert.deepEqual(unexplained.map(claim => claim.fact), []);
});

test('Chadwick material claims carry session or calculation provenance', () => {
  const kernel = runAgentKernel({
    slug: 'chadwick',
    message: 'How is my training going lately?',
    today: TODAY,
    now: NOW,
    stores: {
      workouts: [{
        id: 'wo-18',
        path: 'data/fitness/2026-08-18-upper.md',
        type: 'workout',
        status: 'completed',
        date: '2026-08-18',
        title: 'Upper',
        pain_flags: [{ site: 'right groin', note: 'goblet squat' }],
        exercises: [{ name: 'Bench Press', sets: [{ weight_kg: 60, reps: 8 }] }]
      }]
    }
  });
  const last = kernel.claims.find(claim => claim.fact === 'last_completed_date');
  assert.equal(last.value, '2026-08-18');
  assert.ok(usableProvenance(last.provenance));
  assert.ok(last.provenance.sourceType === 'record' || last.provenance.reason === 'derived_from_aggregate');
  const pain = kernel.claims.find(claim => claim.fact === 'pain_site');
  if (pain) {
    assert.ok(usableProvenance(pain.provenance));
    assert.notEqual(pain.provenance.reason, undefined);
  }
  const unexplained = kernel.claims.filter(claim => !usableProvenance(claim.provenance));
  assert.deepEqual(unexplained.map(claim => `${claim.tool}:${claim.fact}`), []);
});

test('kernel_trace exposes retrieve rounds and an inspectable sufficiency decision', () => {
  const tasks = Array.from({ length: 14 }, (_, i) => ({
    id: `t${i}`,
    title: i === 0 ? 'Overdue STEAM' : `Open ${i}`,
    status: 'open',
    due_date: i === 0 ? '2026-08-10' : TODAY
  }));
  const kernel = runAgentKernel({
    slug: 'clare',
    message: 'What should I focus on today?',
    today: TODAY,
    now: NOW,
    stores: { tasks, projects: [], lessons: [] }
  });
  assert.equal(kernel.evidence.get_tasks_focus.truncated, true);
  assert.equal(kernel.sufficient, true);
  assert.equal(kernel.retrieveRound, 1);
  const event = kernelTraceEvent(kernel);
  assert.ok(event.sufficiencyDecision);
  assert.equal(event.sufficiencyDecision.anotherRound, false);
  assert.match(event.sufficiencyDecision.reason, /truncated|get_tasks_focus|overdue|due/i);
  assert.ok(Array.isArray(event.retrieveLog));
  assert.equal(event.retrieveLog.length, 1);
  const round = event.retrieveLog[0];
  assert.equal(round.round, 1);
  assert.ok(round.tools.some(item => item.name === 'get_tasks_focus' && item.kind === 'truncated'));
  assert.ok(round.coverage);
});
