import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_WORKOUT_TOKEN,
  defaultLoadDecisionTraces,
  defaultLoadWorkoutCompare,
  enrichKnowledgePage,
  expandLiveTokens,
  formatLiveWorkoutCompare,
  loadLifeRepo,
  normalizeDecisionTraces
} from '../../netlify/functions/_shared/knowledge-live.mjs';
import {
  appendGovernanceEntry,
  emptyGovernanceLog
} from '../../apps/life/js/core/governance-log.js';

const COMPARE = {
  ok: true,
  weeks: 8,
  current: { from: '2026-07-13', to: '2026-09-06', count: 11 },
  previous: { from: '2026-05-18', to: '2026-07-12', count: 8 },
  delta: 3
};

test('expandLiveTokens leaves ordinary Knowledge bodies alone', () => {
  assert.equal(expandLiveTokens('# Hello\n\nStatic note.', COMPARE), '# Hello\n\nStatic note.');
});

test('expandLiveTokens replaces the workout compare token with the computed counts', () => {
  const body = `Completed workouts:\n\n${LIVE_WORKOUT_TOKEN}\n`;
  const expanded = expandLiveTokens(body, COMPARE);
  assert.doesNotMatch(expanded, /\{\{life:compare_workout_windows\}\}/);
  assert.match(expanded, /11 completed workouts/);
  assert.match(expanded, /8 completed workouts/);
  assert.match(expanded, /\+3/);
  assert.match(expanded, /13\/07\/26/);
  assert.match(expanded, /06\/09\/26/);
});

test('expandLiveTokens is fail-visible when the compare is missing', () => {
  const expanded = expandLiveTokens(`Pulse\n\n${LIVE_WORKOUT_TOKEN}`, { ok: false });
  assert.match(expanded, /unavailable/i);
  assert.doesNotMatch(expanded, /0 completed/);
});

test('formatLiveWorkoutCompare names the windows without raw ISO dates', () => {
  const text = formatLiveWorkoutCompare(COMPARE);
  assert.doesNotMatch(text, /2026-07-13/);
  assert.match(text, /13\/07\/26/);
});

test('enrichKnowledgePage keeps the stored token and expands live_body', () => {
  const page = enrichKnowledgePage({
    id: 'page_training_pulse',
    body: `Pulse\n\n${LIVE_WORKOUT_TOKEN}`
  }, { compare: COMPARE });
  assert.match(page.body, /\{\{life:compare_workout_windows\}\}/);
  assert.match(page.live_body, /11 completed workouts/);
  assert.doesNotMatch(page.live_body, /\{\{life:compare_workout_windows\}\}/);
});

test('enrichKnowledgePage marks decision traces unavailable without inventing a history', () => {
  const page = enrichKnowledgePage({
    id: 'page_aotfw',
    body: 'Static',
    connected: ['life:decision:aotfw-sources']
  }, { traces: [], tracesStatus: 'unavailable' });
  assert.equal(page.decision_traces, undefined);
  assert.equal(page.decision_traces_status, 'unavailable');
});

test('normalizeDecisionTraces accepts a bare array from an injected loader', () => {
  assert.deepEqual(normalizeDecisionTraces([{ decisionId: 'a' }]), {
    traces: [{ decisionId: 'a' }],
    status: 'ready'
  });
});

const LIFE_ENV = {
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01'
};
const COMMIT_SHA = 'b'.repeat(40);
const TREE_SHA = 'c'.repeat(40);
const WORKOUT_CURRENT_SHA = '1'.repeat(40);
const WORKOUT_PREVIOUS_SHA = '2'.repeat(40);
const GOVERNANCE_SHA = '3'.repeat(40);

function workoutDoc(date, title) {
  return [
    '---',
    'schema_version: 1',
    `id: "workout-${date}"`,
    'type: workout',
    `date: ${date}`,
    'time: "16:28"',
    `created_at: ${date}T16:28:00+10:00`,
    `updated_at: ${date}T16:28:00+10:00`,
    'source: chat',
    `title: ${title}`,
    'session_kind: strength',
    'day_type: workout_30',
    'status: completed',
    'duration_min: 30',
    'exercises:',
    '  - name: Bar Press',
    '    sets:',
    '      - { reps: 10, weight_kg: 40, cable_type: constant_force }',
    '---',
    title
  ].join('\n');
}

function memoryLifeGithub({ blobs = {}, tree = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes('/commits/')) {
      return Response.json({ sha: COMMIT_SHA, commit: { tree: { sha: TREE_SHA } } });
    }
    if (href.includes('/git/trees/')) {
      return Response.json({ tree });
    }
    const blobMatch = /\/git\/blobs\/([0-9a-f]{40})/.exec(href);
    if (blobMatch && blobs[blobMatch[1]]) {
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(blobs[blobMatch[1]], 'utf8').toString('base64')
      });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  return { calls, fetchImpl };
}

