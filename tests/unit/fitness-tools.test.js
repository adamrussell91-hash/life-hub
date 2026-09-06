import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chadwickFitnessToolSchemas,
  fitnessHistoryBounds,
  getBodyState,
  getExerciseHistory,
  getFitnessSnapshot,
  getLoadStatus,
  getLongTermFitness,
  getPainTrainingSummary,
  getSessionComparisons,
  getTrainingVolume,
  getWorkingWeights,
  getWorkoutTemplate
} from '../../netlify/functions/_shared/fitness-tools.mjs';

function workout(date, title, exercises, extras = {}) {
  return {
    date,
    type: 'workout',
    status: 'completed',
    title,
    focus: extras.focus ?? ['chest'],
    exercises,
    ...(extras.pain_flags ? { pain_flags: extras.pain_flags } : {})
  };
}

const today = '2026-09-06';
const records = [
  workout('2026-08-01', 'Push', [{ name: 'Bench Press', sets: [{ reps: 5, weight_kg: 80 }, { reps: 3, weight_kg: 85 }] }]),
  workout('2026-08-08', 'Push', [{ name: 'Bench Press', sets: [{ reps: 5, weight_kg: 82 }, { reps: 3, weight_kg: 87 }] }]),
  workout('2026-08-15', 'Push', [{ name: 'Bench Press', sets: [{ reps: 5, weight_kg: 84 }] }]),
  workout('2026-08-22', 'Legs', [{ name: 'Squat', sets: [{ reps: 5, weight_kg: 100 }] }], { focus: ['legs'] }),
  workout('2026-08-29', 'Push', [{ name: 'Bench Press', sets: [{ reps: 5, weight_kg: 86 }] }]),
  workout(
    '2026-09-01',
    'Pull',
    [{ name: 'Deadlift', sets: [{ reps: 3, weight_kg: 140 }] }],
    { focus: ['back'], pain_flags: [{ site: 'lower back', note: 'tight' }] }
  )
];

test('chadwickFitnessToolSchemas registers the Fitness/Body pack under stable names', () => {
  const names = chadwickFitnessToolSchemas().map(schema => schema.name);
  assert.deepEqual(names, [
    'get_fitness_snapshot',
    'get_training_volume',
    'get_working_weights',
    'get_long_term_fitness',
    'get_session_comparisons',
    'get_exercise_history',
    'get_load_status',
    'get_pain_training_summary',
    'get_body_state',
    'get_workout_template'
  ]);
});

test('fitnessHistoryBounds covers 26 weeks ending today', () => {
  assert.deepEqual(fitnessHistoryBounds(today), {
    weeks: 26,
    from: '2026-03-09',
    to: today
  });
});

test('getFitnessSnapshot returns Fitness page week/month summary fields', () => {
  const result = getFitnessSnapshot(records, today);
  assert.equal(result.ok, true);
  assert.equal(result.same_as, 'Fitness page header / week / month summary');
  assert.equal(result.last_completed_date, '2026-09-01');
  assert.equal(result.week.completed, 1);
  assert.equal(result.week.target, 4);
  assert.equal(typeof result.week.volume_kg, 'number');
  assert.equal(typeof result.month.volume_kg, 'number');
});

test('getTrainingVolume distinguishes kg tonnage from session counts', () => {
  const result = getTrainingVolume(records, today);
  assert.equal(result.ok, true);
  assert.match(result.how_to_read, /kg tonnage|not session counts/i);
  assert.equal(typeof result.this_week_volume_kg, 'number');
  assert.ok(Array.isArray(result.recent_volume_weeks));
});

test('getWorkingWeights filters by exercise query', () => {
  const result = getWorkingWeights(records, today, { query: 'bench' });
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.equal(result.lifts[0].name, 'Bench Press');
  assert.equal(result.lifts[0].weight_kg, 86);
});

test('getLongTermFitness returns the 26-week trio', () => {
  const result = getLongTermFitness(records, today);
  assert.equal(result.ok, true);
  assert.equal(result.weeks, 26);
  assert.equal(typeof result.workouts_per_week, 'number');
  assert.equal(typeof result.adherence_pct, 'number');
  assert.ok(Array.isArray(result.weekly_volume));
  assert.ok(result.weekly_volume.length >= 20);
});

test('getSessionComparisons returns hero session and lift deltas', () => {
  const result = getSessionComparisons(records, today);
  assert.equal(result.ok, true);
  assert.equal(result.hero_session.date, '2026-09-01');
  assert.ok(result.comparisons.some(row => row.name === 'Deadlift'));
});

test('getExerciseHistory returns recent completed sets for a lift', () => {
  const result = getExerciseHistory(records, today, { query: 'Bench', limit: 3 });
  assert.equal(result.ok, true);
  assert.equal(result.count, 3);
  assert.equal(result.history[0].date, '2026-08-29');
  assert.ok(result.history[0].sets.length >= 1);
});

test('getLoadStatus returns ACWR band series', () => {
  const result = getLoadStatus(records, today);
  assert.equal(result.ok, true);
  assert.ok(result.latest === null || typeof result.latest.volume_kg === 'number');
  assert.ok(Array.isArray(result.weeks));
});

test('getPainTrainingSummary rolls up workout pain flags', () => {
  const result = getPainTrainingSummary(records, today);
  assert.equal(result.ok, true);
  assert.ok(result.sites.some(site => /lower back/i.test(site.site)));
});

test('getBodyState reads composition, tape, and shoulder:waist', () => {
  const result = getBodyState({
    compositionRecords: [{ date: '2026-09-01', weight_kg: 82, body_fat_pct: 18 }],
    measurementRecords: [{ date: '2026-09-01', shoulders: 120, waist: 84 }],
    targetRatio: 1.4
  });
  assert.equal(result.ok, true);
  assert.equal(result.found, true);
  assert.match(result.summary, /82kg|body fat 18%/i);
  assert.equal(result.shoulder_waist_ratio, Math.round((120 / 84) * 100) / 100);
});

test('getWorkoutTemplate finds a saved template by title fragment', () => {
  const result = getWorkoutTemplate(
    [
      {
        path: 'data/fitness/templates/push-day.md',
        content: `---\ntitle: "Push Day"\nsession_kind: "strength"\nday_type: "push"\nfocus: ["chest"]\nsource_session_date: "2026-08-29"\nexercises: [{"name":"Bench Press","sets":[{"reps":6,"weight_kg":80}]}]\n---\n`
      }
    ],
    { query: 'push' }
  );
  assert.equal(result.ok, true);
  assert.equal(result.found, true);
  assert.equal(result.results[0].title, 'Push Day');
  assert.equal(result.results[0].exercises[0].name, 'Bench Press');
});
