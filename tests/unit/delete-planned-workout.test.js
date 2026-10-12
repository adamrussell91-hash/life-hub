import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeShortcut,
  shortcutSchemas
} from '../../netlify/functions/_shared/capabilities/shortcuts.mjs';
import { validateProposeActionInput } from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import { findPlannedWorkoutDeleteTargets } from '../../netlify/functions/_shared/delete-planned-workout.mjs';

const SHA = 'a'.repeat(40);

test('delete_planned_workout shortcut proposes a delete write for the planned file', async () => {
  assert.ok(shortcutSchemas().delete_planned_workout);
  const result = await executeShortcut('delete_planned_workout', {
    date: '2026-10-12'
  }, {
    agentSlug: 'chadwick',
    repoTree: [
      {
        type: 'blob',
        path: 'data/fitness/2026/10/2026-10-12-workout-new-blood-wingspan-20.md',
        sha: SHA,
        status: 'planned',
        title: 'New Blood: Wingspan 2.0'
      }
    ]
  });
  assert.equal(result.kind, 'propose');
  assert.match(result.proposal.intent, /Delete planned workout/i);
  assert.equal(result.proposal.writes.length, 1);
  assert.equal(result.proposal.writes[0].mode, 'delete');
  assert.equal(result.proposal.writes[0].content, '');
  const validated = validateProposeActionInput(result.proposal, { agentSlug: 'chadwick' });
  assert.equal(validated.ok, true);
});

test('delete_planned_workout errors when nothing planned exists', async () => {
  const result = await executeShortcut('delete_planned_workout', {
    date: '2026-10-12'
  }, { agentSlug: 'chadwick', repoTree: [] });
  assert.equal(result.kind, 'error');
  assert.match(result.error, /No planned workout/i);
});

test('findPlannedWorkoutDeleteTargets picks by title when several exist', async () => {
  const found = await findPlannedWorkoutDeleteTargets(null, '2026-10-12', {
    title: 'Wingspan',
    tree: [
      {
        type: 'blob',
        path: 'data/fitness/2026/10/2026-10-12-workout-new-blood-wingspan-20.md',
        sha: SHA,
        status: 'planned',
        title: 'New Blood: Wingspan 2.0'
      },
      {
        type: 'blob',
        path: 'data/fitness/2026/10/2026-10-12-workout-dog-walk.md',
        sha: SHA,
        status: 'planned',
        title: 'Dog Walk'
      }
    ]
  });
  assert.equal(found.ok, true);
  assert.deepEqual(found.paths, [
    'data/fitness/2026/10/2026-10-12-workout-new-blood-wingspan-20.md'
  ]);
});
