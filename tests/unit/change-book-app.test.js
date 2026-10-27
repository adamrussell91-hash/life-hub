// tests/unit/change-book-app.test.js
// The server side of the Change Book's app: starting from a model on the shelf, the list row's
// main model, and the task source its tasks carry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, summaryRow } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { createProblemSolverService } from '../../netlify/functions/_shared/problem-solver/service.mjs';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { DEFAULT_TASK_PROPERTY_CONFIG } from '../../netlify/functions/_shared/task-properties.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import { applyCoachTurn } from '../../netlify/functions/_shared/problem-solver/session.mjs';

const deps = { now: () => '2026-10-27T10:00:00.000Z', newId: () => 'id1' };

function reply(session, raw) {
  const turn = validateCoachTurn({ verdict: 'accept', message: 'Noted.', ...raw });
  assert.ok(turn.ok, turn.error);
  return applyCoachTurn(session, turn.value, deps);
}

test('a change session started from a model on the shelf opens on it once framed, said as a model', () => {
  let s = createSession({ text: 'Our office is moving to hot desks.', kind: 'change', startModel: 'ch_anti_change' }, deps);
  s = reply(s, { frame: { change: 'The office moves to hot desks in March' } });
  s = reply(s, { frame: { group: 'ours' } });
  s = reply(s, { frame: { stay: 'The team’s morning check-in.' }, suggestion: { kind: 'next_technique', tool: 'ch_swarm_intelligence', reason: 'Fits.' } });
  assert.equal(s.phase, 'explore');
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'ch_anti_change', reason: 'You started from this model on the shelf.' });
});

test('a shelf model must be one the Change Book’s Explore offers', () => {
  assert.equal(createSession({ text: 'x', kind: 'change', startModel: 'ch_commit' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', kind: 'change', startModel: 'rb_plotz' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', kind: 'change', startModel: 'concept_map' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', kind: 'change', startModel: 'ch_rhizome' }, deps).startModel, 'ch_rhizome');
  assert.equal(createSession({ text: 'x', kind: 'rules', startModel: 'ch_rhizome' }, deps).startModel, undefined);
});

test('the service passes a shelf model through create', async () => {
  const service = createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach, kinds: ['change'], now: deps.now });
  const s = await service.create('me', { text: 'My days are full of messages.', kind: 'change', startModel: 'ch_multitasking' });
  assert.equal(s.startModel, 'ch_multitasking');
});

test('a change list row has no main model until one is worked', () => {
  assert.equal(summaryRow(createSession({ text: 'x', kind: 'change' }, deps)).main, null);
});

test('the Change Book’s tasks carry a known source', () => {
  assert.ok(DEFAULT_TASK_PROPERTY_CONFIG.sources.some((source) => source.id === 'change_book' && source.label === 'change book'));
});
