import test from 'node:test';
import assert from 'node:assert/strict';
import { formatExerciseSets, formatExerciseTitle } from '../../js/app/format-exercise.js';

test('formatExerciseTitle includes bench angle when present', () => {
  assert.equal(formatExerciseTitle({ name: 'Chest Press', bench_angle_deg: 0 }), 'Chest Press @ 0°');
  assert.equal(formatExerciseTitle({ name: 'Row' }), 'Row');
  assert.equal(formatExerciseTitle({}), 'Exercise');
});

test('formatExerciseSets shows weight × reps and cable type', () => {
  assert.equal(
    formatExerciseSets({
      sets: [
        { weight_kg: 32, reps: 10, cable_type: 'concentric' },
        { weight_kg: null, reps: 8, cable_type: 'constant_force' }
      ]
    }),
    '32 kg × 10 · concentric · BW × 8 · constant force'
  );
  assert.equal(formatExerciseSets({ sets: [] }), '');
  assert.equal(formatExerciseSets({}), '');
});
