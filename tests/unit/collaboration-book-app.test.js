// tests/unit/collaboration-book-app.test.js
// The server side of the Collaboration Book's app: starting from a model on the shelf, the list
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

test('a collab session started from a model on the shelf opens on it once framed, said as a model', () => {
  let s = createSession({ text: 'We are about to commit to a big launch plan.', kind: 'collab', startModel: 'cb_premortem' }, deps);
  s = reply(s, { frame: { situation: 'The launch plan is due for sign-off on Friday' } });
  s = reply(s, { frame: { group: 'goals' } });
  s = reply(s, { frame: { outcome: 'A plan the whole team has tried to break.' }, suggestion: { kind: 'next_technique', tool: 'cb_red_blue', reason: 'Fits.' } });
  assert.equal(s.phase, 'explore');
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'cb_premortem', reason: 'You started from this model on the shelf.' });
});

test('a shelf model must be one the Collaboration Book’s Explore offers', () => {
  assert.equal(createSession({ text: 'x', kind: 'collab', startModel: 'cb_commit' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', kind: 'collab', startModel: 'ch_anti_change' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', kind: 'collab', startModel: 'after_action_review' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', kind: 'collab', startModel: 'cb_postmortem' }, deps).startModel, 'cb_postmortem');
  assert.equal(createSession({ text: 'x', kind: 'change', startModel: 'cb_postmortem' }, deps).startModel, undefined);
});

test('the service passes a shelf model through create', async () => {
  const service = createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach, kinds: ['collab'], now: deps.now });
  const s = await service.create('me', { text: 'Our workshops end with no next step.', kind: 'collab', startModel: 'cb_workshops' });
  assert.equal(s.startModel, 'cb_workshops');
});

test('a collab list row has no main model until one is worked', () => {
  assert.equal(summaryRow(createSession({ text: 'x', kind: 'collab' }, deps)).main, null);
});

test('the Collaboration Book’s tasks carry a known source', () => {
  assert.ok(DEFAULT_TASK_PROPERTY_CONFIG.sources.some((source) => source.id === 'collaboration_book' && source.label === 'collaboration book'));
});
