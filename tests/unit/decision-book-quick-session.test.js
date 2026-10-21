// tests/unit/decision-book-quick-session.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createDecisionBookHandler } from '../../netlify/functions/decision-book.mjs';
import { createProblemSolverHandler } from '../../netlify/functions/problem-solver.mjs';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { createProblemSolverService } from '../../netlify/functions/_shared/problem-solver/service.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import { createModelCoach } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { buildDecisionPrompt } from '../../netlify/functions/_shared/problem-solver/decision-prompts.mjs';
import { buildQuickPrompt, checkQuickTurn, QUICK_INTENTS, QUICK_RUBRIC } from '../../netlify/functions/_shared/problem-solver/quick-prompts.mjs';
import { applyQuickTurn, createQuickSession, escalateQuick } from '../../netlify/functions/_shared/problem-solver/quick-session.mjs';
import { summaryRow } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { QUICK_NODE_IDS } from '../../packages/decision-book/quick.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T09:00:00.000Z', newId: () => `id${(n += 1)}` };
const idle = (s) => ({ ...s, runner: { status: 'idle', mode: 'turn', error: null } });
const turn = (fields) => ({ verdict: 'clarify', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], suggestion: null, summary: null, lightning: null, ...fields });
const TESTS = ['Do I want the course?', 'Can I fit it in?', 'Is it worth the fee?'];
const fresh = () => idle(createQuickSession({ text: 'Should I take the weekend course?' }, deps));
const walked = (...steps) => steps.reduce((s, step) => idle(applyQuickTurn(s, turn({ verdict: 'accept', quick: step }), deps)), fresh());

const NOW = Date.parse('2026-10-21T10:00:00+11:00');
const SECRET = 's'.repeat(32);
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

function harness(make = createDecisionBookHandler, path = '/api/decision-book') {
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
  const say = async (s, text) => (await call('POST', { id: s.id, revision: s.revision, requestId: `say${(r += 1)}`, action: 'say', text })).data.session;
  const act = async (s, action, payload) => call('POST', { id: s.id, revision: s.revision, requestId: `act${(r += 1)}`, action, ...(payload ? { payload } : {}) });
  return { call, kicks, say, act };
}

test('a quick run starts with the decision stated and the tests waiting', () => {
  const s = fresh();
  assert.equal(s.kind, 'quick');
  assert.equal(s.phase, 'quick');
  assert.equal(s.quick.path[0].note, 'Should I take the weekend course?');
  assert.equal(s.quick.path.at(-1).node, 'tests');
});

test('schema: a quick step with its tests; unknown boxes are refused; other replies carry no quick field', () => {
  const ok = validateCoachTurn({ verdict: 'accept', message: 'm', quick: { node: 'tests', tests: [...TESTS, 'A fourth?'] } });
  assert.deepEqual(ok.value.quick, { node: 'tests', tests: TESTS });
  assert.match(validateCoachTurn({ verdict: 'clarify', message: 'm', quick: { node: 'nowhere' } }).error, /Unknown quick decision box/);
  assert.equal('quick' in validateCoachTurn({ verdict: 'clarify', message: 'm' }).value, false);
});

test('every box has an intent; the rubric keeps the tests fixed and names when to go deeper', () => {
  for (const id of QUICK_NODE_IDS) assert.ok(QUICK_INTENTS[id], id);
  for (const words of ['before any is answered', 'Any no means do not proceed', 'escalate', 'a second round']) assert.ok(QUICK_RUBRIC.includes(words), words);
});

test('the prompt names the current box, the tests with their answers and both ways on', () => {
  const s = walked({ node: 'tests', tests: TESTS }, { node: 'test_one', answer: 'yes' });
  const { system, user } = buildQuickPrompt(s);
  assert.deepEqual(system, [QUICK_RUBRIC]);
  assert.match(user, /DECISION: Should I take the weekend course\?/);
  assert.match(user, /test_one "Do I want the course\?": yes; test_two "Can I fit it in\?": not answered/);
  assert.match(user, /CURRENT BOX: test_two \(test\): "Can I fit it in\?"/);
  assert.match(user, /NEXT: yes -> test_three \("Is it worth the fee\?"\); no -> Do not proceed, then learn/);
});

