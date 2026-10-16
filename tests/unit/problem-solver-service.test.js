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
