// tests/unit/thinking-threads.test.js
// Threads: the pure thread functions (sessions, detours one level deep, landing, hand over,
// route and Not now, rest, listing), the revision-checked store (409 carries the current
// thread), and the API: create, list, actions, detours to an engine tool, a protocol draft and
// Thought Starter, and landing ticked lines. Invented situations only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createMemoryCognitiveStore } from '../../netlify/functions/_shared/cognitive-store.mjs';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { createProblemSolverService } from '../../netlify/functions/_shared/problem-solver/service.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import {
  addSession, createThread, draftTitle, handOver, homeOf, isListed, landPacket, patchThread, recordRoute, setDigest,
  setLanding, setSessionState, wasDeclined
} from '../../netlify/functions/_shared/thinking-threads/thread.mjs';
import { createThreadStore, THREAD_PREFIX, threadIndexRow } from '../../netlify/functions/_shared/thinking-threads/store.mjs';
import { createThinkingThreadsHandler, ENGINE_DEPS, routeFor } from '../../netlify/functions/thinking-threads.mjs';

const NOW = '2026-11-10T09:00:00.000Z';
const SITUATION = 'Our book club keeps choosing books nobody finishes. I want a better way to pick.';
const HOME = { kind: 'tool', tool: 'problem-solver', sessionId: 'home-1' };

const withDetour = () => addSession(createThread({ situation: SITUATION, homeSession: HOME, now: NOW }), {
  kind: 'tool', tool: 'decision-book', sessionId: 'detour-1', role: 'detour', from: { sessionId: 'home-1', stepId: 'options' }, question: 'Which of the two shortlists?', now: NOW
});

test('a new thread drafts its title, starts open with an empty digest, and its home joins', () => {
  const t = createThread({ situation: SITUATION, homeSession: HOME, now: NOW });
  assert.equal(t.title, 'Our book club keeps choosing books nobody finishes');
  assert.equal(t.revision, 0);
  assert.equal(t.status, 'open');
  assert.deepEqual(t.digest, { facts: [], choices: [], restsOn: [], openQuestions: [] });
  assert.equal(homeOf(t).sessionId, 'home-1');
  assert.equal(homeOf(t).state, 'open');
  assert.throws(() => createThread({ situation: '  ', now: NOW }), { status: 400 });
  assert.ok(draftTitle('x'.repeat(200)).length <= 80);
});

test('a detour leaves from home, one level only; the same session again is a no-op', () => {
  const t = withDetour();
  assert.equal(t.sessions.length, 2);
  assert.deepEqual(t.sessions[1].from, { sessionId: 'home-1', stepId: 'options' });
  assert.equal(addSession(t, { kind: 'tool', tool: 'decision-book', sessionId: 'detour-1', role: 'detour', from: { sessionId: 'home-1' }, now: NOW }), t);
  assert.throws(() => addSession(t, { kind: 'tool', tool: 'rules-book', sessionId: 'd2', role: 'detour', from: { sessionId: 'detour-1' }, now: NOW }), { status: 409 });
  assert.throws(() => addSession(t, { kind: 'tool', tool: 'rules-book', sessionId: 'd3', role: 'detour', now: NOW }), { status: 400 });
  assert.throws(() => addSession(t, { kind: 'tool', tool: 'rules-book', sessionId: 'd4', role: 'handed_on', now: NOW }), { status: 400 });
});

test('a packet lands as returned; the landing is answer, note or dismissed, only once returned', () => {
  let t = withDetour();
  assert.throws(() => setLanding(t, 'detour-1', 'answer', NOW), { status: 409 });
  t = setSessionState(t, 'detour-1', 'running', NOW);
  t = landPacket(t, 'detour-1', { answer: 'The shorter list', source: { tool: 'decision-book', sessionId: 'detour-1' } }, NOW);
  assert.equal(t.sessions[1].state, 'returned');
  assert.equal(t.sessions[1].returnedAt, NOW);
  t = setLanding(t, 'detour-1', 'note', NOW);
  assert.equal(t.sessions[1].landing, 'note');
  assert.throws(() => setLanding(t, 'detour-1', 'keep', NOW), { status: 400 });
  assert.throws(() => setSessionState(t, 'nope', 'open', NOW), { status: 404 });
});

