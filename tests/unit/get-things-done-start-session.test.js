// tests/unit/get-things-done-start-session.test.js
// Gear Shifter's Quick start on the server: the `start` session, its actions, the scripted coach
// and Go deeper to a seeded shift session. Decision Maker's quick route keeps its own kind and
// actions. Invented tasks only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createGearShifterHandler, GEAR_SHIFTER_DEPS } from '../../netlify/functions/get-things-done.mjs';
import { createDecisionBookHandler } from '../../netlify/functions/decision-book.mjs';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import { applyStartTurn, createStartSession } from '../../netlify/functions/_shared/problem-solver/start-session.mjs';
import { summaryRow } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-22T09:00:00.000Z', newId: () => `id${(n += 1)}` };
const idle = (s) => ({ ...s, runner: { status: 'idle', mode: 'turn', error: null } });
const turn = (fields) => ({ verdict: 'clarify', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], suggestion: null, summary: null, lightning: null, ...fields });
const TASK = 'Write the first page of the grant application';
const fresh = () => idle(createStartSession({ text: TASK }, deps));

const NOW = Date.parse('2026-10-22T10:00:00+11:00');
const SECRET = 's'.repeat(32);
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

function harness(make = createGearShifterHandler, path = '/api/get-things-done') {
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
  let r = 0;
  const run = async (id) => (await call('GET', null, `?id=${id}`)).data.session;
  const settle = async (s) => (s.runner.status === 'queued' ? run(s.id) : s);
  const say = async (s, text) => settle((await call('POST', { id: s.id, revision: s.revision, requestId: `say${(r += 1)}`, action: 'say', text })).data.session);
  const act = async (s, action, payload, requestId = `act${(r += 1)}`) => call('POST', { id: s.id, revision: s.revision, requestId, action, ...(payload ? { payload } : {}) });
  return { call, kicks, say, act, settle, run };
}

test('a Quick start opens on the first action, its run under `start`', () => {
  const s = fresh();
  assert.equal(s.kind, 'start');
  assert.equal(s.phase, 'start');
  assert.equal(s.start.path[0].note, TASK);
  assert.equal(s.start.path.at(-1).node, 'action');
  assert.equal(s.quick, undefined);
  assert.deepEqual(GEAR_SHIFTER_DEPS.kinds, ['shift', 'start']);
});

test('schema: Quick start boxes are known; a way is kept only at how; Decision Maker boxes unchanged', () => {
  assert.deepEqual(validateCoachTurn({ verdict: 'accept', message: 'm', quick: { node: 'how', answer: 'interval' } }).value.quick, { node: 'how', answer: 'interval' });
  assert.deepEqual(validateCoachTurn({ verdict: 'accept', message: 'm', quick: { node: 'test_one', answer: 'interval' } }).value.quick, { node: 'test_one' });
  assert.deepEqual(validateCoachTurn({ verdict: 'accept', message: 'm', quick: { node: 'cue', note: 'At nine' } }).value.quick, { node: 'cue', note: 'At nine' });
  assert.match(validateCoachTurn({ verdict: 'clarify', message: 'm', quick: { node: 'nowhere' } }).error, /Unknown quick decision box/);
});

test('a coach step lands; one for a moved-on box is dropped and the turn kept; escalate is kept while open', () => {
  const s = idle(applyStartTurn(fresh(), turn({ verdict: 'accept', quick: { node: 'action', note: 'Open the template and write the title' } }), deps));
  assert.equal(s.start.path.at(-1).node, 'how');
  const stale = applyStartTurn(s, turn({ quick: { node: 'action', note: 'something else' }, suggestion: { kind: 'escalate', reason: 'Big.' } }), deps);
  assert.equal(stale.start.path.at(-1).node, 'how');
  assert.equal(stale.turns.at(-1).role, 'coach');
  assert.deepEqual(stale.suggestion, { kind: 'escalate', reason: 'Big.' });
  const bad = applyStartTurn(s, turn({ quick: { node: 'how', answer: 'yes' } }), deps);
  assert.equal(bad.start.path.at(-1).node, 'how');
});

