import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSupersetBlockLabel,
  groupWorkoutPlanExercises
} from '../../apps/life/js/core/workout-plan-groups.js';

test('groupWorkoutPlanExercises groups exercises by superset_group', () => {
  const blocks = groupWorkoutPlanExercises([
    { name: 'Bar Press', superset_group: 1, superset_label: '1&2 superset' },
    { name: 'Cable Curl', superset_group: 1 },
    { name: 'Bar Row', superset_group: 2, superset_label: '3&4 superset' },
    { name: 'Face Pull', superset_group: 2 }
  ]);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, 'superset');
  assert.equal(blocks[0].label, '1&2 superset');
  assert.equal(blocks[0].exercises.length, 2);
  assert.equal(blocks[1].exercises[1].name, 'Face Pull');
});

test('groupWorkoutPlanExercises keeps between-set arms on one block', () => {
  const blocks = groupWorkoutPlanExercises([
    {
      name: 'Bar Squat',
      sets: [{ reps: 10, weight_kg: 25, cable_type: 'none' }],
      between_sets: { name: 'Bar Bicep Curl', sets: [{ reps: 10, weight_kg: 5, cable_type: 'none' }] }
    }
  ]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, 'between');
  assert.equal(blocks[0].exercises[0].between_sets.name, 'Bar Bicep Curl');
});

test('formatSupersetBlockLabel prefers explicit labels', () => {
  assert.equal(formatSupersetBlockLabel({ label: '7&8 straight', kind: 'superset' }, 0), '7&8 straight');
  assert.equal(formatSupersetBlockLabel({ kind: 'superset' }, 1), 'Superset 2');
});

import {
  amrapRoundCapacity,
  buildLoggerSteps,
  buildSessionSteps,
  copyExerciseStructure,
  formatBlockScheme,
  provisionAmrapCircuitRounds
} from '../../apps/life/js/core/workout-plan-groups.js';
import { validateRecord } from '../../apps/life/js/core/validate.js';
import { collapseSetSplitExercises } from '../../netlify/functions/_shared/workout-history.mjs';
import { buildTemplateRecord } from '../../netlify/functions/_shared/workout-templates.mjs';

test('amrapRoundCapacity plans enough Cindy round-slots for a 3-minute window', () => {
  assert.equal(amrapRoundCapacity(180), 6);
  assert.equal(amrapRoundCapacity(180, 3), 3);
  assert.equal(amrapRoundCapacity(null), 8);
});

test('provisionAmrapCircuitRounds expands a one-set AMRAP Cindy to capacity', () => {
  const exercises = [
    { name: 'Push Up', tracking: 'bodyweight_reps', superset_group: 1, superset_label: 'Cindy',
      block: { kind: 'circuit', format: 'amrap', time_cap_sec: 180 },
      sets: [{ reps: 5, cable_type: 'none' }] },
    { name: 'Bench Dip', tracking: 'bodyweight_reps', superset_group: 1, sets: [{ reps: 5, cable_type: 'none' }] },
    { name: 'Bodyweight Russian Twist', tracking: 'bodyweight_reps', superset_group: 1, sets: [{ reps: 5, cable_type: 'none' }] },
    { name: 'Bent Leg Reverse Crunch', tracking: 'bodyweight_reps', superset_group: 1, sets: [{ reps: 5, cable_type: 'none' }] }
  ];
  provisionAmrapCircuitRounds(exercises);
  for (const exercise of exercises) {
    assert.equal(exercise.sets.length, 6);
    assert.deepEqual(exercise.sets.map(set => set.reps), [5, 5, 5, 5, 5, 5]);
  }
  const { steps } = buildLoggerSteps(exercises);
  assert.equal(steps.filter(step => step.kind === 'round').length, 6);
});

test('collapseSetSplitExercises provisions thin AMRAP groups when keepGroups is on', () => {
  const out = collapseSetSplitExercises([
    { name: 'Push Up', superset_group: 1, block: { kind: 'circuit', format: 'amrap', time_cap_sec: 180 }, sets: [{ reps: 5 }] },
    { name: 'Bench Dip', superset_group: 1, sets: [{ reps: 5 }] }
  ], { keepGroups: true });
  assert.equal(out[0].sets.length, 6);
  assert.equal(out[1].sets.length, 6);
});

const sets = n => Array.from({ length: n }, () => ({ reps: 10, weight_kg: 20, cable_type: 'constant_force' }));

test('blocks are lettered A, B, C and 3+ members default to a circuit', () => {
  const blocks = groupWorkoutPlanExercises([
    { name: 'Hip Thrust', sets: sets(3) },
    { name: 'Press', superset_group: 4, sets: sets(3) },
    { name: 'Curl', superset_group: 4, sets: sets(3) },
    { name: 'Push-Up', superset_group: 5, sets: sets(2) },
    { name: 'Dip', superset_group: 5, sets: sets(2) },
    { name: 'Crunch', superset_group: 5, sets: sets(2) }
  ]);
  assert.deepEqual(blocks.map(block => `${block.letter}:${block.kind}:${block.rounds}`), [
    'A:single:3', 'B:superset:3', 'C:circuit:2'
  ]);
  assert.equal(formatBlockScheme(blocks[1]), '3 rounds · B1 → B2');
});