test('hand over: the detour becomes home, the old home is handed on', () => {
  const t = handOver(withDetour(), 'detour-1', NOW);
  assert.equal(homeOf(t).sessionId, 'detour-1');
  assert.deepEqual(homeOf(t).handedFrom, { sessionId: 'home-1', stepId: 'options' });
  assert.equal(t.sessions.find((s) => s.sessionId === 'home-1').role, 'handed_on');
  assert.equal(handOver(t, 'detour-1', NOW), t, 'already home');
  assert.throws(() => handOver(t, 'home-1', NOW), { status: 409 });
});

test('route: every outcome is logged with its step; Not now at a step is declined there only', () => {
  let t = withDetour();
  t = recordRoute(t, { joint: 'step_done', optionId: 'rb_pareto', outcome: 'not_now', stepId: 'explore', sessionId: 'home-1', now: NOW });
  assert.equal(t.lastCheckAt, NOW);
  assert.ok(wasDeclined(t, { optionId: 'rb_pareto', fromStepId: 'explore' }));
  assert.ok(!wasDeclined(t, { optionId: 'rb_pareto', fromStepId: 'decide' }));
  assert.ok(!wasDeclined(t, { optionId: 'tool:rules-book', fromStepId: 'explore' }));
  assert.throws(() => recordRoute(t, { joint: 'lunch', optionId: 'x', outcome: 'taken', now: NOW }), { status: 400 });
  assert.throws(() => recordRoute(t, { joint: 'asked', optionId: 'x', outcome: 'maybe', now: NOW }), { status: 400 });
  for (let i = 0; i < 210; i += 1) t = recordRoute(t, { joint: 'asked', optionId: 'x', outcome: 'shown', now: NOW });
  assert.equal(t.route.length, 200);
});

test('patch: resting needs a date, leaving rest clears it; the digest keeps short lists', () => {
  let t = withDetour();
  assert.throws(() => patchThread(t, { status: 'resting' }, NOW), { status: 400 });
  t = patchThread(t, { status: 'resting', restUntil: '2026-11-20', title: 'Picking books' }, NOW);
  assert.equal(t.restUntil, '2026-11-20');
  assert.equal(t.title, 'Picking books');
  t = patchThread(t, { status: 'open' }, NOW);
  assert.equal(t.restUntil, null);
  t = setDigest(t, { facts: ['Eight members', '', 42], choices: 'not a list' }, NOW);
  assert.deepEqual(t.digest, { facts: ['Eight members', '42'], choices: [], restsOn: [], openQuestions: [] });
});

test('listed: more than one session or any detour; a quiet thread is not', () => {
  assert.equal(isListed(createThread({ situation: SITUATION, homeSession: HOME, now: NOW })), false);
  assert.equal(isListed(withDetour()), true);
  const row = threadIndexRow(withDetour());
  assert.equal(row.listed, true);
  assert.equal(row.situation, undefined, 'the index row carries no situation');
  assert.equal(THREAD_PREFIX, 'thinking-threads/v1');
});

test('store: revision-checked writes; a stale revision is a 409 carrying the current thread', async () => {
  const threads = createThreadStore(createMemoryCognitiveStore());
  const quiet = await threads.create('me', createThread({ situation: 'A quiet one about a leaking tap.', homeSession: { ...HOME, sessionId: 'q' }, now: NOW }));
  const made = await threads.create('me', withDetour());
  const next = await threads.update('me', made.id, 0, (t) => patchThread(t, { title: 'Renamed' }, NOW));
  assert.equal(next.revision, 1);
  await assert.rejects(threads.update('me', made.id, 0, (t) => t), (error) => error.status === 409 && error.thread.revision === 1);
  const latest = await threads.updateLatest('me', made.id, (t) => patchThread(t, { title: 'Again' }, NOW));
  assert.equal(latest.revision, 2);
  assert.deepEqual((await threads.list('me')).map((r) => r.id), [made.id], 'the quiet thread is not listed');
  assert.equal((await threads.get('me', quiet.id)).id, quiet.id);
  await assert.rejects(threads.get('me', 'not-a-uuid'), { status: 400 });
  await assert.rejects(threads.get('me', randomUUID()), { status: 404 });
});

// --- The API ----------------------------------------------------------------------------------

