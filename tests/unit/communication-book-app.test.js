// tests/unit/communication-book-app.test.js
// The server side of the Communication Book's app: starting from a model on the shelf, the list
// row's main model, and the task source its tasks carry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCoachTurn, createSession, summaryRow } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { createProblemSolverService } from '../../netlify/functions/_shared/problem-solver/service.mjs';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { DEFAULT_TASK_PROPERTY_CONFIG } from '../../netlify/functions/_shared/task-properties.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';

const deps = { now: () => '2026-10-28T10:00:00.000Z', newId: () => 'id1' };

function reply(session, raw) {
  const turn = validateCoachTurn({ verdict: 'accept', message: 'Noted.', ...raw });
  assert.ok(turn.ok, turn.error);
  return applyCoachTurn(session, turn.value, deps);
}

test('a talk session started from a model on the shelf opens on it once framed, said as a model', () => {
  let s = createSession({ text: 'I need to apologise to a friend for missing her birthday.', kind: 'talk', startModel: 'cm_apology' }, deps);
  s = reply(s, { frame: { situation: 'I missed her birthday dinner and did not call' } });
  s = reply(s, { frame: { group: 'relate' } });
  s = reply(s, { frame: { outcome: 'She hears a real apology and we can talk again.' }, suggestion: { kind: 'next_technique', tool: 'cm_nonviolent', reason: 'Fits.' } });
  assert.equal(s.phase, 'explore');
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'cm_apology', reason: 'You started from this model on the shelf.' });
});

test('a shelf model must be one the Communication Book’s Explore offers', () => {
  assert.equal(createSession({ text: 'x', kind: 'talk', startModel: 'cm_commit' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', kind: 'talk', startModel: 'cb_premortem' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', kind: 'talk', startModel: 'perspective_shift' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', kind: 'talk', startModel: 'cm_second_order' }, deps).startModel, 'cm_second_order');
  assert.equal(createSession({ text: 'x', kind: 'collab', startModel: 'cm_second_order' }, deps).startModel, undefined);
});

test('the service passes a shelf model through create', async () => {
  const service = createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach, kinds: ['talk'], now: deps.now });
  const s = await service.create('me', { text: 'Our weekly meeting never ends on time.', kind: 'talk', startModel: 'cm_meetings' });
  assert.equal(s.startModel, 'cm_meetings');
});

test('a talk list row has no main model until one is worked', () => {
  assert.equal(summaryRow(createSession({ text: 'x', kind: 'talk' }, deps)).main, null);
});

test('the Communication Book’s tasks carry a known source', () => {
  assert.ok(DEFAULT_TASK_PROPERTY_CONFIG.sources.some((source) => source.id === 'communication_book' && source.label === 'communication book'));
});
