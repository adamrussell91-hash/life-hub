// tests/unit/problem-solver-service.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { createProblemSolverService } from '../../netlify/functions/_shared/problem-solver/service.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';

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
  s = { ...s, model: { id: 'seven_step', reason: '' }, phase: 'define', steps: { define: { runs: [], status: 'open', objection: null } }, runner: { status: 'idle', mode: 'turn', error: null } };
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
