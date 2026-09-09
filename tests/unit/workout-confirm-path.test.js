import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickMatchingPlannedWorkout,
  pickSameDayPlannedWorkout,
  resolveWorkoutConfirmTarget,
  sameDayWorkoutEntries,
  workoutSlugFromPath
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

test('workoutSlugFromPath drops the calendar date prefix', () => {
  assert.equal(
    workoutSlugFromPath('data/fitness/2026/09/2026-09-05-workout-dog-walk.md'),
    'workout-dog-walk'
  );
});

test('pickSameDayPlannedWorkout prefers the stable planned path', () => {
  const planned = pickSameDayPlannedWorkout([
    { path: 'data/fitness/2026/09/2026-09-05-workout-biceps.md', status: 'planned', sha: '1' },
    { path: 'data/fitness/2026/09/2026-09-05-workout-planned.md', status: 'planned', sha: '2' }
  ]);
  assert.equal(planned.path, 'data/fitness/2026/09/2026-09-05-workout-planned.md');
});

test('pickMatchingPlannedWorkout matches by title without collapsing a second plan', () => {
  const entries = [
    { path: 'data/fitness/2026/09/2026-09-05-workout-the-full-send.md', status: 'planned', sha: '1', title: 'The Full Send' },
    { path: 'data/fitness/2026/09/2026-09-05-workout-dog-walk.md', status: 'planned', sha: '2', title: 'Dog Walk' }
  ];
  assert.equal(
    pickMatchingPlannedWorkout(entries, { title: 'Dog Walk' }).path,
    'data/fitness/2026/09/2026-09-05-workout-dog-walk.md'
  );
  assert.equal(
    pickMatchingPlannedWorkout(entries, { slug: 'workout-the-full-send' }).path,
    'data/fitness/2026/09/2026-09-05-workout-the-full-send.md'
  );
  assert.equal(
    pickMatchingPlannedWorkout(entries, { title: 'Evening EP', slug: 'workout-evening-ep' }),
    null
  );
});

function clientWith(files) {
  const list = Array.isArray(files) ? files : [files];
  return {
    async resolveTree() {
      return {
        tree: list.map(({ path, sha = 'abc' }) => ({ type: 'blob', path, sha }))
      };
    },
    async readBlob(sha) {
      const file = list.find(entry => (entry.sha ?? 'abc') === sha) ?? list[0];
      return { content: Buffer.from(file.body).toString('base64'), encoding: 'base64' };
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

test('planned confirm creates a second file instead of overwriting a different titled plan', async () => {
  const existing = 'data/fitness/2026/09/2026-09-05-workout-the-full-send.md';
  const target = await resolveWorkoutConfirmTarget(clientWith({
    path: existing,
    sha: 'abc',
    body: '---\nstatus: planned\ntitle: The Full Send\n---\n'
  }), {
    record: {
      type: 'workout',
      date: '2026-09-05',
      status: 'planned',
      title: 'Dog Walk Around the Block'
    },
    slug: 'workout-dog-walk-around-the-block',
    overwrite: false
  });
  assert.equal(target.path, 'data/fitness/2026/09/2026-09-05-workout-dog-walk-around-the-block.md');
  assert.equal(target.existingSha, undefined);
});

test('planned confirm amends the matching titled plan', async () => {
  const existing = 'data/fitness/2026/09/2026-09-05-workout-the-full-send.md';
  const target = await resolveWorkoutConfirmTarget(clientWith({
    path: existing,
    sha: 'abc',
    body: '---\nstatus: planned\ntitle: The Full Send\n---\n'
  }), {
    record: {
      type: 'workout',
      date: '2026-09-05',
      status: 'planned',
      title: 'The Full Send'
    },
    slug: 'workout-the-full-send',
    overwrite: false
  });
  assert.equal(target.path, existing);
  assert.equal(target.existingSha, 'abc');
});
