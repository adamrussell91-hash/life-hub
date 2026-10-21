// tests/unit/problem-solver-service.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { createProblemSolverService } from '../../netlify/functions/_shared/problem-solver/service.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { createSession } from '../../netlify/functions/_shared/problem-solver/session.mjs';

function service(coach = scriptedCoach) {
  let n = 0;
  return createProblemSolverService({ store: createMemoryProblemStore(), coach, now: () => '2026-10-16T10:00:00.000Z', newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` });
}

test('create, run, act with revisions', async () => {
  const svc = service();
  let s = await svc.create('op', { text: 'The rota keeps changing late.', requestId: 'r1' });
  assert.equal(s.runner.status, 'queued');
  s = await svc.run('op', s.id);
  assert.equal(s.runner.status, 'idle');
  assert.equal(s.turns.at(-1).role, 'coach');
  const rev = s.revision;
  s = await svc.action('op', { id: s.id, revision: rev, requestId: 'r2', action: 'say', text: 'It changed three of four weeks' });
  assert.equal(s.revision, rev + 1);
  await assert.rejects(svc.action('op', { id: s.id, revision: rev, requestId: 'r3', action: 'say', text: 'x' }), (err) => err.status === 409);
});

test('replayed requestId does not apply twice', async () => {
  const svc = service();
  let s = await svc.run('op', (await svc.create('op', { text: 'Late rota.', requestId: 'a' })).id);
  const body = { id: s.id, revision: s.revision, requestId: 'same', action: 'say', text: 'Some answer here' };
  const once = await svc.action('op', body);
  const twice = await svc.action('op', { ...body, revision: once.revision });
  assert.equal(twice.turns.length, once.turns.length);
});

test('coach failure marks the runner failed and retry requeues', async () => {
  const svc = service(async () => { throw Object.assign(new Error('Coach lost the thread, try again.'), { code: 'coach_lost_thread' }); });
  let s = await svc.create('op', { text: 'Late rota.', requestId: 'a' });
  s = await svc.run('op', s.id);
  assert.equal(s.runner.status, 'failed');
  assert.equal(s.runner.error, 'Coach lost the thread, try again.');
  s = await svc.action('op', { id: s.id, revision: s.revision, requestId: 'b', action: 'retry' });
  assert.equal(s.runner.status, 'queued');
});

test('list returns summary rows newest first', async () => {
  const svc = service();
  await svc.create('op', { text: 'First problem', requestId: 'a' });
  await svc.create('op', { text: 'Second problem', requestId: 'b' });
  const rows = await svc.list('op');
  assert.equal(rows.length, 2);
  assert.ok(!('turns' in rows[0]));
});

test('list fills frame and skill counts for index rows written before they existed', async () => {
  const store = createMemoryProblemStore();
  const svc = createProblemSolverService({ store, coach: scriptedCoach, now: () => '2026-10-16T10:00:00.000Z', newId: () => '00000000-0000-4000-8000-000000000001' });
  const s = await svc.create('op', { text: 'Old problem', requestId: 'a' });
  const list = store.list.bind(store);
  store.list = async (...args) => (await list(...args)).map(({ value }) => {
    const { frame, skills, ...old } = value;
    return { value: old };
  });
  const [row] = await svc.list('op');
  assert.equal(row.id, s.id);
  assert.equal(row.frame, 0);
  assert.deepEqual(row.skills, {});
});

test('unknown session is 404', async () => {
  await assert.rejects(service().get('op', '00000000-0000-4000-8000-000000000999'), (err) => err.status === 404);
});

test('stale running session is treated as failed and can be retried', async () => {
  let t = Date.parse('2026-10-16T10:00:00.000Z');
  let n = 0;
  const store = createMemoryProblemStore();
  const svc2 = createProblemSolverService({ store, coach: scriptedCoach, now: () => new Date(t).toISOString(), newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` });
  const s = await svc2.create('op', { text: 'Late rota.' });
  const { value, etag } = await store.read('op', s.id);
  await store.write('op', s.id, { ...value, runner: { ...value.runner, status: 'running', leaseUntil: t + 120_000 } }, etag);
  await assert.rejects(svc2.action('op', { id: s.id, revision: s.revision, action: 'say', text: 'hi' }), (err) => err.code === 'busy');
  t += 121_000;
  const got = await svc2.get('op', s.id);
  assert.equal(got.runner.status, 'failed');
  assert.equal(got.runner.error, 'The coach timed out, try again.');
  const retried = await svc2.action('op', { id: s.id, revision: s.revision, action: 'retry' });
  assert.equal(retried.runner.status, 'queued');
});

