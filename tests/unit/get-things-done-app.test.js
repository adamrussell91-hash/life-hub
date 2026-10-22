// tests/unit/get-things-done-app.test.js
// The server side of Gear Shifter's app: starting from a technique on the shelf, the list row's
// main technique (the medal's centre), the task source Gear Shifter's tasks carry, and the
// provenance graphics kept in step with their generator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, summaryRow } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { createProblemSolverService } from '../../netlify/functions/_shared/problem-solver/service.mjs';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { DEFAULT_TASK_PROPERTY_CONFIG } from '../../netlify/functions/_shared/task-properties.mjs';
import { deps, explored, reply } from './gear-shifter-test-helpers.mjs';

/** A shift framed by hand, started from `startModel`. */
function framed(startModel) {
  let s = createSession({ text: 'The grant report will not get written.', kind: 'shift', startModel }, deps);
  s = reply(s, { frame: { need: 'Finish the grant report draft' } });
  s = reply(s, { frame: { route: 'doing' } }, 'I sit down and drift into email.');
  return reply(s, { frame: { known: 'Due in two weeks.' }, suggestion: { kind: 'next_technique', tool: 'gt_deep_work', reason: 'Fits.' } }, 'Due in two weeks.');
}

test('a shift started from a technique on the shelf opens on it once framed, said as a technique', () => {
  const s = framed('gt_pomodoro');
  assert.equal(s.phase, 'explore');
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'gt_pomodoro', reason: 'You started from this technique on the shelf.' });
});

test('a shelf technique must be one Explore offers', () => {
  assert.equal(createSession({ text: 'x', kind: 'shift', startModel: 'gt_commit' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', kind: 'shift', startModel: 'dm_rumsfeld' }, deps).startModel, undefined);
  assert.equal(createSession({ text: 'x', kind: 'shift', startModel: 'gt_kanban' }, deps).startModel, 'gt_kanban');
});

test('the service passes a shelf technique through create', async () => {
  const service = createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach, kinds: ['shift'], now: deps.now });
  const s = await service.create('me', { text: 'The newsletter hand-over keeps slipping.', kind: 'shift', startModel: 'gt_radical_transparency' });
  assert.equal(s.startModel, 'gt_radical_transparency');
});

test('a shift’s list row names its main technique', () => {
  assert.equal(summaryRow(explored()).main, 'gt_appreciation');
  assert.equal(summaryRow(createSession({ text: 'x', kind: 'shift' }, deps)).main, null);
});

test('Gear Shifter’s tasks carry a known source', () => {
  assert.ok(DEFAULT_TASK_PROPERTY_CONFIG.sources.some((source) => source.id === 'gear_shifter' && source.label === 'gear shifter'));
});
