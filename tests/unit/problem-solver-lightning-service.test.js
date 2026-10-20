import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { createProblemSolverService } from '../../netlify/functions/_shared/problem-solver/service.mjs';

const turn = (fields) => ({ verdict: 'clarify', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], suggestion: null, summary: null, lightning: null, ...fields });
function service(coach) {
  let n = 0;
  return createProblemSolverService({ store: createMemoryProblemStore(), coach, now: () => '2026-10-20T09:00:00.000Z', newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` });
}
const RID = '11111111-1111-4111-8111-111111111111';

test('create a Lightning run, answer a box, and the coach turn goes through the Lightning rules', async () => {
  const svc = service(async () => turn({ message: 'Could you live with it?' }));
  let s = await svc.create('op', { kind: 'lightning', text: 'The printer jams every Monday.', requestId: 'a' });
  assert.equal(s.kind, 'lightning');
  s = await svc.run('op', s.id);
  assert.equal(s.turns.at(-1).text, 'Could you live with it?');
  s = await svc.action('op', { id: s.id, revision: s.revision, requestId: 'b', action: 'lightning_answer', payload: { node: 'start', answer: 'no' } });
  assert.equal(s.lightning.path.at(-1).node, 'goal');
  assert.equal(s.runner.status, 'queued');
});

test('escalate writes the full session once and marks the run; a retry finds the same one', async () => {
  const svc = service(async () => turn({ suggestion: { kind: 'escalate', reason: 'It keeps coming back.' } }));
  let s = await svc.run('op', (await svc.create('op', { kind: 'lightning', text: 'The printer jams every Monday.', requestId: 'a' })).id);
  assert.equal(s.suggestion.kind, 'escalate');
  const after = await svc.action('op', { id: s.id, revision: s.revision, requestId: RID, action: 'escalate' });
  assert.equal(after.lightning.escalatedTo, RID);
  assert.equal(after.status, 'finished');
  const full = await svc.get('op', RID);
  assert.equal(full.kind, 'full');
  assert.equal(full.escalatedFrom, s.id);
  assert.equal(full.runner.status, 'queued');
  const again = await svc.action('op', { id: s.id, revision: s.revision, requestId: RID, action: 'escalate' });
  assert.equal(again.lightning.escalatedTo, RID, 'a replayed request returns the escalated run');
  assert.equal((await svc.list('op')).length, 2);
});
