// tests/unit/decision-book-http.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createDecisionBookHandler, DECISION_BOOK_DEPS } from '../../netlify/functions/decision-book.mjs';
import { createProblemSolverHandler } from '../../netlify/functions/problem-solver.mjs';
import { createMemoryProblemStore, DECISION_BOOK_PREFIX } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';

const NOW = Date.parse('2026-10-21T10:00:00+11:00');
const SECRET = 's'.repeat(32);
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

function harness(make, path) {
  const store = createMemoryProblemStore();
  const kicks = [];
  const handler = make({ env: ENV, now: () => NOW, getStore: async () => store, coach: scriptedCoach, invokeRun: async (request, id) => { kicks.push(id); return false; } });
  const call = async (method, body, query = '') => {
    const res = await handler(new Request(`https://life.example${path}${query}`, {
      method,
      headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    }));
    return { status: res.status, data: (await res.json()).data };
  };
  return { call, kicks };
}

test('the API uses its own store prefix and run path', () => {
  assert.equal(DECISION_BOOK_PREFIX, 'decision-book/v1');
  assert.deepEqual(DECISION_BOOK_DEPS, { prefix: 'decision-book/v1', runPath: '/api/decision-book/run', kinds: ['decision'] });
});

test('a decision is created, framed in three answers and opens Explore', async () => {
  const { call } = harness(createDecisionBookHandler, '/api/decision-book');
  let { status, data } = await call('POST', { create: { text: 'Should I take the Sydney job offer?', requestId: 'r1' } });
  assert.equal(status, 200);
  let s = data.session;
  assert.equal(s.kind, 'decision');
  for (const [i, text] of ['It is about me and I want to understand it.', 'The offer closes Friday; rent there is double.'].entries()) {
    ({ data } = await call('POST', { id: s.id, revision: s.revision, requestId: `say${i}`, action: 'say', text }));
    s = data.session;
  }
  assert.equal(s.phase, 'explore');
  assert.equal(s.model.id, 'decision_book');
  assert.equal(s.suggestion.tool, 'dm_eisenhower');
  const list = (await call('GET', null, '?list=1')).data.sessions;
  assert.equal(list[0].kind, 'decision');
});

test('each endpoint refuses the other tool’s session kinds', async () => {
  const decision = harness(createDecisionBookHandler, '/api/decision-book');
  assert.equal((await decision.call('POST', { create: { text: 'Late rota.', kind: 'full', requestId: 'r1' } })).status, 400);
  const problem = harness(createProblemSolverHandler, '/api/problem-solver');
  assert.equal((await problem.call('POST', { create: { text: 'Should I?', kind: 'decision', requestId: 'r2' } })).status, 400);
  assert.equal((await problem.call('POST', { create: { text: 'Late rota.', requestId: 'r3' } })).data.session.kind, 'full');
});
