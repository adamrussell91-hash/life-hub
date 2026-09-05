import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickSameDayPlannedWorkout,
  sameDayWorkoutEntries
} from '../../netlify/functions/_shared/workout-confirm-path.mjs';

test('sameDayWorkoutEntries lists only that date’s fitness workout files', () => {
  const tree = [
    { path: 'data/fitness/2026/09/2026-09-05-workout-1607.md', type: 'blob', sha: '1'.repeat(40) },
    { path: 'data/fitness/2026/09/2026-09-05-workout-1609.md', type: 'blob', sha: '2'.repeat(40) },
    { path: 'data/fitness/2026/09/2026-09-04-workout-1800.md', type: 'blob', sha: '3'.repeat(40) },
    { path: 'data/fitness/templates/the-full-send.md', type: 'blob', sha: '4'.repeat(40) }
  ];
  assert.deepEqual(
    sameDayWorkoutEntries(tree, '2026-09-05').map(entry => entry.path),
    [
      'data/fitness/2026/09/2026-09-05-workout-1607.md',
      'data/fitness/2026/09/2026-09-05-workout-1609.md'
    ]
  );
});

test('pickSameDayPlannedWorkout prefers the stable planned slug, else the latest planned file', () => {
  const planned = [
    { path: 'data/fitness/2026/09/2026-09-05-workout-1607.md', sha: '1'.repeat(40), status: 'planned' },
    { path: 'data/fitness/2026/09/2026-09-05-workout-planned.md', sha: '2'.repeat(40), status: 'planned' }
  ];
  assert.equal(
    pickSameDayPlannedWorkout(planned).path,
    'data/fitness/2026/09/2026-09-05-workout-planned.md'
  );

  const timed = [
    { path: 'data/fitness/2026/09/2026-09-05-workout-1607.md', sha: '1'.repeat(40), status: 'planned' },
    { path: 'data/fitness/2026/09/2026-09-05-workout-1609.md', sha: '2'.repeat(40), status: 'planned' },
    { path: 'data/fitness/2026/09/2026-09-05-workout-1628.md', sha: '3'.repeat(40), status: 'completed' }
  ];
  assert.equal(
    pickSameDayPlannedWorkout(timed).path,
    'data/fitness/2026/09/2026-09-05-workout-1609.md'
  );
  assert.equal(pickSameDayPlannedWorkout([]), null);
});
