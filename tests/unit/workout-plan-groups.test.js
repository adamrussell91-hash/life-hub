import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSupersetBlockLabel,
  groupWorkoutPlanExercises
} from '../../js/core/workout-plan-groups.js';

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
