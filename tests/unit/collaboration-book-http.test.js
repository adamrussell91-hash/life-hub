// tests/unit/collaboration-book-http.test.js
// The Collaboration Book's API and its `collab` session kind: its own store and run path, framing
// in three answers with the group kept to known ids, and Explore opening on the
// collaboration_book model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createCollaborationBookHandler, COLLABORATION_BOOK_DEPS } from '../../netlify/functions/collaboration-book.mjs';
import { config as runConfig } from '../../netlify/functions/collaboration-book-run.mjs';
import { createChangeBookHandler } from '../../netlify/functions/change-book.mjs';
import { createRulesBookHandler } from '../../netlify/functions/rules-book.mjs';
import { createProblemSolverHandler } from '../../netlify/functions/problem-solver.mjs';
import { createMemoryProblemStore, COLLABORATION_BOOK_PREFIX } from '../../netlify/functions/_shared/problem-solver/store.mjs';
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
  assert.equal(COLLABORATION_BOOK_PREFIX, 'collaboration-book/v1');
  assert.deepEqual(COLLABORATION_BOOK_DEPS, { prefix: 'collaboration-book/v1', runPath: '/api/collaboration-book/run', kinds: ['collab'] });
  assert.deepEqual(runConfig, { path: '/api/collaboration-book/run', background: true });
});

test('a collab session is created, framed in three answers and opens Explore on collaboration_book', async () => {
  const call = harness(createCollaborationBookHandler, '/api/collaboration-book');
  let { status, data } = await call('POST', { create: { text: 'Two people on the team have stopped speaking in meetings.', requestId: 'r1' } });
  assert.equal(status, 200);
  let s = data.session;
  assert.equal(s.kind, 'collab');
  for (const [i, text] of ['It is about trust between us.', 'Both of them speaking up again in planning.'].entries()) {
    ({ data } = await call('POST', { id: s.id, revision: s.revision, requestId: `say${i}`, action: 'say', text }));
    s = data.session;
  }
  assert.equal(s.frame.situation, 'Two people on the team have stopped speaking in meetings.');
  assert.equal(s.frame.group, 'trust');
  assert.equal(s.frame.outcome, 'Both of them speaking up again in planning.');
  assert.equal(s.phase, 'explore');
  assert.equal(s.model.id, 'collaboration_book');
  assert.equal((await call('GET', null, '?list=1')).data.sessions[0].kind, 'collab');
});

test('each endpoint refuses the others’ session kinds', async () => {
  assert.equal((await harness(createCollaborationBookHandler, '/api/collaboration-book')('POST', { create: { text: 'Stuck.', kind: 'change', requestId: 'r1' } })).status, 400);
  assert.equal((await harness(createChangeBookHandler, '/api/change-book')('POST', { create: { text: 'Stuck.', kind: 'collab', requestId: 'r2' } })).status, 400);
  assert.equal((await harness(createRulesBookHandler, '/api/rules-book')('POST', { create: { text: 'Stuck.', kind: 'collab', requestId: 'r3' } })).status, 400);
  assert.equal((await harness(createProblemSolverHandler, '/api/problem-solver')('POST', { create: { text: 'Stuck.', kind: 'collab', requestId: 'r4' } })).status, 400);
});