test('run stores a lease while running', async () => {
  const t = Date.parse('2026-10-16T10:00:00.000Z');
  let seen;
  const store = createMemoryProblemStore();
  const svc = createProblemSolverService({ store, coach: async (v) => { seen = v.runner; return scriptedCoach(v); }, now: () => new Date(t).toISOString(), newId: () => `00000000-0000-4000-8000-${String(Math.floor(Math.random() * 1e11)).padStart(12, '0')}` });
  const s = await svc.create('op', { text: 'Late rota.' });
  await svc.run('op', s.id);
  assert.equal(seen.status, 'running');
  assert.equal(seen.leaseUntil, t + 120_000);
});

test('create is idempotent on a UUID requestId', async () => {
  const svc = service();
  const requestId = '11111111-1111-4111-8111-111111111111';
  const a = await svc.create('op', { text: 'Late rota.', requestId });
  const b = await svc.create('op', { text: 'Late rota.', requestId });
  assert.equal(a.id, requestId);
  assert.equal(b.id, requestId);
});

test('rescore_radar goes through the action endpoint and bumps the revision', async () => {
  const store = createMemoryProblemStore();
  let n = 0;
  const svc = createProblemSolverService({ store, coach: scriptedCoach, now: () => '2026-10-16T10:00:00.000Z', newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` });
  let s = await svc.run('op', (await svc.create('op', { text: 'Scores to track.', requestId: 'a' })).id);
  const nodes = [1, 2, 3].map((i) => ({ id: `x${i}`, slot: `axis:${i}`, text: `Topic ${i}`, state: 'accepted', skills: [], turnId: 't' }));
  const seeded = { ...s, model: { id: 'seven_step', reason: '' }, phase: 'define', steps: { define: { runs: [{ id: 'run', tool: 'gap_radar', status: 'active', nodes, edges: [], radar: { snapshots: [] } }], status: 'open', objection: null } } };
  const row = await store.read('op', s.id);
  await store.write('op', s.id, seeded, row.etag);
  s = await svc.get('op', s.id);
  const next = await svc.action('op', { id: s.id, revision: s.revision, requestId: 'r1', action: 'rescore_radar', current: [3, 4, 5], objective: [8, 8, 9] });
  assert.equal(next.revision, s.revision + 1);
  assert.equal(next.steps.define.runs[0].radar.snapshots.length, 1);
  await assert.rejects(svc.action('op', { id: s.id, revision: next.revision, requestId: 'r2', action: 'rescore_radar', current: [3, 4], objective: [8, 8, 9] }), (err) => err.status === 400);
});

test('get migrates a stored v1 session without writing it', async () => {
  const store = createMemoryProblemStore();
  const v1 = { id: '11111111-1111-4111-8111-111111111111', title: 'Old', revision: 2, status: 'defined', phase: 'defined', frame: {}, model: { id: 'seven_step', reason: '' }, links: [], define: { runs: [], finishedEarly: true, exitObjection: null }, turns: [], summary: '', suggestion: null, pendingKeep: null, requestIds: [], runner: { status: 'idle', mode: 'turn', error: null }, createdAt: 'c', updatedAt: 'u' };
  await store.write('operator', v1.id, v1, null);
  const service = createProblemSolverService({ store, coach: async () => { throw new Error('unused'); }, now: () => '2026-10-19T10:00:00.000Z' });
  const got = await service.get('operator', v1.id);
  assert.equal(got.phase, 'analyse');
  assert.equal(got.steps.define.status, 'skipped');
  assert.ok((await store.read('operator', v1.id)).value.define, 'store untouched');
});

test('move_on and score are actions; finish_define is kept as an alias for move_on', async () => {
  const store = createMemoryProblemStore();
  const service = createProblemSolverService({ store, coach: async () => ({ verdict: 'clarify', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null }), now: () => '2026-10-19T10:00:00.000Z' });
  let s = await service.create('operator', { text: 'Late rota.' });
  s = { ...s, model: { id: 'seven_step', reason: '' }, phase: 'define', steps: { define: { runs: [{ id: 'r', tool: 'five_whys', status: 'active', nodes: [], edges: [] }], status: 'open', objection: null } }, runner: { status: 'idle', mode: 'turn', error: null } };
  const { etag } = await store.read('operator', s.id);
  await store.write('operator', s.id, s, etag);
  const moved = await service.action('operator', { id: s.id, revision: s.revision, action: 'move_on' });
  assert.equal(moved.phase, 'analyse');
  assert.equal(moved.runner.mode, 'boundary');
  const ran = await service.run('operator', s.id);
  assert.equal(ran.pendingLearning, 'define');
  const again = await service.action('operator', { id: s.id, revision: ran.revision, action: 'finish_define' });
  assert.equal(again.phase, 'devise');
});

test('retry after a failed boundary turn keeps leaving, so the objection and learning are recorded', async () => {
  const store = createMemoryProblemStore();
  let calls = 0;
  const ok = { verdict: 'clarify', message: 'What did you learn?', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: 'Root cause not reached.', learning: null };
  const service = createProblemSolverService({ store, coach: async () => { calls += 1; if (calls === 1) throw new Error('boom'); return ok; }, now: () => '2026-10-19T10:00:00.000Z' });
  let s = await service.create('operator', { text: 'Late rota.' });
  s = { ...s, model: { id: 'seven_step', reason: '' }, phase: 'define', steps: { define: { runs: [{ id: 'r', tool: 'five_whys', status: 'active', nodes: [], edges: [] }], status: 'open', objection: null } }, runner: { status: 'idle', mode: 'turn', error: null } };
  const { etag } = await store.read('operator', s.id);
  await store.write('operator', s.id, s, etag);
  const moved = await service.action('operator', { id: s.id, revision: s.revision, action: 'move_on' });
  const failed = await service.run('operator', s.id);
  assert.deepEqual([failed.runner.status, failed.runner.mode, failed.runner.leaving], ['failed', 'boundary', 'define']);
  await assert.rejects(service.action('operator', { id: s.id, revision: failed.revision, action: 'say', text: 'hi' }), (err) => err.status === 409 && err.code === 'action_not_allowed' && err.message === 'The coach did not finish wrapping up that step. Try again first.');
  const retried = await service.action('operator', { id: s.id, revision: failed.revision, action: 'retry' });
  assert.equal(retried.runner.leaving, 'define');
  const done = await service.run('operator', s.id);
  assert.equal(done.pendingLearning, 'define');
  assert.equal(done.steps.define.objection, 'Root cause not reached.');
  assert.ok(moved);
});

const NOW8 = '2026-10-19T10:00:00.000Z';
const uuid8 = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

async function seeded(patch) {
  const store = createMemoryProblemStore();
  let i = 100;
  const deps = { now: () => NOW8, newId: () => uuid8((i += 1)) };
  const base = { ...createSession({ text: 'Late rota.' }, deps), runner: { status: 'idle', mode: 'turn', error: null }, ...patch };
  await store.write('op', base.id, base, null);
  const svc = createProblemSolverService({ store, coach: async () => { throw new Error('the coach must not run'); }, now: () => NOW8, newId: deps.newId });
  return { svc, store, id: base.id };
}

test('confirm_task, dismiss_task, set_review_task and dismiss_review apply their payloads without the coach', async () => {
  const proposal = { id: 'p1', title: 'Draft', status: 'proposed', due: null, source: { runId: 'k', nodeId: 'n' } };
  const { svc, id } = await seeded({ model: { id: 'seven_step', reason: 'Default.' }, proposedTasks: [proposal, { ...proposal, id: 'p2' }], reviewProposal: { title: 'Review: Late rota.', due: '2026-11-02', reason: '', status: 'proposed' } });
  let s = await svc.get('op', id);
  s = await svc.action('op', { id, revision: s.revision, requestId: 'a1', action: 'confirm_task', payload: { proposalId: 'p1', taskId: 'task-1' } });
  assert.equal(s.proposedTasks[0].taskId, 'task-1');
  assert.equal(s.runner.status, 'idle');
  s = await svc.action('op', { id, revision: s.revision, requestId: 'a2', action: 'dismiss_task', payload: { proposalId: 'p2' } });
  assert.equal(s.proposedTasks[1].status, 'dismissed');
  s = await svc.action('op', { id, revision: s.revision, requestId: 'a3', action: 'set_review_task', payload: { taskId: 'review-1', due: '2026-11-05' } });
  assert.equal(s.reviewTaskId, 'review-1');
  await assert.rejects(svc.action('op', { id, revision: s.revision, requestId: 'a4', action: 'dismiss_review' }), (err) => err.status === 409);
});

test('linked lists sessions that link, created or review a task, and rejects bad refs', async () => {
  const { svc, id } = await seeded({ links: [{ kind: 'project', id: 'proj-1' }], proposedTasks: [{ id: 'p1', title: 'Draft', status: 'confirmed', taskId: 'task-1', due: null, source: { runId: 'k', nodeId: 'n' } }], reviewTaskId: 'review-1' });
  assert.deepEqual((await svc.linked('op', 'task:task-1')).map((row) => [row.id, row.role]), [[id, 'task']]);
  assert.deepEqual((await svc.linked('op', 'task:review-1')).map((row) => row.role), ['review']);
  assert.deepEqual((await svc.linked('op', 'project:proj-1')).map((row) => row.role), ['link']);
  assert.deepEqual(await svc.linked('op', 'task:other'), []);
  await assert.rejects(svc.linked('op', 'goal:x'), (err) => err.status === 400);
});


test('start_review and task_status are known actions; task_status while busy is 409', async () => {
  const svc = service();
  let s = await svc.run('op', (await svc.create('op', { text: 'Late rota.' })).id);
  const snapshot = { byStatus: { open: 1 }, overdue: [] };
  // Known actions are refused on the session's state (409), not as unknown (400).
  await assert.rejects(svc.action('op', { id: s.id, revision: s.revision, action: 'start_review' }), (err) => err.status === 409 && err.code === 'action_not_allowed');
  await assert.rejects(svc.action('op', { id: s.id, revision: s.revision, action: 'task_status', payload: { snapshot } }), (err) => err.status === 409 && err.code === 'action_not_allowed');
  s = await svc.action('op', { id: s.id, revision: s.revision, action: 'say', text: 'It changed three of four weeks' });
  assert.equal(s.runner.status, 'queued');
  await assert.rejects(svc.action('op', { id: s.id, revision: s.revision, action: 'task_status', payload: { snapshot } }), (err) => err.status === 409 && err.code === 'busy');
});

test('link_case_file and dismiss_case_file are known actions; link_case_file while busy is 409', async () => {
  const svc = service();
  let s = await svc.run('op', (await svc.create('op', { text: 'Late rota.' })).id);
  // Known actions are refused on the session's state, not as unknown (400).
  for (const action of ['link_case_file', 'dismiss_case_file']) {
    await assert.rejects(svc.action('op', { id: s.id, revision: s.revision, action, payload: {} }), (err) => !/Unknown action/.test(err.message));
  }
  s = await svc.action('op', { id: s.id, revision: s.revision, action: 'say', text: 'It changed three of four weeks' });
  assert.equal(s.runner.status, 'queued');
  await assert.rejects(svc.action('op', { id: s.id, revision: s.revision, action: 'link_case_file', payload: {} }), (err) => err.status === 409 && err.code === 'busy');
});

test('a finished Lightning run refuses messages, so no coach call is queued', async () => {
  const store = createMemoryProblemStore();
  const svc = createProblemSolverService({ store, coach: scriptedCoach, now: () => '2026-10-20T10:00:00.000Z', newId: () => '00000000-0000-4000-8000-000000000001' });
  const run = { ...createSession({ text: 'I keep missing the bus.' }, { now: () => '2026-10-20T10:00:00.000Z', newId: () => 'x1' }), id: '00000000-0000-4000-8000-0000000000aa', kind: 'lightning', phase: 'lightning', status: 'finished', runner: { status: 'idle', mode: 'turn', error: null }, lightning: { path: [{ node: 'next', round: 1, at: 'a' }], rounds: 1, finishedAt: 'a', escalatedTo: null } };
  await store.write('op', run.id, run, null);
  await assert.rejects(svc.action('op', { id: run.id, revision: run.revision, requestId: 'q1', action: 'say', text: 'Hello again' }), (err) => err.status === 409 && /This run is finished\. Press It came back/.test(err.message));
});

test('a Lightning run goes from create to finished with the scripted coach', async () => {
  const svc = service();
  let s = await svc.create('op', { kind: 'lightning', text: 'The garden gate keeps swinging open.', requestId: 'l0' });
  assert.equal(s.kind, 'lightning');
  s = await svc.run('op', s.id);
  assert.equal(s.turns.at(-1).text, 'Could you accept things as they are?');
  let i = 0;
  for (const text of ['no', 'The gate should stay shut on its own', 'no', 'no', 'no, drew the hinge', 'no', 'yes, wrote a list of fixes', 'Gates need a catch as well as hinges', 'Fit a catch this weekend']) {
    s = await svc.action('op', { id: s.id, revision: s.revision, requestId: `l${(i += 1)}`, action: 'say', text });
    s = await svc.run('op', s.id);
  }
  assert.equal(s.status, 'finished');
  assert.ok(s.lightning.finishedAt);
  assert.equal(s.turns.at(-1).text, 'That run is done.');
  assert.equal(s.runner.status, 'idle');
});
