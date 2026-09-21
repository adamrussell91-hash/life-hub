import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS_CONFIG } from '../../netlify/functions/_shared/targets-config.mjs';
import { deriveDailyNutrition } from '../../apps/life/js/core/forecast-inputs.js';
import {
  FORECAST_WINDOWS_DAYS,
  backfillForecastInputs,
  buildMealPattern,
  dedupeTapeMeasurements,
  estimateHabitualIntake,
  summariseTrainingBehaviour,
  weightTrackingPrompt
} from '../../apps/life/js/core/forecast-inputs.js';

const meal = (date, mealType, calories, protein = 20) => ({
  type: 'meal', date, meal: mealType, calories, protein_g: protein
});

test('calorie thresholds classify unlogged, partial, and complete without inventing intake', () => {
  const day = (calories, count = 1) => deriveDailyNutrition(
    calories === 0 && count === 0
      ? []
      : [{ type: 'meal', date: '2026-09-01', meal: 'lunch', calories, protein_g: 10 }],
    '2026-09-01'
  );
  assert.equal(deriveDailyNutrition([], '2026-09-01').nutrition_logging_status, 'unlogged');
  assert.equal(deriveDailyNutrition([], '2026-09-01').daily_intake_kcal, null);
  assert.equal(day(0).nutrition_logging_status, 'unlogged');
  assert.equal(day(0).daily_intake_kcal, null);
  assert.equal(day(650).nutrition_logging_status, 'partial');
  assert.equal(day(650).daily_intake_kcal, null);
  assert.equal(day(650).logged_calories, 650);
  assert.equal(day(999).nutrition_logging_status, 'partial');
  assert.equal(day(1000).nutrition_logging_status, 'complete');
  assert.equal(day(1000).daily_intake_kcal, 1000);
  assert.equal(day(1800).nutrition_logging_status, 'complete');
  assert.equal(day(1800).daily_intake_kcal, 1800);
});

test('breakfast absence counts only on complete days; partial breakfasts still set typical calories', () => {
  const records = [
    meal('2026-09-01', 'breakfast', 400, 30),
    meal('2026-09-01', 'lunch', 400, 30),
    meal('2026-09-01', 'dinner', 400, 30),
    meal('2026-09-02', 'lunch', 500, 30),
    meal('2026-09-02', 'dinner', 600, 30),
    meal('2026-09-03', 'breakfast', 650, 40),
    meal('2026-09-05', 'breakfast', 800, 35),
    meal('2026-09-05', 'lunch', 400, 30),
    meal('2026-09-05', 'dinner', 400, 30)
  ];
  const pattern = buildMealPattern(records, { from: '2026-09-01', to: '2026-09-06' });
  const breakfast = pattern.meals.find(row => row.meal === 'breakfast');
  assert.equal(pattern.complete_days, 3);
  assert.equal(pattern.partial_days, 1);
  assert.equal(pattern.unlogged_days, 2);
  assert.equal(breakfast.frequency, 0.6667);
  assert.equal(breakfast.typical_calories, 650);
  assert.equal(breakfast.weekday_frequency, 0.5);
  assert.equal(breakfast.weekend_frequency, 1);
  assert.ok(breakfast.weekday_frequency !== breakfast.weekend_frequency);

  const intake = estimateHabitualIntake(records, { from: '2026-09-01', to: '2026-09-06' });
  assert.equal(intake.direct_calories_mean, 1300);
  assert.equal(intake.direct_calories, 1200);
  assert.notEqual(intake.direct_calories_mean, 975);
  assert.equal(intake.unlogged_days, 2);
  assert.equal(intake.reliability.unlogged_days, 'unknown_not_zero');
  assert.equal(intake.reliability.partial_days, 'observed_meals_not_daily_totals');
  const empty = estimateHabitualIntake([], { from: '2026-09-01', to: '2026-09-03' });
  assert.equal(empty.unlogged_days, 3);
  assert.equal(empty.direct_calories, null);
  assert.equal(empty.reconstructed_expected_calories, null);
  assert.equal(empty.reconstructed_expected_protein_g, null);
  for (const days of FORECAST_WINDOWS_DAYS) {
    assert.equal(estimateHabitualIntake(records, { asOf: '2026-09-06', days }).window.days, days);
  }
});

