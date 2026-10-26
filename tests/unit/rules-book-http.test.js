// tests/unit/rules-book-http.test.js
// The Rules Book's API and its `rules` session kind: its own store and run path, framing in three
// answers with the group kept to known ids, and Explore opening on the rules_book model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createRulesBookHandler, RULES_BOOK_DEPS } from '../../netlify/functions/rules-book.mjs';
import { createGearShifterHandler } from '../../netlify/functions/get-things-done.mjs';
import { createDecisionBookHandler } from '../../netlify/functions/decision-book.mjs';
import { createProblemSolverHandler } from '../../netlify/functions/problem-solver.mjs';
import { createMemoryProblemStore, RULES_BOOK_PREFIX } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';

const NOW = Date.parse('2026-10-27T10:00:00+11:00');
const SECRET = 's'.repeat(32);
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

function harness(make, path) {
  const store = createMemoryProblemStore();
  const handler = make({ env: ENV, now: () => NOW, getStore: async () => store, coach: scriptedCoach, invokeRun: async () => false });
  return async (method, body, query = '') => {
    const res = await handler(new Request(`https://life.example${path}${query}`, {
      method,
      headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    }));
    return { status: res.status, data: (await res.json()).data };
  };
}

test('the API uses its own store prefix, run path and kind', () => {
  assert.equal(RULES_BOOK_PREFIX, 'rules-book/v1');
  assert.deepEqual(RULES_BOOK_DEPS, { prefix: 'rules-book/v1', runPath: '/api/rules-book/run', kinds: ['rules'] });
});

test('a rules session is created, grounded in three answers and opens Explore on rules_book', async () => {
  const call = harness(createRulesBookHandler, '/api/rules-book');
  let { status, data } = await call('POST', { create: { text: 'The team meeting keeps running over its time.', requestId: 'r1' } });
  assert.equal(status, 200);
  let s = data.session;
  assert.equal(s.kind, 'rules');
  for (const [i, text] of ['It is in my work and the agenda never holds.', 'Two hours long; I assume people like talking about small things.'].entries()) {
    ({ data } = await call('POST', { id: s.id, revision: s.revision, requestId: `say${i}`, action: 'say', text }));
    s = data.session;
  }
  assert.equal(s.frame.situation, 'The team meeting keeps running over its time.');
  assert.equal(s.frame.group, 'workplace');
  assert.equal(s.phase, 'explore');
  assert.equal(s.model.id, 'rules_book');
  assert.equal((await call('GET', null, '?list=1')).data.sessions[0].kind, 'rules');
});

test('each endpoint refuses the others’ session kinds', async () => {
  assert.equal((await harness(createRulesBookHandler, '/api/rules-book')('POST', { create: { text: 'Stuck.', kind: 'shift', requestId: 'r1' } })).status, 400);
  assert.equal((await harness(createGearShifterHandler, '/api/get-things-done')('POST', { create: { text: 'Stuck.', kind: 'rules', requestId: 'r2' } })).status, 400);
  assert.equal((await harness(createDecisionBookHandler, '/api/decision-book')('POST', { create: { text: 'Stuck.', kind: 'rules', requestId: 'r3' } })).status, 400);
  assert.equal((await harness(createProblemSolverHandler, '/api/problem-solver')('POST', { create: { text: 'Stuck.', kind: 'rules', requestId: 'r4' } })).status, 400);
});