test('the parser check: the current box only, in its own form; escalate kept until it has gone deeper', () => {
  const s = fresh();
  assert.match(checkQuickTurn(s, turn({ quick: { node: 'test_one', answer: 'yes' } })).error, /current box \(tests\)/);
  assert.match(checkQuickTurn(s, turn({ quick: { node: 'tests', tests: TESTS.slice(0, 2) } })).error, /three agreed tests/);
  const set = walked({ node: 'tests', tests: TESTS });
  assert.match(checkQuickTurn(set, turn({ quick: { node: 'test_one' } })).error, /yes or no/);
  assert.equal(checkQuickTurn(set, turn({ suggestion: { kind: 'escalate', reason: 'Big.' } })).value.suggestion.kind, 'escalate');
  const deeper = { ...set, quick: { ...set.quick, escalatedTo: 'full' } };
  assert.equal(checkQuickTurn(deeper, turn({ suggestion: { kind: 'escalate', reason: 'Big.' } })).value.suggestion, null);
});

test('the model coach uses the quick prompt and repairs a step for the wrong box once', async () => {
  const replies = [
    JSON.stringify(turn({ message: 'Ask the first.', quick: { node: 'test_one', answer: 'yes' } })),
    JSON.stringify(turn({ verdict: 'accept', message: 'Three good tests. First: do you want the course?', quick: { node: 'tests', tests: TESTS } }))
  ];
  const prompts = [];
  const coach = createModelCoach(async (prompt) => { prompts.push(prompt); return replies.shift(); });
  const reply = await coach(fresh());
  assert.deepEqual(reply.quick, { node: 'tests', tests: TESTS });
  assert.deepEqual(prompts[0].system, [QUICK_RUBRIC]);
  assert.equal(prompts.length, 2);
});

test('a coach step that does not hold is dropped and the turn kept', () => {
  const s = idle(applyQuickTurn(fresh(), turn({ message: 'Pick three.', quick: { node: 'tests', tests: ['Only one?'] } }), deps));
  assert.equal(s.quick.path.at(-1).node, 'tests');
  assert.equal(s.turns.at(-1).text, 'Pick three.');
});

test('the list row says how the latest round came out', () => {
  assert.equal(summaryRow(fresh()).outcome, null);
  assert.equal(summaryRow(walked({ node: 'tests', tests: TESTS }, { node: 'test_one', answer: 'no' })).outcome, 'stop');
  assert.equal('outcome' in summaryRow({ ...fresh(), kind: 'decision', quick: null }), false);
});

test('HTTP: a quick decision walked with the scripted coach, answered on the chart, to proceed and a check task', async () => {
  const { call, say, act } = harness();
  let s = (await call('POST', { create: { text: 'Should I take the weekend course?', kind: 'quick', requestId: 'q1' } })).data.session;
  assert.equal(s.kind, 'quick');
  assert.match(s.turns.at(-1).text, /Set three yes\/no tests/);
  s = await say(s, 'use those');
  assert.equal(s.turns.at(-1).text, 'Do I want it?');
  let res = await act(s, 'quick_answer', { node: 'test_one', answer: 'yes' });
  s = res.data.session;
  assert.equal(s.turns.at(-1).text, 'Noted. Can I do it?');
  assert.equal((await act(s, 'quick_answer', { node: 'test_one', answer: 'yes' })).status, 409, 'a box that has moved on');
  s = await say(s, 'yes');
  s = await say(s, 'yes, it pays for itself');
  assert.match(s.turns.at(-1).text, /^Three yeses: go ahead\./);
  s = await say(s, 'I miss two sessions');
  s = await say(s, 'Ask to move to the spring run');
  s = await say(s, 'Check on 2027-01-21');
  assert.deepEqual(s.quick.check, { due: '2027-01-21', taskId: null, dismissed: false });
  s = await say(s, 'I decide faster with the tests written down');
  s = await say(s, 'Book the first session');
  assert.equal(s.status, 'finished');
  res = await act(s, 'quick_check', { taskId: 'task-9' });
  assert.equal(res.data.session.quick.check.taskId, 'task-9');
  assert.equal((await act(res.data.session, 'quick_check', { dismissed: true })).status, 409, 'made once');
  const row = (await call('GET', null, '?list=1')).data.sessions[0];
  assert.equal(row.kind, 'quick');
  assert.equal(row.outcome, 'proceed');
});

