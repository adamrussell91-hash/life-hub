// tests/unit/rules-book-app.test.js
// The server side of the Rules Book's app: starting from a rule on the shelf, the list row's main
// rule, and the task source its tasks carry.
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

test('a rules session started from a rule on the shelf opens on it once framed, said as a rule', () => {
  let s = createSession({ text: 'Everyone says yes to the offsite and I wonder why.', kind: 'rules', startModel: 'rb_plotz' }, deps);
  s = reply(s, { frame: { situation: 'Decide whether to say yes to the offsite' } });
  s = reply(s, { frame: { group: 'workplace' } });
  s = reply(s, { frame: { known: 'It is in March.' }, suggestion: { kind: 'next_technique', tool: 'rb_parkinson', reason: 'Fits.' } });
  assert.equal(s.phase, 'explore');
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'rb_plotz', reason: 'You started from this rule on the shelf.' });
});

test('a shelf rule must be one the Rules Book’s Explore offers', () => {
  assert.equal(createSession({ text: 'x', kind: 'rules', startModel: 'rb_commit' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', kind: 'rules', startModel: 'gt_pomodoro' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', kind: 'rules', startModel: 'rb_pareto' }, deps).startModel, 'rb_pareto');
});

test('the service passes a shelf rule through create', async () => {
  const service = createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach, kinds: ['rules'], now: deps.now });
  const s = await service.create('me', { text: 'The roadmap meeting never reaches the hard item.', kind: 'rules', startModel: 'rb_triviality' });
  assert.equal(s.startModel, 'rb_triviality');
});

test('a rules list row has no main rule until one is worked', () => {
  assert.equal(summaryRow(createSession({ text: 'x', kind: 'rules' }, deps)).main, null);
});

test('the Rules Book’s tasks carry a known source', () => {
  assert.ok(DEFAULT_TASK_PROPERTY_CONFIG.sources.some((source) => source.id === 'rules_book' && source.label === 'rules book'));
});
