import test from 'node:test';
import assert from 'node:assert/strict';
import { lintWorkoutProposal } from '../../netlify/functions/_shared/workout-lint.mjs';

function exercise(name, overrides = {}) {
  return {
    name,
    sets: [{ reps: 10, weight_kg: 20, cable_type: 'constant_force' }],
    coach_cues: { start: 'Set up.', rest: 'Breathe.', final_set: 'Leave 1.', },
    ...overrides
  };
}

function warmupSession(extraExercises = [], overrides = {}) {
  return {
    type: 'workout',
    session_kind: 'strength',
    status: 'planned',
    exercises: [
      exercise('Warmup: Light Cable Rows'),
      exercise('Chest Press'),
      exercise('Bar Curl'),
      exercise('Lat Pulldown'),
      exercise('Shoulder Press'),
      ...extraExercises
    ],
    ...overrides
  };
}

test('lintWorkoutProposal returns no warnings for a well-formed 5-exercise session with a warmup', () => {
  assert.deepEqual(lintWorkoutProposal(warmupSession()), []);
});

test('lintWorkoutProposal returns no warnings at the 9-exercise upper boundary', () => {
  const session = warmupSession([
    exercise('Row'), exercise('Fly'), exercise('Tricep Pushdown'), exercise('Leg Press')
  ]);
  assert.equal(session.exercises.length, 9);
  assert.deepEqual(lintWorkoutProposal(session), []);
});

test('lintWorkoutProposal flags too few exercises', () => {
  const session = {
    type: 'workout', session_kind: 'strength', status: 'planned',
    exercises: [exercise('Warmup'), exercise('Chest Press'), exercise('Bar Curl')]
  };
  const warnings = lintWorkoutProposal(session);
  assert.ok(warnings.some(w => /5-9|five|nine/i.test(w)), JSON.stringify(warnings));
});

test('lintWorkoutProposal flags too many exercises', () => {
  const session = warmupSession([
    exercise('Row'), exercise('Fly'), exercise('Tricep Pushdown'), exercise('Leg Press'), exercise('Calf Raise')
  ]);
  assert.equal(session.exercises.length, 10);
  const warnings = lintWorkoutProposal(session);
  assert.ok(warnings.some(w => /5-9|five|nine/i.test(w)), JSON.stringify(warnings));
});

test('lintWorkoutProposal flags more than 2 exercises carrying an intensification tag', () => {
  const session = warmupSession([], {
    exercises: [
      exercise('Warmup: Light Cable Rows'),
      exercise('Chest Press', { intensification: 'drop_set' }),
      exercise('Bar Curl', { intensification: 'rest_pause' }),
      exercise('Lat Pulldown', { intensification: 'superset' }),
      exercise('Shoulder Press')
    ]
  });
  const warnings = lintWorkoutProposal(session);
  assert.ok(warnings.some(w => /intensification/i.test(w)), JSON.stringify(warnings));
});

test('lintWorkoutProposal does not flag exactly 2 intensification-tagged exercises', () => {
  const session = warmupSession([], {
    exercises: [
      exercise('Warmup: Light Cable Rows'),
      exercise('Chest Press', { intensification: 'drop_set' }),
      exercise('Bar Curl', { intensification: 'rest_pause' }),
      exercise('Lat Pulldown'),
      exercise('Shoulder Press')
    ]
  });
  assert.deepEqual(lintWorkoutProposal(session), []);
});

test('lintWorkoutProposal flags a missing warmup', () => {
  const session = {
    type: 'workout', session_kind: 'strength', status: 'planned',
    exercises: [
      exercise('Chest Press'), exercise('Bar Curl'), exercise('Lat Pulldown'),
      exercise('Shoulder Press'), exercise('Leg Press')
    ]
  };
  const warnings = lintWorkoutProposal(session);
  assert.ok(warnings.some(w => /warmup/i.test(w)), JSON.stringify(warnings));
});

test('lintWorkoutProposal flags a set missing cable_type', () => {
  const session = warmupSession([], {
    exercises: [
      exercise('Warmup: Light Cable Rows'),
      exercise('Chest Press', { sets: [{ reps: 10, weight_kg: 20 }] }),
      exercise('Bar Curl'),
      exercise('Lat Pulldown'),
      exercise('Shoulder Press')
    ]
  });
  const warnings = lintWorkoutProposal(session);
  assert.ok(warnings.some(w => /cable_type/i.test(w)), JSON.stringify(warnings));
});

test('lintWorkoutProposal ignores non-workout records', () => {
  assert.deepEqual(lintWorkoutProposal({ type: 'meal' }), []);
  assert.deepEqual(lintWorkoutProposal(null), []);
  assert.deepEqual(lintWorkoutProposal(undefined), []);
});

test('lintWorkoutProposal skips non-strength session kinds (walk/ep/mobility) entirely', () => {
  for (const session_kind of ['walk', 'ep', 'mobility', 'other']) {
    assert.deepEqual(
      lintWorkoutProposal({ type: 'workout', session_kind, status: 'completed', exercises: [] }),
      []
    );
  }
});

test('lintWorkoutProposal skips a strength session with no exercises yet (mid-iteration, nothing to lint)', () => {
  assert.deepEqual(
    lintWorkoutProposal({ type: 'workout', session_kind: 'strength', status: 'planned', exercises: [] }),
    []
  );
});

test('lintWorkoutProposal can return multiple warnings at once', () => {
  const session = {
    type: 'workout', session_kind: 'strength', status: 'planned',
    exercises: [exercise('Chest Press'), exercise('Bar Curl'), exercise('Lat Pulldown')]
  };
  const warnings = lintWorkoutProposal(session);
  assert.ok(warnings.length >= 2, JSON.stringify(warnings));
});

test('lintWorkoutProposal flags exploded set-N exercise names', () => {
  const session = warmupSession([
    exercise('Bar Press set 1'),
    exercise('Bar Press set 2')
  ]);
  const warnings = lintWorkoutProposal(session);
  assert.ok(warnings.some(w => /set\s*\d|one row per exercise/i.test(w)), JSON.stringify(warnings));
});

test('lintWorkoutProposal flags a generic Planned session title on a finished log', () => {
  const session = warmupSession([], { title: 'Planned session', status: 'completed' });
  const warnings = lintWorkoutProposal(session);
  assert.ok(warnings.some(w => /title|Planned session/i.test(w)), JSON.stringify(warnings));
});

test('lintWorkoutProposal flags planned exercises missing coach_cues', () => {
  const session = warmupSession([], {
    exercises: [
      exercise('Warmup: Light Cable Rows', { coach_cues: undefined }),
      exercise('Chest Press', { coach_cues: undefined }),
      exercise('Bar Curl', { coach_cues: undefined }),
      exercise('Lat Pulldown', { coach_cues: undefined }),
      exercise('Shoulder Press', { coach_cues: undefined })
    ]
  });
  const warnings = lintWorkoutProposal(session);
  assert.ok(warnings.some(w => /coach_cues/i.test(w)), JSON.stringify(warnings));
});

test('lintWorkoutProposal flags too many focuses on a workout_30 day', () => {
  const session = warmupSession([], { day_type: 'workout_30', focus: ['chest', 'back', 'arms'] });
  const warnings = lintWorkoutProposal(session);
  assert.ok(warnings.some(w => /focus/i.test(w)), JSON.stringify(warnings));
});
