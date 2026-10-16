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