test('session steps interleave a superset round by round', () => {
  const { steps } = buildSessionSteps([
    { name: 'Press', superset_group: 1, sets: sets(2) },
    { name: 'Curl', superset_group: 1, sets: sets(2) }
  ]);
  assert.deepEqual(steps.map(step => `${step.exerciseIndex}.${step.setIndex}${step.restAfter ? 'R' : ''}`), [
    '0.0', '1.0R', '0.1', '1.1R'
  ]);
});

test('logger steps fold a circuit round into one step', () => {
  const { steps } = buildLoggerSteps([
    { name: 'Push-Up', superset_group: 1, block: { kind: 'circuit' }, sets: sets(2) },
    { name: 'Dip', superset_group: 1, sets: sets(2) },
    { name: 'Crunch', superset_group: 1, sets: sets(2) }
  ]);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].kind, 'round');
  assert.deepEqual(steps[0].members.map(member => member.exerciseIndex), [0, 1, 2]);
});

test('copyExerciseStructure keeps grouping; templates drop the day\'s notes and score', () => {
  const exercise = {
    name: 'Push-Up',
    superset_group: 3,
    superset_label: 'Cindy',
    block: { kind: 'circuit', format: 'for_time', result: { rounds: 3, time_sec: 96 } },
    notes: 'did dips instead'
  };
  assert.deepEqual(copyExerciseStructure(exercise), {
    superset_group: 3,
    superset_label: 'Cindy',
    block: { kind: 'circuit', format: 'for_time', result: { rounds: 3, time_sec: 96 } },
    notes: 'did dips instead'
  });
  const template = buildTemplateRecord({ title: 'Glow Up', exercises: [{ ...exercise, sets: sets(3) }] }, '2026-10-04');
  assert.equal(template.exercises[0].superset_group, 3);
  assert.deepEqual(template.exercises[0].block, { kind: 'circuit', format: 'for_time' });
  assert.equal(template.exercises[0].notes, undefined);
});

test('collapse keeps a move that appears in two different supersets', () => {
  const out = collapseSetSplitExercises([
    { name: 'Overhead Triceps', superset_group: 2, sets: sets(2) },
    { name: 'Overhead Triceps', superset_group: 8, sets: sets(2) }
  ], { keepGroups: true });
  assert.deepEqual(out.map(item => item.superset_group), [2, 8]);
});

test('collapse turns an ungrouped A, B, A, B alternation into a superset instead of AAA BBB', () => {
  const out = collapseSetSplitExercises([
    { name: 'Bar Press set 1', sets: sets(1) },
    { name: 'Curl', sets: sets(1) },
    { name: 'Bar Press set 2', sets: sets(1) },
    { name: 'Curl', sets: sets(1) },
    { name: 'Row', sets: sets(2) }
  ], { keepGroups: true });
  assert.deepEqual(out.map(item => item.name), ['Bar Press', 'Curl', 'Row']);
  assert.equal(out[0].superset_group, out[1].superset_group);
  assert.ok(out[0].superset_group != null);
  assert.equal(out[2].superset_group, undefined);
  assert.equal(out[0].sets.length, 2);
});

test('validation accepts block, failure and notes; rejects bad shapes', () => {
  const record = {
    schema_version: 1,
    id: 'w1',
    type: 'workout',
    date: '2026-10-04',
    created_at: '2026-10-04T10:00:00+11:00',
    updated_at: '2026-10-04T10:00:00+11:00',
    source: 'chat',
    title: 'Glow Up',
    session_kind: 'strength',
    day_type: 'workout_45_60',
    status: 'completed',
    exercises: [
      {
        name: 'Push-Up',
        superset_group: 3,
        notes: 'did dips',
        rest_sec: 60,
        block: { kind: 'circuit', format: 'for_time', result: { rounds: 3, time_sec: 96 } },
        sets: [{ reps: 7, weight_kg: 20, cable_type: 'constant_force', failed: true, note: 'failure on rep 8' }]
      }
    ]
  };
  assert.deepEqual(validateRecord(record).filter(error => /exercises|block|failed|note|kind|format/.test(error)), []);
  const bad = structuredClone(record);
  bad.exercises[0].block.kind = 'giant';
  bad.exercises[0].sets[0].failed = 'yes';
  const errors = validateRecord(bad);
  assert.ok(errors.some(error => /kind must be one of/.test(error)));
  assert.ok(errors.some(error => /failed must be a boolean/.test(error)));
});