test('HTTP: a no stops it; It came back opens a new round; a finished run takes no replies', async () => {
  const { call, say, act } = harness();
  let s = (await call('POST', { create: { text: 'Buy the bigger tent?', kind: 'quick', requestId: 'q2' } })).data.session;
  s = await say(s, 'tests: Do I need it? / Can I store it? / Will I use it twice a year?');
  assert.deepEqual(s.quick.path.find((e) => e.node === 'tests').tests, ['Do I need it?', 'Can I store it?', 'Will I use it twice a year?']);
  s = await say(s, 'no, the old one is fine');
  assert.match(s.turns.at(-1).text, /^A no, so do not go ahead\./);
  s = await say(s, 'I wanted it because it was on sale');
  s = await say(s, 'Leave it');
  assert.equal(s.status, 'finished');
  const refused = await call('POST', { id: s.id, revision: s.revision, requestId: 'late', action: 'say', text: 'one more thing' });
  assert.equal(refused.status, 409);
  s = (await act(s, 'quick_again')).data.session;
  assert.equal(s.quick.rounds, 2);
  assert.equal(s.status, 'active');
  assert.match(s.turns.at(-1).text, /Set three yes\/no tests/);
});

test('HTTP: go deeper writes a seeded full decision once, kicks its first turn, and the run points at it', async () => {
  const { call, say, kicks } = harness();
  let s = (await call('POST', { create: { text: 'Should I take the weekend course?', kind: 'quick', requestId: 'q3' } })).data.session;
  s = await say(s, 'use those');
  s = await say(s, 'yes');
  s = await say(s, 'go deeper');
  assert.equal(s.suggestion.kind, 'escalate');
  const fullId = '22222222-2222-4222-8222-222222222222';
  const res = await call('POST', { id: s.id, revision: s.revision, requestId: fullId, action: 'escalate' });
  assert.equal(res.status, 200);
  assert.equal(res.data.session.quick.escalatedTo, fullId);
  assert.equal(res.data.session.status, 'finished');
  assert.equal(kicks.at(-1), fullId);
  const full = (await call('GET', null, `?id=${fullId}`)).data.session;
  assert.equal(full.kind, 'decision');
  assert.equal(full.escalatedFrom, s.id);
  assert.equal(full.frameSeeds.from, 'quick');
  assert.match(full.frameSeeds.known, /Do I want it\? yes; Can I do it\? not answered/);
  assert.match(buildDecisionPrompt(full).user, /CARRIED FROM A QUICK DECISION .*decision: Should I take the weekend course\?/);
  const replay = await call('POST', { id: s.id, revision: s.revision, requestId: fullId, action: 'escalate' });
  assert.equal(replay.data.session.quick.escalatedTo, fullId, 'a replay returns the run');
  const later = await call('POST', { id: s.id, revision: res.data.session.revision, requestId: 'other', action: 'escalate' });
  assert.equal(later.status, 409);
});

test('once framed, the decision prompt still says where it came from', () => {
  const run = walked({ node: 'tests', tests: TESTS }, { node: 'test_one', answer: 'no' });
  const { full } = escalateQuick(run, 'full-1', deps);
  const framed = { ...full, phase: 'explore', frame: { decision: 'd', compass: 'self_improve', known: 'k' } };
  assert.match(buildDecisionPrompt(framed).user, /CAME FROM A QUICK DECISION: Yes\/No tests: Do I want the course\? no/);
});

test('Problem Solver refuses quick runs, and a full decision cannot go deeper', async () => {
  const problem = harness(createProblemSolverHandler, '/api/problem-solver');
  assert.equal((await problem.call('POST', { create: { text: 'Buy a tent?', kind: 'quick', requestId: 'p1' } })).status, 400);
  const svc = createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach, kinds: ['decision', 'quick'], now: deps.now });
  const d = await svc.create('op', { text: 'Should I move?', kind: 'decision', requestId: 'd1' });
  await assert.rejects(svc.action('op', { id: d.id, revision: d.revision, requestId: 'e1', action: 'escalate' }), { status: 409 });
});
