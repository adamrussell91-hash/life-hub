import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickSameDayPlannedWorkout,
  resolveWorkoutConfirmTarget,
  sameDayWorkoutEntries
} from '../../netlify/functions/_shared/workout-confirm-path.mjs';

test('sameDayWorkoutEntries only keeps dated workout session files', () => {
  const tree = [
    { type: 'blob', path: 'data/fitness/2026/09/2026-09-05-workout-biceps.md', sha: 'a' },
    { type: 'blob', path: 'data/fitness/2026/09/2026-09-05-meal-lunch.md', sha: 'b' },
    { type: 'blob', path: 'data/fitness/templates/chest.md', sha: 'c' }
  ];
  assert.deepEqual(
    sameDayWorkoutEntries(tree, '2026-09-05').map(e => e.path),
    ['data/fitness/2026/09/2026-09-05-workout-biceps.md']
  );
});

test('pickSameDayPlannedWorkout prefers the stable planned path', () => {
  const planned = pickSameDayPlannedWorkout([
    { path: 'data/fitness/2026/09/2026-09-05-workout-biceps.md', status: 'planned', sha: '1' },
    { path: 'data/fitness/2026/09/2026-09-05-workout-planned.md', status: 'planned', sha: '2' }
  ]);
  assert.equal(planned.path, 'data/fitness/2026/09/2026-09-05-workout-planned.md');
});

function clientWith({ path, body }) {
  return {
    async resolveTree() {
      return { tree: [{ type: 'blob', path, sha: 'abc' }] };
    },
    async readBlob() {
      return { content: Buffer.from(body).toString('base64'), encoding: 'base64' };
    }
  };
}

test('completed confirm reuses same-day planned file when slug matches', async () => {
  const path = 'data/fitness/2026/09/2026-09-05-workout-biceps.md';
  const target = await resolveWorkoutConfirmTarget(clientWith({
    path,
    body: '---\nstatus: planned\ntitle: Biceps\n---\n'
  }), {
    record: { type: 'workout', date: '2026-09-05', status: 'completed', title: 'Biceps' },
    slug: 'biceps',
    overwrite: true
  });
  assert.equal(target.path, path);
  assert.equal(target.existingSha, 'abc');
});

test('completed confirm does not clobber a different same-day planned session', async () => {
  const plannedPath = 'data/fitness/2026/09/2026-09-05-workout-biceps.md';
  const target = await resolveWorkoutConfirmTarget(clientWith({
    path: plannedPath,
    body: '---\nstatus: planned\ntitle: Biceps\n---\n'
  }), {
    record: { type: 'workout', date: '2026-09-05', status: 'completed', title: 'Morning Walk' },
    slug: 'morning-walk',
    overwrite: true
  });
  assert.notEqual(target.path, plannedPath);
  assert.match(target.path, /morning-walk/);
});