test('HTTP: a Quick start walked with the scripted coach, the start picked on the chart, a check task, to done and It came back', async () => {
  const h = harness();
  let s = (await h.call('POST', { create: { text: TASK, kind: 'start', requestId: '7f0c7e8a-1b2c-4d3e-8f90-a1b2c3d4e5f6' } })).data.session;
  assert.equal(s.kind, 'start');
  s = await h.settle(s);
  assert.match(s.turns.at(-1).text, /first small, safe action/);
  s = await h.say(s, 'Open the template and write the title');
  assert.equal(s.start.path.at(-1).node, 'how');

  const refused = await h.act(s, 'start_answer', { node: 'cue', answer: 'countdown' });
  assert.equal(refused.status, 409);
  const wrong = await h.act(s, 'start_answer', { node: 'how', answer: 'tomorrow' });
  assert.equal(wrong.status, 400);
  s = await h.settle((await h.act(s, 'start_answer', { node: 'how', answer: 'countdown' })).data.session);
  assert.equal(s.start.path.at(-1).node, 'cue');
  assert.equal(s.turns.at(-2).text, 'Countdown cue.');
  assert.match(s.turns.at(-1).text, /^Noted\. What is the cue/);

  s = await h.say(s, 'When the kettle boils, count down and type');
  s = await h.say(s, 'Check on 2026-10-24');
  assert.deepEqual(s.start.check, { due: '2026-10-24', taskId: null, dismissed: false });
  assert.equal((await h.act(s, 'quick_check', { taskId: 't1' })).status, 409, 'Decision Maker actions refuse a start session');
  s = (await h.act(s, 'start_check', { taskId: 'task-123' })).data.session;
  assert.equal(s.start.check.taskId, 'task-123');
  assert.equal((await h.act(s, 'start_check', { taskId: 'task-456' })).status, 409);

  assert.equal((await h.act(s, 'start_again')).status, 409, 'still going');
  s = await h.say(s, 'Wrote the title and half a page');
  s = await h.say(s, 'Finish the page tomorrow morning');
  assert.equal(s.status, 'finished');
  assert.ok(s.start.finishedAt);
  assert.equal((await h.call('POST', { id: s.id, revision: s.revision, requestId: 'late', action: 'say', text: 'more' })).status, 409);
  assert.equal(summaryRow(s).kind, 'start');
  assert.equal(summaryRow(s).escalatedTo, null);

  s = await h.settle((await h.act(s, 'start_again')).data.session);
  assert.equal(s.status, 'active');
  assert.equal(s.start.rounds, 2);
  assert.equal(s.start.path.at(-1).node, 'action');
});

test('HTTP: go deeper writes a seeded shift session once, kicks its first turn, and the run points at it', async () => {
  const h = harness();
  let s = await h.settle((await h.call('POST', { create: { text: TASK, kind: 'start' } })).data.session);
  s = await h.say(s, 'Open the template and write the title');
  s = await h.say(s, 'interval');
  s = await h.say(s, 'Nine to nine thirty, phone in the drawer');
  s = await h.say(s, 'go deeper');
  assert.equal(s.suggestion.kind, 'escalate');
  const requestId = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  const first = await h.act(s, 'escalate', null, requestId);
  assert.equal(first.status, 200);
  const run = first.data.session;
  assert.equal(run.status, 'finished');
  assert.equal(run.start.escalatedTo, requestId);
  assert.equal(summaryRow(run).escalatedTo, requestId);
  const full = (await h.call('GET', null, `?id=${requestId}`)).data.session;
  assert.equal(full.kind, 'shift');
  assert.equal(full.escalatedFrom, run.id);
  assert.equal(full.turns[0].text, TASK);
  assert.equal(full.frameSeeds.from, 'start');
  assert.equal(full.frameSeeds.way, 'interval');
  assert.match(full.frameSeeds.known, /First action: Open the template and write the title\./);
  assert.ok(h.kicks.includes(requestId), 'the full session\'s first turn is kicked');
  const replay = await h.act(s, 'escalate', null, requestId);
  assert.equal(replay.data.session.start.escalatedTo, requestId);
  assert.equal((await h.act(run, 'escalate', null, '1a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d')).status, 409);
  assert.equal((await h.act(run, 'start_again')).status, 409, 'gone deeper');
  assert.equal(full.frame.need, TASK, 'its first turn ran: the scripted coach records the task as the need');
});

test('Decision Maker still refuses start sessions; Gear Shifter refuses quick decisions', async () => {
  const dm = harness(createDecisionBookHandler, '/api/decision-book');
  assert.equal((await dm.call('POST', { create: { text: TASK, kind: 'start' } })).status, 400);
  const gt = harness();
  assert.equal((await gt.call('POST', { create: { text: TASK, kind: 'quick' } })).status, 400);
  let q = (await dm.call('POST', { create: { text: 'Should I buy the bigger tent?', kind: 'quick' } })).data.session;
  q = await dm.settle(q);
  assert.equal((await dm.act(q, 'start_answer', { node: 'how', answer: 'countdown' })).status, 409);
});
