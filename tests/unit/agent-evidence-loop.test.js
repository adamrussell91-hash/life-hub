/**
 * Tranche B–D — bounded retrieve loop, conflict handling, durable resume.
 * Deterministic kernel tests. Not live conversational behaviour.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runAgentKernel,
  resumeAgentKernel,
  MAX_RETRIEVE_ROUNDS
} from '../../netlify/functions/_shared/agent-kernel.mjs';
import { createMemoryTurnStore } from '../../netlify/functions/_shared/agent-turn-store.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

test('missing medical retrieve is recovered on a second kernel pass', () => {
  const kernel = runAgentKernel({
    slug: 'sara',
    message: 'any medical context I should know',
    today: TODAY,
    now: NOW,
    deferTools: ['search_medical_records'],
    stores: {
      composition: [{ date: '2026-08-18', weight_kg: 90 }],
      measurements: [],
      medicalEvents: [{
        path: 'data/medical/2026-08-12-clinic.md',
        record: { type: 'medical', date: '2026-08-12', title: 'GP review', provider: 'Dr Chen' },
        body: 'Discussed flare'
      }]
    }
  });
  assert.ok(kernel.retrieveRound >= 2);
  assert.ok(kernel.evidence.search_medical_records);
  assert.equal(kernel.evidence.search_medical_records.count >= 1, true);
  assert.ok(kernel.trace.filter(item => item.stage === 'retrieve').length >= 2);
});

test('truncated knowledge search widens on a second retrieve', () => {
  const pages = Array.from({ length: 12 }, (_, i) => ({
    id: `note-${i}`,
    title: `Cognitive load note ${i}`,
    excerpt: `Excerpt ${i} about working memory`,
    tags: ['memory']
  }));
  const kernel = runAgentKernel({
    slug: 'clementine',
    message: 'what do I already know about cognitive load',
    today: TODAY,
    now: NOW,
    stores: { pages }
  });
  assert.ok(kernel.retrieveRound >= 2);
  assert.ok((kernel.evidence.search_knowledge.results ?? []).length > 8);
});

test('weight conflict resolves by recency and remains visible', () => {
  const kernel = runAgentKernel({
    slug: 'sara',
    message: 'is my weight change unusual lately',
    today: TODAY,
    now: NOW,
    stores: {
      composition: [
        { date: '2026-08-15', weight_kg: 95 },
        { date: '2026-08-14', weight_kg: 86 }
      ],
      measurements: [],
      medicalEvents: []
    }
  });
  const trend = kernel.evidence.get_weight_trend;
  assert.equal(trend.conflict?.resolved, true);
  assert.equal(trend.conflict?.method, 'recency');
  assert.equal(trend.conflict?.winner_kg, 95);
  assert.ok(kernel.conflicts.some(item => item.resolved === true));
});

test('conflict without recency signal stays unresolved', () => {
  const kernel = runAgentKernel({
    slug: 'chadwick',
    message: 'training recap',
    today: TODAY,
    now: NOW,
    stores: {
      workouts: [{
        type: 'workout',
        status: 'completed',
        date: '2026-08-18',
        title: 'Upper',
        exercises: [{ name: 'Bench', sets: [{ weight_kg: 60, reps: 8 }] }]
      }]
    }
  });
  kernel.evidence.get_fitness_snapshot = {
    ...kernel.evidence.get_fitness_snapshot,
    conflict: { kind: 'session_disagreement' }
  };
  const assessed = runAgentKernel({ state: { ...kernel, stage: 'retrieved', nextRetrievals: [] } });
  assert.ok(assessed.unresolvedConflicts.some(item => item.method === 'unresolved'));
  assert.equal(assessed.complete, false);
});

test('empty medical store exhausts without unbounded retries', () => {
  const kernel = runAgentKernel({
    slug: 'sara',
    message: 'health timeline please',
    today: TODAY,
    now: NOW,
    stores: { composition: [], measurements: [], medicalEvents: [] }
  });
  assert.ok(kernel.retrieveRound <= MAX_RETRIEVE_ROUNDS);
  assert.equal(kernel.exhausted || kernel.complete === false, true);
});

test('durable persist survives process restart after retrieve halt', () => {
  const persist = createMemoryTurnStore();
  const stores = {
    workouts: [{
      type: 'workout',
      status: 'completed',
      date: '2026-08-18',
      title: 'Upper',
      exercises: [{ name: 'Bench', sets: [{ weight_kg: 60, reps: 8 }] }]
    }]
  };
  const halted = runAgentKernel({
    slug: 'chadwick',
    message: 'training recap',
    today: TODAY,
    now: NOW,
    stores,
    persist,
    failAt: 'retrieve'
  });
  assert.equal(halted.halted, 'retrieve');
  const snap = persist.exportJson();
  assert.doesNotMatch(snap, /"stores"\s*:/);
  const restarted = createMemoryTurnStore();
  restarted.importJson(snap);
  const loaded = restarted.load(halted.id);
  assert.ok(loaded);
  assert.equal(loaded.stores, undefined);
  assert.notEqual(loaded, halted);
  const resumed = resumeAgentKernel(loaded, { persist: restarted, stores });
  assert.equal(resumed.stage, 'composed');
  assert.ok(resumed.evidence.get_fitness_snapshot.last_completed_date);
  assert.equal(resumed.trace.filter(item => item.stage === 'retrieve').length, 1);
});

test('resume after plan halt does not lose the plan', () => {
  const persist = createMemoryTurnStore();
  const halted = runAgentKernel({
    slug: 'clare',
    message: 'What should I focus on today?',
    today: TODAY,
    now: NOW,
    stores: { tasks: [{ id: '1', title: 'Mark essays', status: 'open', due_date: '2026-08-10' }] },
    persist,
    failAt: 'plan'
  });
  const snap = persist.exportJson();
  const restarted = createMemoryTurnStore();
  restarted.importJson(snap);
  const resumed = resumeAgentKernel(restarted.load(halted.id), {
    persist: restarted,
    stores: { tasks: [{ id: '1', title: 'Mark essays', status: 'open', due_date: '2026-08-10' }] }
  });
  assert.equal(resumed.plan.workflow, 'daily_focus');
  assert.ok(resumed.evidence.get_tasks_focus);
});

test('persisted turn omits large source stores and still resumes from gathered evidence', () => {
  const persist = createMemoryTurnStore();
  const pages = Array.from({ length: 80 }, (_, i) => ({
    id: `note-${i}`,
    title: `Cognitive load note ${i}`,
    excerpt: `Working memory excerpt ${i} `.repeat(40),
    tags: ['memory'],
    body: 'x'.repeat(800)
  }));
  const fat = runAgentKernel({
    slug: 'clementine',
    message: 'what do I already know about cognitive load',
    today: TODAY,
    now: NOW,
    stores: { pages },
    persist
  });
  const saved = persist.load(fat.id);
  assert.equal(saved.stores, undefined);
  assert.ok(saved.sourceRefs.pages.count === 80);
  assert.ok(saved.evidence.search_knowledge);
  const raw = persist.exportJson();
  assert.doesNotMatch(raw, /"stores"\s*:/);
  assert.ok(!raw.includes(pages[0].body));
  const fatJson = JSON.stringify(fat);
  assert.ok(raw.length < fatJson.length / 2, `compact ${raw.length} should be much smaller than live ${fatJson.length}`);
  const resumed = resumeAgentKernel(saved, { persist });
  assert.ok((resumed.evidence.search_knowledge.results ?? []).length > 0);
  assert.equal(resumed.actions.length, fat.actions.length);
});

test('turn store evicts the oldest of 40 compact turns', () => {
  const persist = createMemoryTurnStore();
  const ids = [];
  for (let i = 0; i < 41; i += 1) {
    const kernel = runAgentKernel({
      slug: 'clare',
      message: 'What should I focus on today?',
      today: TODAY,
      now: NOW,
      stores: { tasks: [{ id: String(i), title: `Task ${i}`, status: 'open', due_date: '2026-08-10' }] },
      persist
    });
    ids.push(kernel.id);
  }
  assert.equal(persist.load(ids[0]), null);
  assert.ok(persist.load(ids[40]));
  const dump = JSON.parse(persist.exportJson());
  assert.equal(Object.keys(dump).length, 40);
  for (const turn of Object.values(dump)) {
    assert.equal(turn.stores, undefined);
  }
});
