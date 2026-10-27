// tests/unit/change-book-http.test.js
// The Change Book's API and its `change` session kind: its own store and run path, framing in
// three answers with the group kept to known ids, and Explore opening on the change_book model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChangeBookHandler, CHANGE_BOOK_DEPS } from '../../netlify/functions/change-book.mjs';
import { config as runConfig } from '../../netlify/functions/change-book-run.mjs';
import { createRulesBookHandler } from '../../netlify/functions/rules-book.mjs';
import { createGearShifterHandler } from '../../netlify/functions/get-things-done.mjs';
import { createDecisionBookHandler } from '../../netlify/functions/decision-book.mjs';
import { createProblemSolverHandler } from '../../netlify/functions/problem-solver.mjs';
import { createMemoryProblemStore, CHANGE_BOOK_PREFIX } from '../../netlify/functions/_shared/problem-solver/store.mjs';
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
  assert.equal(CHANGE_BOOK_PREFIX, 'change-book/v1');
  assert.deepEqual(CHANGE_BOOK_DEPS, { prefix: 'change-book/v1', runPath: '/api/change-book/run', kinds: ['change'] });
  assert.deepEqual(runConfig, { path: '/api/change-book/run', background: true });
});

test('a change session is created, framed in three answers and opens Explore on change_book', async () => {
  const call = harness(createChangeBookHandler, '/api/change-book');
  let { status, data } = await call('POST', { create: { text: 'Our team is moving to a four-day week.', requestId: 'r1' } });
  assert.equal(status, 200);
  let s = data.session;
  assert.equal(s.kind, 'change');
  for (const [i, text] of ['It is about how our team works together.', 'The Friday catch-up and the trust we have built.'].entries()) {
    ({ data } = await call('POST', { id: s.id, revision: s.revision, requestId: `say${i}`, action: 'say', text }));
    s = data.session;
  }
  assert.equal(s.frame.change, 'Our team is moving to a four-day week.');
  assert.equal(s.frame.group, 'ours');
  assert.equal(s.frame.stay, 'The Friday catch-up and the trust we have built.');
  assert.equal(s.phase, 'explore');
  assert.equal(s.model.id, 'change_book');
  assert.equal((await call('GET', null, '?list=1')).data.sessions[0].kind, 'change');
});

test('each endpoint refuses the others’ session kinds', async () => {
  assert.equal((await harness(createChangeBookHandler, '/api/change-book')('POST', { create: { text: 'Stuck.', kind: 'rules', requestId: 'r1' } })).status, 400);
  assert.equal((await harness(createRulesBookHandler, '/api/rules-book')('POST', { create: { text: 'Stuck.', kind: 'change', requestId: 'r2' } })).status, 400);
  assert.equal((await harness(createGearShifterHandler, '/api/get-things-done')('POST', { create: { text: 'Stuck.', kind: 'change', requestId: 'r3' } })).status, 400);
  assert.equal((await harness(createDecisionBookHandler, '/api/decision-book')('POST', { create: { text: 'Stuck.', kind: 'change', requestId: 'r4' } })).status, 400);
  assert.equal((await harness(createProblemSolverHandler, '/api/problem-solver')('POST', { create: { text: 'Stuck.', kind: 'change', requestId: 'r5' } })).status, 400);
});