test('defaultLoadWorkoutCompare reads the Life tree and counts both windows', async () => {
  const currentPath = 'data/fitness/2026/08/2026-08-01-workout.md';
  const previousPath = 'data/fitness/2026/06/2026-06-01-workout.md';
  const { fetchImpl } = memoryLifeGithub({
    tree: [
      { path: currentPath, type: 'blob', sha: WORKOUT_CURRENT_SHA },
      { path: previousPath, type: 'blob', sha: WORKOUT_PREVIOUS_SHA }
    ],
    blobs: {
      [WORKOUT_CURRENT_SHA]: workoutDoc('2026-08-01', 'Current'),
      [WORKOUT_PREVIOUS_SHA]: workoutDoc('2026-06-01', 'Previous')
    }
  });
  const compare = await defaultLoadWorkoutCompare({
    env: LIFE_ENV,
    fetchImpl,
    today: '2026-09-06'
  });
  assert.equal(compare.ok, true);
  assert.equal(compare.current.count, 1);
  assert.equal(compare.previous.count, 1);
  assert.equal(compare.delta, 0);
});

test('defaultLoadDecisionTraces is ready and empty when the governance file is missing', async () => {
  const { fetchImpl } = memoryLifeGithub({
    tree: [{ path: 'data/fitness/2026/08/2026-08-01-workout.md', type: 'blob', sha: WORKOUT_CURRENT_SHA }]
  });
  const loaded = await defaultLoadDecisionTraces({
    env: LIFE_ENV,
    fetchImpl,
    page: { connected: ['life:decision:aotfw-sources'] }
  });
  assert.deepEqual(loaded, { traces: [], status: 'ready' });
});

test('defaultLoadDecisionTraces groups the connected Life decision', async () => {
  let log = appendGovernanceEntry(emptyGovernanceLog(), {
    dateKey: '2026-09-01',
    entryType: 'Major Decision',
    title: 'AOTFW sources',
    decisionId: 'aotfw-sources',
    chosen: 'Keep the unit linked',
    body: 'Identity lives on the Knowledge page.'
  });
  log = appendGovernanceEntry(log, {
    dateKey: '2026-08-01',
    entryType: 'Major Decision',
    title: 'AOTFW sources',
    decisionId: 'aotfw-sources',
    chosen: 'Start the unit',
    body: 'First take.'
  });
  const { fetchImpl } = memoryLifeGithub({
    tree: [{ path: 'data/governance/governance-log.md', type: 'blob', sha: GOVERNANCE_SHA }],
    blobs: { [GOVERNANCE_SHA]: log }
  });
  const loaded = await defaultLoadDecisionTraces({
    env: LIFE_ENV,
    fetchImpl,
    page: { connected: ['life:decision:aotfw-sources'] }
  });
  assert.equal(loaded.status, 'ready');
  assert.equal(loaded.traces[0].decisionId, 'aotfw-sources');
  assert.deepEqual(loaded.traces[0].steps.map(step => step.chosen), [
    'Start the unit',
    'Keep the unit linked'
  ]);
});

test('default loaders are fail-visible when Life GitHub env is missing', async () => {
  const compare = await defaultLoadWorkoutCompare({ env: {}, fetchImpl: async () => {
    throw new Error('GitHub must not be called');
  } });
  const traces = await defaultLoadDecisionTraces({
    env: {},
    fetchImpl: async () => {
      throw new Error('GitHub must not be called');
    },
    page: { connected: ['life:decision:aotfw-sources'] }
  });
  assert.equal(compare.ok, false);
  assert.deepEqual(traces, { traces: [], status: 'unavailable' });
});

test('loadLifeRepo shares one tree with both default loaders', async () => {
  const currentPath = 'data/fitness/2026/08/2026-08-01-workout.md';
  const log = appendGovernanceEntry(emptyGovernanceLog(), {
    dateKey: '2026-09-01',
    entryType: 'Major Decision',
    title: 'AOTFW sources',
    decisionId: 'aotfw-sources',
    body: 'Keep the unit linked.'
  });
  const { calls, fetchImpl } = memoryLifeGithub({
    tree: [
      { path: currentPath, type: 'blob', sha: WORKOUT_CURRENT_SHA },
      { path: 'data/governance/governance-log.md', type: 'blob', sha: GOVERNANCE_SHA }
    ],
    blobs: {
      [WORKOUT_CURRENT_SHA]: workoutDoc('2026-08-01', 'Current'),
      [GOVERNANCE_SHA]: log
    }
  });
  const lifeRepo = await loadLifeRepo({ env: LIFE_ENV, fetchImpl });
  const treeCalls = calls.filter(url => url.includes('/git/trees/') || url.includes('/commits/'));
  const [compare, traces] = await Promise.all([
    defaultLoadWorkoutCompare({ env: LIFE_ENV, fetchImpl, today: '2026-09-06', lifeRepo }),
    defaultLoadDecisionTraces({
      env: LIFE_ENV,
      fetchImpl,
      page: { connected: ['life:decision:aotfw-sources'] },
      lifeRepo
    })
  ]);
  assert.equal(compare.ok, true);
  assert.equal(traces.status, 'ready');
  assert.equal(calls.filter(url => url.includes('/git/trees/') || url.includes('/commits/')).length, treeCalls.length);
});
