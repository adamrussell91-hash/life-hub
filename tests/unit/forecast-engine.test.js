import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS_CONFIG } from '../../netlify/functions/_shared/targets-config.mjs';
import { theilSenTrend } from '../../apps/life/js/core/forecast-statistics.js';
import {
  buildEnergyCalibration,
  forbesEnergyPartition
} from '../../apps/life/js/core/forecast-body.js';
import {
  buildLiftForecasts,
  buildTapeForecast
} from '../../apps/life/js/core/forecast-target-clocks.js';
import { buildForecast } from '../../apps/life/js/core/forecast-engine.js';

test('Theil-Sen keeps a falling trend despite a single weight outlier', () => {
  const trend = theilSenTrend([
    { date: '2026-09-01', weight: 90 },
    { date: '2026-09-05', weight: 89.5 },
    { date: '2026-09-09', weight: 96 },
    { date: '2026-09-13', weight: 88.5 },
    { date: '2026-09-17', weight: 88 }
  ], 'weight');
  assert.ok(trend.slope_per_week < 0);
  assert.equal(trend.observation_count, 5);
});

test('Forbes/Hall partition changes with current fat mass', () => {
  const leaner = forbesEnergyPartition(10);
  const fatter = forbesEnergyPartition(30);
  assert.ok(leaner.lean_energy_fraction > fatter.lean_energy_fraction);
  assert.ok(leaner.effective_kcal_per_kg < fatter.effective_kcal_per_kg);
});

const workout = (date, exercise, sets, mode = 'constant_force') => ({
  type: 'workout',
  date,
  status: 'completed',
  session_kind: 'strength',
  exercises: [{
    name: exercise,
    sets: sets.map(([weight_kg, reps]) => ({ weight_kg, reps, cable_type: mode }))
  }]
});

test('lift clock never mixes elastic and constant-force series', () => {
  const records = [
    workout('2026-08-29', 'Cable Bar Wide Grip Curl', [[34, 10]]),
    workout('2026-09-12', 'Cable Bar Wide Grip Curl', [[36, 10], [40, 10]]),
    workout('2026-09-12', 'Cable Bar Wide Grip Curl', [[42, 10]], 'elastic'),
    workout('2026-09-19', 'Cable Bar Wide Grip Curl', [[38, 12]])
  ];
  const curl = buildLiftForecasts(records, '2026-09-21', TARGETS_CONFIG)
    .find(row => row.exercise === 'Cable Bar Wide Grip Curl');
  assert.equal(curl.mode, 'constant_force');
  assert.equal(curl.exposure_count, 3);
  assert.equal(curl.status, 'locked');
  assert.equal(curl.hard_sessions_missing, 1);
});

test('same-day tape corrections do not create ratio ambiguity when shoulders and waist match', () => {
  const records = [
    { type: 'measurements', date: '2026-04-08', shoulders: 116, waist: 99.1 },
    { type: 'measurements', date: '2026-06-29', shoulders: 111, waist: 97 },
    { type: 'measurements', date: '2026-08-01', shoulders: 113, waist: 88.5 },
    { type: 'measurements', date: '2026-09-19', shoulders: 116, waist: 89, left_thigh: 60 },
    { type: 'measurements', date: '2026-09-19', shoulders: 116, waist: 89, left_thigh: 58 }
  ];
  const result = buildTapeForecast(records, '2026-09-21', 1.6);
  assert.notEqual(result.status, 'locked');
  assert.equal(result.warnings.some(w => w.code === 'ambiguous_shoulder_waist_same_date'), false);
});

test('latest same-date shoulder/waist disagreement locks the ratio clock', () => {
  const records = [
    { type: 'measurements', date: '2026-04-08', shoulders: 116, waist: 99.1 },
    { type: 'measurements', date: '2026-06-29', shoulders: 111, waist: 97 },
    { type: 'measurements', date: '2026-08-01', shoulders: 113, waist: 88.5 },
    { type: 'measurements', date: '2026-09-19', shoulders: 116, waist: 89 },
    { type: 'measurements', date: '2026-09-19', shoulders: 116, waist: 91 }
  ];
  const result = buildTapeForecast(records, '2026-09-21', 1.6);
  assert.equal(result.status, 'locked');
  assert.match(result.missing[0], /ambiguity/);
});

function meal(date, calories = 1700, protein_g = 145) {
  return { type: 'meal', date, meal: 'dinner', calories, protein_g };
}

function datePlus(start, days) {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test('synthetic well-covered history yields a usable energy calibration', () => {
  const records = [];
  for (let i = 0; i < 28; i++) records.push(meal(datePlus('2026-08-25', i)));
  const weightDates = [0, 4, 8, 12, 16, 20, 24, 27];
  weightDates.forEach((offset, i) => {
    records.push({
      type: i === weightDates.length - 1 ? 'composition' : 'weight',
      date: datePlus('2026-08-25', offset),
      weight_kg: 90 - i * 0.4,
      ...(i === weightDates.length - 1 ? { body_fat_pct: 20 } : {})
    });
  });

  for (const offset of [1, 4, 8, 11, 15, 18, 22, 25]) {
    records.push({
      type: 'workout',
      date: datePlus('2026-08-25', offset),
      status: 'completed',
      session_kind: 'strength',
      day_type: 'workout_30',
      focus: ['chest'],
      exercises: [{
        name: 'Bar Press',
        sets: Array.from({ length: 5 }, (_, i) => ({
          weight_kg: 40 + i,
          reps: 10,
          cable_type: 'constant_force'
        }))
      }]
    });
  }

  const calibration = buildEnergyCalibration(
    records,
    '2026-09-21',
    TARGETS_CONFIG,
    new Map([['Bar Press', { name: 'Bar Press', target_area: 'Chest' }]])
  );
  assert.equal(calibration.status, 'ready');
  assert.ok(calibration.inferred_expenditure_kcal_day > calibration.intake_kcal_day);

  const forecast = buildForecast({
    items: records,
    asOf: '2026-09-21',
    targetsConfig: TARGETS_CONFIG,
    libraryByName: new Map([['Bar Press', { name: 'Bar Press', target_area: 'Chest' }]])
  });
  assert.notEqual(forecast.body.as_logged.status, 'locked');
  assert.notEqual(forecast.body.on_plan.status, 'locked');
  assert.equal(forecast.sleep.status, 'unavailable');
});
