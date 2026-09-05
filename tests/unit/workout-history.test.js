import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FITNESS_SESSION_PATH,
  MAX_RECENT_WORKOUTS,
  collapseSetSplitExercises,
  daysSinceLastCompletedWorkout,
  formatRecentWorkoutsForPrompt,
  getLastWorkout,
  getLastWorkoutSchema,
  lastCompletedWorkout,
  normalizeExerciseName,
  searchWorkoutRecords,
  searchWorkoutRecordsSchema,
  selectRecentWorkoutEntries
} from '../../netlify/functions/_shared/workout-history.mjs';

function session(overrides = {}) {
  return {
    type: 'workout',
    status: 'completed',
    date: '2026-09-01',
    time: '16:28',
    title: 'Planned session',
    day_type: 'workout_30',
    duration_min: 30,
    focus: ['chest', 'arms'],
    notes: 'TRUE superset alternation',
    exercises: [
      { name: 'Bar Press set 1', sets: [{ reps: 10, weight_kg: 30, cable_type: 'constant_force' }] },
      { name: 'Curl set 1', sets: [{ reps: 8, weight_kg: 37, cable_type: 'constant_force' }] },
      { name: 'Bar Press set 2', sets: [{ reps: 8, weight_kg: 34, cable_type: 'constant_force' }] },
      { name: 'Curl set 2', sets: [{ reps: 10, weight_kg: 37, cable_type: 'constant_force' }] }
    ],
    ...overrides
  };
}

test('FITNESS_SESSION_PATH matches dated session files and rejects templates', () => {
  assert.ok(FITNESS_SESSION_PATH.test('data/fitness/2026/09/2026-09-01-workout-1628.md'));
  assert.ok(!FITNESS_SESSION_PATH.test('data/fitness/templates/planned-session.md'));
  assert.ok(!FITNESS_SESSION_PATH.test('data/fitness/2026/09'));
});

test('selectRecentWorkoutEntries returns the newest session files, newest first, capped', () => {
  const tree = [
    { type: 'blob', path: 'data/fitness/templates/chest-and-curls.md', sha: 't' },
    { type: 'blob', path: 'data/fitness/2026/08/2026-08-29-workout-1857.md', sha: 'a' },
    { type: 'blob', path: 'data/fitness/2026/09/2026-09-01-workout-1628.md', sha: 'b' },
    { type: 'blob', path: 'data/fitness/2026/08/2026-08-06-workout-1610.md', sha: 'c' },
    { type: 'tree', path: 'data/fitness/2026/09' }
  ];
  const entries = selectRecentWorkoutEntries(tree, { limit: 2 });
  assert.deepEqual(entries.map(entry => entry.path), [
    'data/fitness/2026/09/2026-09-01-workout-1628.md',
    'data/fitness/2026/08/2026-08-29-workout-1857.md'
  ]);
  assert.equal(MAX_RECENT_WORKOUTS, 8);
});

test('selectRecentWorkoutEntries tolerates a non-array tree', () => {
  assert.deepEqual(selectRecentWorkoutEntries(undefined), []);
});

test('normalizeExerciseName strips a trailing set N suffix', () => {
  assert.equal(normalizeExerciseName('Bar Press set 1'), 'Bar Press');
  assert.equal(normalizeExerciseName('Biceps Curl set 3'), 'Biceps Curl');
  assert.equal(normalizeExerciseName('Flat Fly burnout'), 'Flat Fly burnout');
  assert.equal(normalizeExerciseName('  Overhead Triceps  '), 'Overhead Triceps');
});

test('collapseSetSplitExercises merges interleaved set-N rows into real exercises', () => {
  const collapsed = collapseSetSplitExercises(session().exercises);
  assert.deepEqual(collapsed.map(exercise => exercise.name), ['Bar Press', 'Curl']);
  assert.equal(collapsed[0].sets.length, 2);
  assert.equal(collapsed[0].sets[1].weight_kg, 34);
  assert.equal(collapsed[1].sets.length, 2);
});