test('walks, plans, empty sessions, and placeholder sets are not hypertrophy stimulus', () => {
  const library = new Map([['Bar Press', { name: 'Bar Press', target_area: 'Chest' }]]);
  const records = [
    {
      type: 'workout', date: '2026-09-01', status: 'completed', session_kind: 'walk', duration_min: 40,
      exercises: [{ name: 'Walk', sets: [{ reps: 10, weight_kg: 20, cable_type: 'none' }] }]
    },
    {
      type: 'workout', date: '2026-09-01', status: 'planned', session_kind: 'strength',
      exercises: [{ name: 'Bar Press', sets: [{ reps: 8, weight_kg: 40, cable_type: 'constant_force' }] }]
    },
    {
      type: 'workout', date: '2026-09-02', status: 'completed', session_kind: 'strength',
      exercises: [{ name: 'Bar Press', sets: [{ reps: 0, weight_kg: 40, cable_type: 'constant_force' }, { reps: 10, weight_kg: 0, cable_type: 'constant_force' }] }]
    },
    {
      type: 'workout', date: '2026-09-03', status: 'completed', session_kind: 'mobility', duration_min: 20,
      exercises: []
    },
    {
      type: 'workout', date: '2026-09-04', status: 'completed', session_kind: 'strength', focus: ['chest'],
      exercises: [{
        name: 'Bar Press',
        sets: [
          { reps: 8, weight_kg: 40, cable_type: 'constant_force' },
          { reps: 0, weight_kg: 50, cable_type: 'constant_force' },
          { reps: 6, weight_kg: 20, cable_type: 'elastic' }
        ]
      }]
    }
  ];
  const summary = summariseTrainingBehaviour(records, { from: '2026-09-01', to: '2026-09-04' }, {
    libraryByName: library,
    targetsConfig: TARGETS_CONFIG
  });
  assert.equal(summary.genuine_loaded_sessions, 1);
  assert.equal(summary.valid_loaded_sets, 2);
  assert.equal(summary.ignored.walk_sessions, 1);
  assert.equal(summary.ignored.planned_sessions, 1);
  assert.equal(summary.ignored.mobility_sessions, 1);
  assert.equal(summary.ignored.completed_without_loaded_sets, 1);
  assert.equal(summary.ignored.invalid_sets, 3);
  assert.equal(summary.loaded_sets_by_muscle_group.chest, 2);
  assert.equal(summary.loaded_sets_by_resistance_mode.constant_force, 1);
  assert.equal(summary.loaded_sets_by_resistance_mode.elastic, 1);
  const press = summary.target_lift_exposures.find(row => row.exercise === 'Bar Press');
  assert.equal(press.sets, 2);
  assert.equal(press.sessions, 1);
  assert.equal(press.by_mode.constant_force.sets, 1);
  assert.equal(press.by_mode.elastic.sets, 1);
  assert.notEqual(press.by_mode.constant_force, press.by_mode.elastic);
});

test('composition and dedicated weights count once per day and drive the reminder', () => {
  const records = [
    { type: 'composition', date: '2026-09-15', weight_kg: 80.2, id: 'c1' },
    { type: 'weight', date: '2026-09-15', weight_kg: 80.2, id: 'w1' },
    { type: 'weight', date: '2026-09-16', weight_kg: 80.4, id: 'w2' }
  ];
  const low = weightTrackingPrompt(records, '2026-09-21');
  assert.equal(low.distinct_weight_days, 2);
  assert.equal(low.weight_tracking_prompt_needed, true);
  assert.equal(low.warnings.some(warning => warning.code === 'duplicate_weight'), true);

  const enough = weightTrackingPrompt([
    ...records,
    { type: 'composition', date: '2026-09-18', weight_kg: 80.1, id: 'c2' }
  ], '2026-09-21');
  assert.equal(enough.distinct_weight_days, 3);
  assert.equal(enough.weight_tracking_prompt_needed, false);

  const today = weightTrackingPrompt([
    { type: 'weight', date: '2026-09-21', weight_kg: 80, id: 'today' }
  ], '2026-09-21');
  assert.equal(today.distinct_weight_days, 1);
  assert.equal(today.recorded_today, true);
  assert.equal(today.weight_tracking_prompt_needed, false);
});

test('backfill is idempotent and does not fabricate or rewrite source records', () => {
  const tape = {
    type: 'measurements', date: '2026-09-01', id: 'tape-a', chest: 100, waist: 80, shoulders: 120
  };
  const records = [
    meal('2026-09-01', 'dinner', 1200, 40),
    meal('2026-09-01', 'snack', 200, 10),
    { ...tape },
    { ...tape, id: 'tape-b' },
    { type: 'composition', date: '2026-09-02', id: 'comp', weight_kg: 81, body_fat_pct: 18 },
    { type: 'weight', date: '2026-09-03', id: 'wt', weight_kg: 80.5 }
  ];
  const before = JSON.stringify(records);
  const options = { asOf: '2026-09-06', targetsConfig: TARGETS_CONFIG, windows: [28, 42, 56] };
  const first = backfillForecastInputs(records, options);
  const second = backfillForecastInputs(records, options);
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(records), before);
  assert.equal(records[0].calories, 1200);
  assert.equal(records[1].calories, 200);
  assert.equal(first.measurements.length, 1);
  assert.equal(first.data_quality.warnings.some(warning => warning.code === 'duplicate_tape'), true);
  assert.equal(first.nutrition.daily.find(day => day.date === '2026-09-04').nutrition_logging_status, 'unlogged');
  assert.equal(first.nutrition.daily.find(day => day.date === '2026-09-04').daily_intake_kcal, null);
  assert.equal(first.nutrition.daily.find(day => day.date === '2026-09-01').nutrition_logging_status, 'complete');
  const tapeDerived = dedupeTapeMeasurements(records);
  assert.equal(tapeDerived.measurements.length, 1);
  assert.equal(tapeDerived.measurements[0].record, records[2]);
});
