// tests/unit/communication-book-http.test.js
// The Communication Book's API and its `talk` session kind: its own store and run path, framing
// in three answers with the group kept to known ids, and Explore opening on the
// communication_book model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createCommunicationBookHandler, COMMUNICATION_BOOK_DEPS } from '../../netlify/functions/communication-book.mjs';
import { config as runConfig } from '../../netlify/functions/communication-book-run.mjs';
import { createCollaborationBookHandler } from '../../netlify/functions/collaboration-book.mjs';
import { createProblemSolverHandler } from '../../netlify/functions/problem-solver.mjs';
import { createMemoryProblemStore, COMMUNICATION_BOOK_PREFIX } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';

const NOW = Date.parse('2026-10-28T10:00:00+11:00');
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
  assert.equal(COMMUNICATION_BOOK_PREFIX, 'communication-book/v1');
  assert.deepEqual(COMMUNICATION_BOOK_DEPS, { prefix: 'communication-book/v1', runPath: '/api/communication-book/run', kinds: ['talk'] });
  assert.deepEqual(runConfig, { path: '/api/communication-book/run', background: true });
});

test('a talk session is created, framed in three answers and opens Explore on communication_book', async () => {
  const call = harness(createCommunicationBookHandler, '/api/communication-book');
  let { status, data } = await call('POST', { create: { text: 'My partner heard my comment about dinner as criticism.', requestId: 'r1' } });
  assert.equal(status, 200);
  let s = data.session;
  assert.equal(s.kind, 'talk');
  for (const [i, text] of ['It is about our relationship, mending it.', 'We talk it through calmly and both feel heard.'].entries()) {
    ({ data } = await call('POST', { id: s.id, revision: s.revision, requestId: `say${i}`, action: 'say', text }));
    s = data.session;
  }
  assert.equal(s.frame.situation, 'My partner heard my comment about dinner as criticism.');
  assert.equal(s.frame.group, 'relate');
  assert.equal(s.frame.outcome, 'We talk it through calmly and both feel heard.');
  assert.equal(s.phase, 'explore');
  assert.equal(s.model.id, 'communication_book');
  assert.equal((await call('GET', null, '?list=1')).data.sessions[0].kind, 'talk');
});

test('each endpoint refuses the others’ session kinds', async () => {
  assert.equal((await harness(createCommunicationBookHandler, '/api/communication-book')('POST', { create: { text: 'Stuck.', kind: 'collab', requestId: 'r1' } })).status, 400);
  assert.equal((await harness(createCollaborationBookHandler, '/api/collaboration-book')('POST', { create: { text: 'Stuck.', kind: 'talk', requestId: 'r2' } })).status, 400);
  assert.equal((await harness(createProblemSolverHandler, '/api/problem-solver')('POST', { create: { text: 'Stuck.', kind: 'talk', requestId: 'r3' } })).status, 400);
});