const MS = Date.parse('2026-11-10T20:00:00+11:00');
const SECRET = 's'.repeat(32);
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const TOKEN = createSessionToken({ now: MS, randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

function harness(extra = {}) {
  const store = createMemoryCognitiveStore();
  const engineStores = new Map();
  const engineService = (env, tool) => {
    if (!engineStores.has(tool)) engineStores.set(tool, createMemoryProblemStore());
    return createProblemSolverService({ store: engineStores.get(tool), coach: scriptedCoach, kinds: ENGINE_DEPS[tool].kinds, threads: null });
  };
  const protocolCalls = [];
  const handler = createThinkingThreadsHandler({
    env: ENV,
    now: () => MS,
    getStore: async () => store,
    engineService,
    invokeRun: async () => false,
    createProtocolSession: async (request, env, body) => { protocolCalls.push(body); return { id: 'proto-1' }; },
    loadProtocolSession: async () => ({ id: 'proto-1', summary: { keyFinding: 'The club wants shorter books.', summary: 'Most stop at page 100.', openQuestions: ['Who picks next?'] } }),
    loadQuestions: async () => [{ id: 'q_a', prompt: 'What would a good pick feel like for the club?' }, { id: 'q_b', prompt: 'What is the weather like?' }, { id: 'q_c', prompt: 'Which books did the club finish?' }, { id: 'q_d', prompt: 'Who chooses books?' }],
    ...extra
  });
  const call = async (method, body, query = '') => {
    const res = await handler(new Request(`https://life.example/api/thinking-threads${query}`, {
      method,
      headers: { cookie: `life_hub_session=${TOKEN}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    }));
    const json = await res.json();
    return { status: res.status, data: json.data, error: json.error };
  };
  return { call, protocolCalls, engineService };
}

test('API: create, get, list (listed only), simple actions, and a stale revision returns data.thread', async () => {
  const { call } = harness();
  let { status, data } = await call('POST', { create: { situation: SITUATION, home: { tool: 'problem-solver', sessionId: 'home-1' } } });
  assert.equal(status, 200);
  let t = data.thread;
  assert.equal(homeOf(t).tool, 'problem-solver');
  assert.deepEqual((await call('GET', null, '?list=1')).data.threads, []);
  ({ data } = await call('POST', { id: t.id, revision: t.revision, action: 'add_session', kind: 'tool', tool: 'rules-book', sessionId: 'd1', role: 'detour', from: { sessionId: 'home-1', stepId: 'explore' } }));
  t = data.thread;
  assert.equal(t.revision, 1);
  assert.equal((await call('GET', null, '?list=1')).data.threads[0].id, t.id);
  ({ data } = await call('POST', { id: t.id, revision: t.revision, action: 'route', joint: 'step_done', optionId: 'tool:rules-book', outcome: 'not_now', stepId: 'explore', sessionId: 'home-1' }));
  t = data.thread;
  assert.equal(t.route[0].outcome, 'not_now');
  ({ data } = await call('POST', { id: t.id, revision: t.revision, action: 'patch', status: 'resting', restUntil: '2026-11-17' }));
  t = data.thread;
  assert.equal(t.status, 'resting');
  ({ data } = await call('POST', { id: t.id, revision: t.revision, action: 'hand_over', sessionId: 'd1' }));
  t = data.thread;
  assert.equal(homeOf(t).sessionId, 'd1');
  const stale = await call('POST', { id: t.id, revision: 0, action: 'patch', title: 'Old page' });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.thread.revision, t.revision);
  assert.equal((await call('GET', null, `?id=${t.id}`)).data.thread.title, t.title);
  assert.equal((await call('POST', { id: t.id, revision: t.revision, action: 'dance' })).status, 400);
});

test('API detour to an engine tool: the session starts as a detour in its tool and joins the thread', async () => {
  const { call, engineService } = harness();
  let t = (await call('POST', { create: { situation: SITUATION, home: { tool: 'problem-solver', sessionId: 'home-1' } } })).data.thread;
  const res = await call('POST', { id: t.id, revision: t.revision, action: 'detour', optionId: 'rb_pareto', fromSessionId: 'home-1', fromStepId: 'explore', stepTitle: 'Explore', workSoFar: 'Listed the last six picks.', question: 'Which few picks cause most of the unfinished books?', joint: 'step_done', reason: 'A few picks may explain most of it.' });
  assert.equal(res.status, 200);
  t = res.data.thread;
  const detour = t.sessions.find((s) => s.role === 'detour');
  assert.equal(detour.tool, 'rules-book');
  assert.equal(res.data.open.tool, 'rules-book');
  assert.equal(res.data.open.route, `#/rules-book?id=${detour.sessionId}`);
  assert.deepEqual(t.route.at(-1), { at: t.route.at(-1).at, joint: 'step_done', optionId: 'rb_pareto', reason: 'A few picks may explain most of it.', outcome: 'taken', stepId: 'explore', sessionId: 'home-1' });
  const session = await (await engineService(ENV, 'rules-book')).get('operator', detour.sessionId);
  assert.equal(session.kind, 'rules');
  assert.equal(session.threadId, t.id);
  assert.equal(session.threadDetour.fromSessionId, 'home-1');
  assert.equal(session.threadDetour.question, 'Which few picks cause most of the unfinished books?');
  assert.equal(session.threadDetour.frameDraft.group, '', 'placement keys stay for the coach');
  const nested = await call('POST', { id: t.id, revision: t.revision, action: 'detour', optionId: 'tool:decision-book', fromSessionId: detour.sessionId });
  assert.equal(nested.status, 409, 'never a detour of a detour');
  const stale = await call('POST', { id: t.id, revision: 0, action: 'detour', optionId: 'tool:decision-book', fromSessionId: 'home-1' });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.thread.revision, t.revision);
});

test('API detour to a protocol: a draft only, or a run started with its origin', async () => {
  const { call, protocolCalls } = harness();
  let t = (await call('POST', { create: { situation: SITUATION, home: { tool: 'problem-solver', sessionId: 'home-1' } } })).data.thread;
  const draft = await call('POST', { id: t.id, revision: t.revision, action: 'detour', optionId: 'protocol:fates', fromSessionId: 'home-1', draftOnly: true });
  assert.equal(draft.data.draft.protocolId, 'fates');
  assert.equal(draft.data.draft.mode, 'sprint');
  assert.ok(draft.data.draft.intake.task);
  assert.equal(draft.data.thread.revision, 0, 'a draft writes nothing');
  const run = await call('POST', { id: t.id, revision: t.revision, action: 'detour', optionId: 'protocol:fates', fromSessionId: 'home-1', fromStepId: 'options' });
  t = run.data.thread;
  assert.deepEqual(protocolCalls[0].origin, { threadId: t.id, sessionId: 'home-1', stepId: 'options' });
  assert.equal(t.sessions[1].kind, 'protocol');
  assert.equal(t.sessions[1].state, 'running');
  assert.equal(run.data.open.route, routeFor('knowledge-protocols', 'proto-1', t.id));
  const landed = await call('POST', { id: t.id, revision: t.revision, action: 'land', sessionId: 'proto-1' });
  assert.equal(landed.data.thread.sessions[1].packet.answer, 'The club wants shorter books.');
});

test('API detour to Thought Starter: questions picked by overlap, opened in the thread view; ticked lines land', async () => {
  const { call } = harness();
  let t = (await call('POST', { create: { situation: SITUATION, home: { tool: 'problem-solver', sessionId: 'home-1' } } })).data.thread;
  const res = await call('POST', { id: t.id, revision: t.revision, action: 'detour', optionId: 'qb_making_decisions', fromSessionId: 'home-1', question: 'How should the club choose books?' });
  t = res.data.thread;
  const entry = t.sessions[1];
  assert.equal(entry.tool, 'question-book');
  assert.equal(res.data.open.questions.chapterId, 'qb_making_decisions');
  assert.equal(res.data.open.questions.questionIds.length, 3);
  assert.ok(!res.data.open.questions.questionIds.includes('q_b'), 'the unrelated question is left out');
  assert.match(res.data.open.route, new RegExp(`^#/think/${t.id}\\?detour=`));
  assert.equal((await call('POST', { id: t.id, revision: t.revision, action: 'land', sessionId: entry.sessionId, record: { lines: [] } })).status, 400);
  const landed = await call('POST', { id: t.id, revision: t.revision, action: 'land', sessionId: entry.sessionId, record: { lines: ['Pick shorter books for the summer.', 'Vote on three, not ten.'] } });
  const packet = landed.data.thread.sessions[1].packet;
  assert.equal(packet.answer, 'Pick shorter books for the summer.');
  assert.deepEqual(packet.source, { tool: 'question-book', sessionId: entry.sessionId });
});
