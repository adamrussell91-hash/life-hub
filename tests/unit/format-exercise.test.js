import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCableType,
  formatExerciseSetCount,
  formatExerciseSets,
  formatExerciseTitle,
  humanizeFieldLabel
} from '../../js/app/format-exercise.js';

test('formatExerciseTitle includes bench angle when present', () => {
  assert.equal(formatExerciseTitle({ name: 'Chest Press', bench_angle_deg: 0 }), 'Chest Press @ 0°');
  assert.equal(formatExerciseTitle({ name: 'Row' }), 'Row');
  assert.equal(formatExerciseTitle({}), 'Exercise');
});

test('formatExerciseSetCount uses a short plural', () => {
  assert.equal(formatExerciseSetCount({ sets: [{ reps: 10 }] }), '1 set');
  assert.equal(formatExerciseSetCount({ sets: [{}, {}] }), '2 sets');
  assert.equal(formatExerciseSetCount({}), '0 sets');
});

test('formatExerciseSets labels weight, reps, and cable type per set', () => {
  assert.equal(
    formatExerciseSets({
      sets: [
        { weight_kg: 32, reps: 10, cable_type: 'concentric' },
        { weight_kg: null, reps: 8, cable_type: 'constant_force' }
      ]
    }),
    'Set 1: 32 kg × 10 reps · cable: concentric\nSet 2: bodyweight × 8 reps · cable: constant force'
  );
  assert.equal(
    formatExerciseSets({ sets: [{ weight_kg: 20, reps: 12, cable_type: 'none' }] }),
    'Set 1: 20 kg × 12 reps · cable: none (not on cables)'
  );
  assert.equal(formatExerciseSets({ sets: [] }), '');
  assert.equal(formatExerciseSets({}), '');
});

test('formatCableType and humanizeFieldLabel stay readable', () => {
  assert.equal(formatCableType('constant_force'), 'constant force');
  assert.equal(humanizeFieldLabel('session_kind'), 'Session kind');
  assert.equal(humanizeFieldLabel('day_type'), 'Day type');
});
