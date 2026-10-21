// tests/unit/problem-solver-http.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createProblemSolverHandler } from '../../netlify/functions/problem-solver.mjs';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';

const NOW = Date.parse('2026-10-16T10:00:00+11:00');
const SECRET = 's'.repeat(32);
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

function harness({ kick = async () => true } = {}) {
  const store = createMemoryProblemStore();
  const kicks = [];
  const handler = createProblemSolverHandler({
    env: ENV,
    now: () => NOW,
    getStore: async () => store,
    coach: scriptedCoach,
    invokeRun: async (request, id) => { kicks.push(id); return kick(); }
  });
  const call = (method, path, body) => handler(new Request(`https://life.example${path}`, {
    method,
    headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  }));
  return { call, kicks };
}

test('unauthenticated requests are refused', async () => {
  const handler = createProblemSolverHandler({ env: ENV, now: () => NOW, getStore: async () => createMemoryProblemStore() });
  const res = await handler(new Request('https://life.example/api/problem-solver?list=1'));
  assert.equal(res.status, 401);
});

test('create returns 202 and kicks the runner', async () => {
  const { call, kicks } = harness();
  const res = await call('POST', '/api/problem-solver', { create: { text: 'Late rota.', requestId: 'r1' } });
  assert.equal(res.status, 202);
  const { data } = await res.json();
  assert.equal(data.session.runner.status, 'queued');
  assert.deepEqual(kicks, [data.session.id]);
});

test('falls back to an inline run when the kick fails', async () => {
  const { call } = harness({ kick: async () => false });
  const res = await call('POST', '/api/problem-solver', { create: { text: 'Late rota.', requestId: 'r1' } });
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.session.runner.status, 'idle');
  assert.equal(data.session.turns.at(-1).role, 'coach');
});

test('list and get', async () => {
  const { call } = harness({ kick: async () => false });
  const created = (await (await call('POST', '/api/problem-solver', { create: { text: 'Late rota.', requestId: 'r1' } })).json()).data.session;
  const list = (await (await call('GET', '/api/problem-solver?list=1')).json()).data.sessions;
  assert.equal(list[0].id, created.id);
  const got = await call('GET', `/api/problem-solver?id=${created.id}`);
  assert.equal(got.status, 200);
});

test('stale revision is 409', async () => {
  const { call } = harness({ kick: async () => false });
  const s = (await (await call('POST', '/api/problem-solver', { create: { text: 'Late rota.', requestId: 'r1' } })).json()).data.session;
  const res = await call('POST', '/api/problem-solver', { id: s.id, revision: s.revision - 1, requestId: 'r2', action: 'say', text: 'more words here' });
  assert.equal(res.status, 409);
});

test('no store configured is 503', async () => {
  const handler = createProblemSolverHandler({ env: ENV, now: () => NOW, getStore: async () => null });
  const res = await handler(new Request('https://life.example/api/problem-solver?list=1', { headers: { cookie: `life_hub_session=${SESSION}` } }));
  assert.equal(res.status, 503);
});

test('an unstatused illegal_slot error maps to 409', async () => {
  const store = { ...createMemoryProblemStore(), read: async () => { throw Object.assign(new Error('Slot x is not open.'), { code: 'illegal_slot' }); } };
  const handler = createProblemSolverHandler({ env: ENV, now: () => NOW, getStore: async () => store, coach: scriptedCoach, invokeRun: async () => true });
  const res = await handler(new Request('https://life.example/api/problem-solver', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
    body: JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', action: 'say', text: 'x' })
  }));
  assert.equal(res.status, 409);
});

test('GET ?linked= returns the sessions linked to a task', async () => {
  const { call } = harness();
  const res = await call('GET', '/api/problem-solver?linked=task:task-1');
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.deepEqual(data.sessions, []);
  assert.equal((await call('GET', '/api/problem-solver?linked=bad')).status, 400);
});

test('an escalate action starts a coach run for the new full session', async () => {
  const store = createMemoryProblemStore();
  const kicks = [];
  let kickResult = false;
  const coach = async () => ({ verdict: 'clarify', message: 'Does it keep coming back?', node: null, edges: [], skillsSeen: [], skillsMissing: [], suggestion: { kind: 'escalate', reason: 'It recurs.' }, summary: null, lightning: null });
  const handler = createProblemSolverHandler({ env: ENV, now: () => NOW, getStore: async () => store, coach, invokeRun: async (request, id) => { kicks.push(id); return kickResult; } });
  const call = (body) => handler(new Request('https://life.example/api/problem-solver', { method: 'POST', headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const run = (await (await call({ create: { kind: 'lightning', text: 'The printer jams every Monday.', requestId: 'r1' } })).json()).data.session;
  assert.equal(run.kind, 'lightning');
  assert.equal(run.suggestion.kind, 'escalate');
  kicks.length = 0;
  kickResult = true;
  const fullId = '22222222-2222-4222-8222-222222222222';
  const res = await call({ id: run.id, revision: run.revision, requestId: fullId, action: 'escalate' });
  assert.equal(res.status, 202);
  const { data } = await res.json();
  assert.equal(data.session.id, run.id);
  assert.equal(data.session.lightning.escalatedTo, fullId);
  assert.deepEqual(kicks, [fullId]);
});

test('escalate falls back to an inline run of the full session when the kick fails', async () => {
  const store = createMemoryProblemStore();
  const coach = async (s) => ({ verdict: 'clarify', message: s.kind === 'full' ? 'What is the goal?' : 'Could you live with it?', node: null, edges: [], skillsSeen: [], skillsMissing: [], suggestion: null, summary: null, lightning: null, frame: null, model: null });
  const handler = createProblemSolverHandler({ env: ENV, now: () => NOW, getStore: async () => store, coach, invokeRun: async () => false });
  const call = (body) => handler(new Request('https://life.example/api/problem-solver', { method: 'POST', headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const run = (await (await call({ create: { kind: 'lightning', text: 'The printer jams every Monday.', requestId: 'r1' } })).json()).data.session;
  const fullId = '33333333-3333-4333-8333-333333333333';
  const res = await call({ id: run.id, revision: run.revision, requestId: fullId, action: 'escalate' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.session.lightning.escalatedTo, fullId);
  const full = (await (await handler(new Request(`https://life.example/api/problem-solver?id=${fullId}`, { headers: { cookie: `life_hub_session=${SESSION}` } }))).json()).data.session;
  assert.equal(full.runner.status, 'idle');
  assert.equal(full.turns.at(-1).text, 'What is the goal?');
});
