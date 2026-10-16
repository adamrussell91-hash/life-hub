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
