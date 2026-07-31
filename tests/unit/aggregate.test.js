import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateNutrition,
  calculateWorkoutStreak,
  getLoggingCompleteness,
  getTopSets,
  hasRecoveryBonus,
  resolveDayType
} from '../../js/core/aggregate.js';

const records = [
  { type: 'meal', date: '2026-07-30', meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12, sodium_mg: 420, calcium_mg: 380, polyphenol_score: 6 },
  { type: 'meal', date: '2026-07-30', meal: 'lunch', calories: 610, protein_g: 42, fat_g: 15, sodium_mg: 680, calcium_mg: 210, polyphenol_score: 3 },
  { type: 'workout', date: '2026-07-30', status: 'completed', day_type: 'workout_30', recovery_flag_next_day: false, exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32 }, { reps: 8, weight_kg: 34 }] }] },
  { type: 'diary', date: '2026-07-30' }
];

test('matches the approved sample Home totals for parsed events', () => {
  const events = records.map(record => ({ record, body: '', path: '', legacy: false }));

  assert.deepEqual(aggregateNutrition(events, '2026-07-30'), {
    calories: 1130,
    protein_g: 80,
    fat_g: 27,
    sodium_mg: 1100,
    calcium_mg: 590,
    polyphenol_score: 9,
    meals: {
      breakfast: { protein_g: 38 },
      lunch: { protein_g: 42 },
      dinner: { protein_g: 0 },
      snack: { protein_g: 0 }
    }
  });
  assert.equal(resolveDayType(events, '2026-07-30'), 'workout_30');
  assert.deepEqual(getTopSets(events[2]), { 'Chest Press': { weight_kg: 34, reps: 8 } });
});

test('empty and missing additive nutrition values contribute zero', () => {
  const sparse = [{ type: 'meal', date: '2026-07-31', meal: 'snack', protein_g: null }];

  assert.deepEqual(aggregateNutrition(sparse, '2026-07-31'), {
    calories: 0,
    protein_g: 0,
    fat_g: 0,
    sodium_mg: 0,
    calcium_mg: 0,
    polyphenol_score: 0,
    meals: {
      breakfast: { protein_g: 0 },
      lunch: { protein_g: 0 },
      dinner: { protein_g: 0 },
      snack: { protein_g: 0 }
    }
  });
});

test('day type uses the highest completed workout level', () => {
  const workouts = [
    { type: 'workout', date: '2026-07-30', status: 'completed', day_type: 'movement' },
    { type: 'workout', date: '2026-07-30', status: 'completed', day_type: 'workout_30' },
    { type: 'workout', date: '2026-07-30', status: 'planned', day_type: 'workout_45_60' },
    { type: 'workout', date: '2026-07-30', status: 'skipped', day_type: 'workout_45_60' },
    { type: 'workout', date: '2026-07-29', status: 'completed', day_type: 'workout_45_60' }
  ];

  assert.equal(resolveDayType(workouts, '2026-07-30'), 'workout_30');
  assert.equal(resolveDayType(workouts, '2026-07-31'), 'movement');
});

test('recovery bonus comes from the previous Sydney day only', () => {
  const workouts = [
    { type: 'workout', date: '2026-07-28', status: 'completed', recovery_flag_next_day: true },
    { type: 'workout', date: '2026-07-29', status: 'planned', recovery_flag_next_day: true },
    { type: 'workout', date: '2026-07-30', status: 'completed', recovery_flag_next_day: true },
    { type: 'workout', date: '2026-07-31', status: 'completed', recovery_flag_next_day: true }
  ];

  assert.equal(hasRecoveryBonus(workouts, '2026-07-30'), false);
  assert.equal(hasRecoveryBonus(workouts, '2026-07-31'), true);
  assert.equal(hasRecoveryBonus(workouts, '2026-08-02'), false);
});

test('streak deduplicates dates and ignores planned or skipped sessions', () => {
  const workouts = [
    { type: 'workout', date: '2026-08-01', status: 'planned' },
    { type: 'workout', date: '2026-07-31', status: 'completed' },
    { type: 'workout', date: '2026-07-31', status: 'completed' },
    { type: 'workout', date: '2026-07-30', status: 'completed' },
    { type: 'workout', date: '2026-07-29', status: 'skipped' },
    { type: 'workout', date: '2026-07-28', status: 'completed' }
  ];

  assert.equal(calculateWorkoutStreak(workouts, '2026-08-01'), 2);
  assert.equal(calculateWorkoutStreak(workouts, '2026-07-29'), 1);
  assert.equal(calculateWorkoutStreak(workouts, '2026-07-27'), 0);
});

test('top sets choose greatest weight and break ties with reps', () => {
  const workout = {
    type: 'workout',
    exercises: [
      { name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32 }, { reps: 8, weight_kg: 34 }, { reps: 9, weight_kg: 34 }] },
      { name: 'Bicep Curl', sets: [{ reps: 12, weight_kg: 12 }] }
    ]
  };

  assert.deepEqual(getTopSets(workout), {
    'Chest Press': { weight_kg: 34, reps: 9 },
    'Bicep Curl': { weight_kg: 12, reps: 12 }
  });
});

test('completeness uses exactly five categories and a 48-hour body window', () => {
  const complete = [
    ...records,
    { type: 'weight', date: '2026-07-29', weight_kg: 86.3 },
    { type: 'skincare', date: '2026-07-30', routine: 'pm', completed: true },
    { type: 'sleep', date: '2026-07-30', duration_h: 7.5 },
    { type: 'heart', date: '2026-07-30', resting_hr: 62 }
  ];

  assert.deepEqual(getLoggingCompleteness(complete, '2026-07-30'), {
    nutrition: true,
    fitness: true,
    diary: true,
    body: true,
    skincare: true,
    complete: 5,
    total: 5
  });
  assert.deepEqual(getLoggingCompleteness([
    { type: 'weight', date: '2026-07-28' },
    { type: 'sleep', date: '2026-07-30' },
    { type: 'heart', date: '2026-07-30' }
  ], '2026-07-30'), {
    nutrition: false,
    fitness: false,
    diary: false,
    body: false,
    skincare: false,
    complete: 0,
    total: 5
  });
});
