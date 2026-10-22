// tests/unit/get-things-done-http.test.js
// Gear Shifter's API and its `shift` session kind: its own store and run path, framing in three
// answers with the route kept to known stations, and Explore opening on the gear_shifter model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createGearShifterHandler, GEAR_SHIFTER_DEPS } from '../../netlify/functions/get-things-done.mjs';
import { createDecisionBookHandler } from '../../netlify/functions/decision-book.mjs';
import { createProblemSolverHandler } from '../../netlify/functions/problem-solver.mjs';
import { createMemoryProblemStore, GEAR_SHIFTER_PREFIX } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import { applyCoachTurn, createSession } from '../../netlify/functions/_shared/problem-solver/session.mjs';

const NOW = Date.parse('2026-10-22T10:00:00+11:00');
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

test('the API uses its own store prefix and run path', () => {
  assert.equal(GEAR_SHIFTER_PREFIX, 'get-things-done/v1');
  assert.deepEqual(GEAR_SHIFTER_DEPS, { prefix: 'get-things-done/v1', runPath: '/api/get-things-done/run', kinds: ['shift', 'start'] });
});

test('a shift is created, framed in three answers and opens Explore on gear_shifter', async () => {
  const call = harness(createGearShifterHandler, '/api/get-things-done');
  let { status, data } = await call('POST', { create: { text: 'My thesis chapter has not moved in three weeks.', requestId: 'r1' } });
  assert.equal(status, 200);
  let s = data.session;
  assert.equal(s.kind, 'shift');
  for (const [i, text] of ['I keep putting off starting each morning.', 'Due in a month; my supervisor wants a draft.'].entries()) {
    ({ data } = await call('POST', { id: s.id, revision: s.revision, requestId: `say${i}`, action: 'say', text }));
    s = data.session;
  }
  assert.equal(s.frame.need, 'My thesis chapter has not moved in three weeks.');
  assert.equal(s.frame.route, 'doing'); // putting off a start is the book's Doing things section (Procrastination)
  assert.equal(s.phase, 'explore');
  assert.equal(s.model.id, 'gear_shifter');
  assert.equal((await call('GET', null, '?list=1')).data.sessions[0].kind, 'shift');
});

test('each endpoint refuses the others’ session kinds', async () => {
  assert.equal((await harness(createGearShifterHandler, '/api/get-things-done')('POST', { create: { text: 'Stuck.', kind: 'decision', requestId: 'r1' } })).status, 400);
  assert.equal((await harness(createDecisionBookHandler, '/api/decision-book')('POST', { create: { text: 'Stuck.', kind: 'shift', requestId: 'r2' } })).status, 400);
  assert.equal((await harness(createProblemSolverHandler, '/api/problem-solver')('POST', { create: { text: 'Stuck.', kind: 'shift', requestId: 'r3' } })).status, 400);
});

test('a route answer keeps only known stations; a compass key is not a shift frame key', () => {
  let n = 0;
  const deps = { now: () => '2026-10-22T10:00:00.000Z', newId: () => `id${(n += 1)}` };
  const s = createSession({ text: 'Stuck on the grant bid.', kind: 'shift' }, deps);
  const turn = validateCoachTurn({ verdict: 'accept', message: 'Noted.', frame: { need: 'Finish the grant bid', route: 'others+nowhere', compass: 'self_improve' } });
  assert.ok(turn.ok, turn.error);
  const next = applyCoachTurn(s, turn.value, deps);
  assert.deepEqual(next.frame, { need: 'Finish the grant bid', route: 'others' });
});