test('collapseSetSplitExercises is idempotent on already-clean exercises', () => {
  const clean = [{ name: 'Bar Press', sets: [{ reps: 10, weight_kg: 40, cable_type: 'constant_force' }] }];
  assert.deepEqual(collapseSetSplitExercises(clean), clean);
  assert.deepEqual(collapseSetSplitExercises(collapseSetSplitExercises(session().exercises)).map(e => e.name), [
    'Bar Press',
    'Curl'
  ]);
});

test('lastCompletedWorkout prefers the newest completed session and ignores planned', () => {
  const records = [
    session({ date: '2026-08-08', title: 'Operation Snatched', status: 'planned' }),
    session({ date: '2026-08-29', title: 'Biceps and Boobs, 20 mins', time: '18:57' }),
    session({ date: '2026-09-01', title: 'Planned session', time: '16:28' })
  ];
  const last = lastCompletedWorkout(records);
  assert.equal(last.title, 'Planned session');
  assert.equal(last.date, '2026-09-01');
});

test('daysSinceLastCompletedWorkout uses the newest completed date, not planned', () => {
  const records = [
    session({ date: '2026-09-01', status: 'completed' }),
    session({ date: '2026-09-04', status: 'planned', title: 'New pump' })
  ];
  assert.equal(daysSinceLastCompletedWorkout(records, '2026-09-05'), 4);
  assert.equal(daysSinceLastCompletedWorkout([], '2026-09-05'), null);
});

test('formatRecentWorkoutsForPrompt names the last completed session and collapsed moves', () => {
  const text = formatRecentWorkoutsForPrompt([
    session({ date: '2026-08-29', title: 'Biceps and Boobs, 20 mins' }),
    session({ date: '2026-09-01', title: 'Planned session' })
  ]);
  assert.match(text, /2026-09-01/);
  assert.match(text, /Planned session/);
  assert.match(text, /completed/);
  assert.match(text, /Bar Press/);
  assert.doesNotMatch(text, /Bar Press set 1/);
  assert.match(text, /Biceps and Boobs/);
});

test('formatRecentWorkoutsForPrompt is empty when there are no sessions', () => {
  assert.equal(formatRecentWorkoutsForPrompt([]), '');
  assert.equal(formatRecentWorkoutsForPrompt(undefined), '');
});

test('getLastWorkout returns the newest completed session with collapsed exercises', () => {
  const result = getLastWorkout([
    session({ date: '2026-08-29', title: 'Biceps and Boobs, 20 mins' }),
    session({ date: '2026-09-01', title: 'Planned session' })
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.found, true);
  assert.equal(result.session.title, 'Planned session');
  assert.equal(result.session.date, '2026-09-01');
  assert.deepEqual(result.session.exercises.map(exercise => exercise.name), ['Bar Press', 'Curl']);
});

test('getLastWorkout reports not found when only planned sessions exist', () => {
  const result = getLastWorkout([session({ status: 'planned' })]);
  assert.equal(result.ok, true);
  assert.equal(result.found, false);
});

test('searchWorkoutRecords finds a session by title or exercise name', () => {
  const records = [
    session({ date: '2026-08-29', title: 'Biceps and Boobs, 20 mins', exercises: [
      { name: 'Bar Press', sets: [{ reps: 10, weight_kg: 40, cable_type: 'constant_force' }] }
    ] }),
    session({ date: '2026-08-06', title: 'Leg Day 20min', exercises: [
      { name: 'Bar Squat', sets: [{ reps: 10, weight_kg: 30, cable_type: 'none' }] }
    ] })
  ];
  const byTitle = searchWorkoutRecords(records, { query: 'leg day' });
  assert.equal(byTitle.ok, true);
  assert.equal(byTitle.count, 1);
  assert.equal(byTitle.results[0].title, 'Leg Day 20min');

  const byMove = searchWorkoutRecords(records, { query: 'bar press' });
  assert.equal(byMove.count, 1);
  assert.equal(byMove.results[0].title, 'Biceps and Boobs, 20 mins');
});

test('searchWorkoutRecords rejects an empty query', () => {
  assert.equal(searchWorkoutRecords([session()], { query: '  ' }).ok, false);
});

test('workout history tool schemas use the expected names', () => {
  assert.equal(getLastWorkoutSchema().name, 'get_last_workout');
  assert.equal(searchWorkoutRecordsSchema().name, 'search_workout_records');
});
