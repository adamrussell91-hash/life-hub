import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFitnessModel,
  estimateOneRepMax,
  sessionVolume,
  normalizeExerciseName,
  canonicalExerciseName,
  REGION_KEYS,
  resolveExerciseRegion
} from '../../apps/life/js/app/fitness-model.js';

const workout = (overrides) => ({
  type: 'workout',
  date: '2026-07-30',
  title: 'Chest and Curls',
  focus: ['chest', 'arms'],
  duration_min: 26,
  day_type: 'workout_30',
  status: 'completed',
  recovery_flag_next_day: false,
  exercises: [
    { name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32 }, { reps: 8, weight_kg: 34 }] },
    { name: 'Bicep Curl', sets: [{ reps: 12, weight_kg: 12 }] }
  ],
  pain_flags: [],
  ...overrides
});

const events = (records) => records.map(record => ({ record, body: '', path: '', legacy: false }));

test('estimateOneRepMax uses Epley', () => {
  assert.equal(estimateOneRepMax(100, 1), 100);
  assert.ok(Math.abs(estimateOneRepMax(100, 5) - (100 * (1 + 5 / 30))) < 1e-9);
  assert.equal(estimateOneRepMax(null, 5), null);
});

test('sessionVolume sums reps * weight for valid sets only', () => {
  assert.equal(sessionVolume(workout()), 10 * 32 + 8 * 34 + 12 * 12);
});

test('normalizeExerciseName trims and lowercases', () => {
  assert.equal(normalizeExerciseName('  Chest Press '), 'chest press');
});

test('canonicalExerciseName strips trailing set numbers so logged sets collapse', () => {
  assert.equal(canonicalExerciseName('Bar Press set 1'), 'Bar Press');
  assert.equal(canonicalExerciseName('Bar Press set 12'), 'Bar Press');
  assert.equal(normalizeExerciseName('Bar Press set 2'), 'bar press');
});

test('comparisons collapse set-suffixed names and expose a kg delta', () => {
  const model = buildFitnessModel({
    events: events([
      workout({
        date: '2026-07-20',
        exercises: [
          { name: 'Bar Press set 1', sets: [{ reps: 10, weight_kg: 28 }] },
          { name: 'Bar Press set 2', sets: [{ reps: 8, weight_kg: 30 }] }
        ]
      }),
      workout({
        date: '2026-07-30',
        exercises: [
          { name: 'Bar Press set 1', sets: [{ reps: 10, weight_kg: 30 }] },
          { name: 'Bar Press set 2', sets: [{ reps: 8, weight_kg: 32 }] },
          { name: 'Bar Press set 3', sets: [{ reps: 8, weight_kg: 32 }] }
        ]
      })
    ]),
    date: '2026-07-30'
  });
  assert.equal(model.comparisons.length, 1);
  assert.equal(model.comparisons[0].name, 'Bar Press');
  assert.equal(model.comparisons[0].firstLogged, false);
  assert.equal(model.comparisons[0].weightDeltaKg, 2);
  assert.equal(model.weekCompletedCount, 1);
  assert.equal(model.weekTarget, 4);
});

test('hero prefers today planned over older completed', () => {
  const model = buildFitnessModel({
    events: events([
      workout({ date: '2026-07-29', status: 'completed', title: 'Yesterday' }),
      workout({ date: '2026-07-30', status: 'planned', title: 'Planned Pump', exercises: [] })
    ]),
    date: '2026-07-30'
  });
  assert.equal(model.heroSession.title, 'Planned Pump');
  assert.equal(model.heroSession.status, 'planned');
});

test('hero session carries path and notes body from the event', () => {
  const model = buildFitnessModel({
    events: [{
      record: workout({ status: 'planned', title: 'Planned Pump' }),
      body: 'Felt sharp today',
      path: 'data/fitness/2026/07/2026-07-30-planned-pump.md',
      legacy: false
    }],
    date: '2026-07-30'
  });
  assert.equal(model.heroSession.path, 'data/fitness/2026/07/2026-07-30-planned-pump.md');
  assert.equal(model.heroSession.notes, 'Felt sharp today');
});

test('hero prefers today completed over today planned', () => {
  const model = buildFitnessModel({
    events: events([
      workout({ date: '2026-07-30', status: 'planned', title: 'Planned Pump', exercises: [] }),
      workout({ date: '2026-07-30', status: 'completed', title: 'Done Pump', time: '18:00' })
    ]),
    date: '2026-07-30'
  });
  assert.equal(model.heroSession.title, 'Done Pump');
  assert.equal(model.heroSession.status, 'completed');
});

test('hero falls back to latest completed on or before display date', () => {
  const model = buildFitnessModel({
    events: events([
      workout({ date: '2026-07-28', title: 'Older' }),
      workout({ date: '2026-07-30', title: 'Chest and Curls' })
    ]),
    date: '2026-07-30'
  });
  assert.equal(model.heroSession.title, 'Chest and Curls');
});

test('weekVolume and month consistency ignore planned/skipped', () => {
  const model = buildFitnessModel({
    events: events([
      workout({ date: '2026-07-30' }),
      workout({ date: '2026-07-29', status: 'planned', exercises: [{ name: 'X', sets: [{ reps: 10, weight_kg: 10 }] }] }),
      workout({ date: '2026-07-28', status: 'skipped', exercises: [{ name: 'Y', sets: [{ reps: 10, weight_kg: 10 }] }] })
    ]),
    date: '2026-07-30'
  });
  assert.equal(model.weekVolume.find(d => d.date === '2026-07-30').volume, 10 * 32 + 8 * 34 + 12 * 12);
  assert.equal(model.weekVolume.find(d => d.date === '2026-07-29').volume, 0);
  assert.equal(model.month.find(d => d.date === '2026-07-30').completed, true);
  assert.equal(model.month.find(d => d.date === '2026-07-29').completed, false);
});

test('comparisons flag PR when e1rm beats all prior history for that exercise name', () => {
  const model = buildFitnessModel({
    events: events([
      workout({
        date: '2026-07-20',
        exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 30 }] }]
      }),
      workout({
        date: '2026-07-30',
        exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 34 }] }]
      })
    ]),
    date: '2026-07-30'
  });
  const row = model.comparisons.find(c => c.name === 'Chest Press');
  assert.equal(row.isPr, true);
  assert.equal(row.firstLogged, false);
  assert.ok(row.e1rm > row.previousE1rm);
});

test('first logged exercise is not a PR', () => {
  const model = buildFitnessModel({
    events: events([workout({ date: '2026-07-30' })]),
    date: '2026-07-30'
  });
  assert.equal(model.comparisons.every(c => c.firstLogged && !c.isPr), true);
});

test('rejects missing display date', () => {
  assert.throws(() => buildFitnessModel({ events: [], date: null }), /display date/i);
});

test('heroSession includes muscleMapKeys from coarse focus', () => {
  const model = buildFitnessModel({
    events: events([workout({ date: '2026-08-07', status: 'planned' })]),
    date: '2026-08-07'
  });
  assert.deepEqual(model.heroSession.muscleMapKeys, ['chest-whole', 'arm-bicep']);
});

test('REGION_KEYS lists the five strength card regions', () => {
  assert.deepEqual(REGION_KEYS, ['chest', 'arms', 'abs', 'legs', 'back']);
});

test('resolveExerciseRegion prefers focus tags over exercise name', () => {
  assert.equal(resolveExerciseRegion({ name: 'Bench Press', focus: ['arms'] }), 'arms');
  assert.equal(resolveExerciseRegion({ name: 'Mystery Move' }, ['legs']), 'legs');
  assert.equal(resolveExerciseRegion({ name: 'Mystery Move' }, ['core']), 'abs');
});

test('resolveExerciseRegion falls back to name regexes', () => {
  assert.equal(resolveExerciseRegion({ name: 'Incline Bench' }), 'chest');
  assert.equal(resolveExerciseRegion({ name: 'Chest Fly' }), 'chest');
  assert.equal(resolveExerciseRegion({ name: 'Chest Press' }), 'chest');
  assert.equal(resolveExerciseRegion({ name: 'Barbell Curl' }), 'arms');
  assert.equal(resolveExerciseRegion({ name: 'Tricep Extension' }), 'arms');
  assert.equal(resolveExerciseRegion({ name: 'Bicep Curl' }), 'arms');
  assert.equal(resolveExerciseRegion({ name: 'Cable Crunch' }), 'abs');
  assert.equal(resolveExerciseRegion({ name: 'Plank Hold' }), 'abs');
  assert.equal(resolveExerciseRegion({ name: 'Core Twist' }), 'abs');
  assert.equal(resolveExerciseRegion({ name: 'Back Squat' }), 'legs');
  assert.equal(resolveExerciseRegion({ name: 'Romanian Deadlift' }), 'legs');
  assert.equal(resolveExerciseRegion({ name: 'Walking Lunge' }), 'legs');
  assert.equal(resolveExerciseRegion({ name: 'RDL' }), 'legs');
  assert.equal(resolveExerciseRegion({ name: 'Calf Raise' }), 'legs');
  assert.equal(resolveExerciseRegion({ name: 'Leg Press' }), 'legs');
  assert.equal(resolveExerciseRegion({ name: 'Seated Row' }), 'back');
  assert.equal(resolveExerciseRegion({ name: 'Pull-Up' }), 'back');
  assert.equal(resolveExerciseRegion({ name: 'Lat Pulldown' }), 'back');
  assert.equal(resolveExerciseRegion({ name: 'Mystery Move' }, ['chest', 'arms']), null);
});

test('bare press names do not map to chest (Leg / Overhead / Shoulder Press)', () => {
  assert.equal(resolveExerciseRegion({ name: 'Leg Press' }), 'legs');
  assert.notEqual(resolveExerciseRegion({ name: 'Overhead Press' }), 'chest');
  assert.notEqual(resolveExerciseRegion({ name: 'Shoulder Press' }), 'chest');
});

test('longTerm weeklyVolume spans ~26 weeks with volumeDeltaPct', () => {
  const model = buildFitnessModel({
    events: events([
      workout({
        date: '2026-03-02',
        focus: ['chest'],
        exercises: [{ name: 'Bench Press', sets: [{ reps: 10, weight_kg: 40 }] }]
      }),
      workout({
        date: '2026-07-20',
        focus: ['chest'],
        exercises: [{ name: 'Bench Press', sets: [{ reps: 10, weight_kg: 50 }] }]
      }),
      workout({
        date: '2026-07-22',
        focus: ['chest'],
        exercises: [{ name: 'Bench Press', sets: [{ reps: 10, weight_kg: 50 }] }]
      })
    ]),
    date: '2026-08-12'
  });

  assert.equal(model.longTerm.weeklyVolume.length, 26);
  assert.equal(model.longTerm.weeklyVolume[0].weekStart, '2026-02-16');
  assert.equal(model.longTerm.weeklyVolume.at(-1).weekStart, '2026-08-10');
  assert.equal(model.longTerm.weeklyVolume.find(w => w.weekStart === '2026-03-02').value, 400);
  assert.equal(model.longTerm.weeklyVolume.find(w => w.weekStart === '2026-07-20').value, 1000);
  // Earlier half sum 400; recent half sum 1000 → +150%
  assert.ok(Math.abs(model.longTerm.volumeDeltaPct - 150) < 1e-9);
});

test('longTerm workoutsPerWeek and adherencePct vs ~4/week target', () => {
  const records = [];
  for (let i = 0; i < 8; i++) {
    records.push(workout({
      date: `2026-07-${String(6 + i).padStart(2, '0')}`,
      focus: ['legs'],
      exercises: [{ name: 'Squat', sets: [{ reps: 5, weight_kg: 60 }] }]
    }));
  }
  const model = buildFitnessModel({ events: events(records), date: '2026-08-12' });
  // 8 workouts across 26 weeks → 8/26 per week
  assert.ok(Math.abs(model.longTerm.workoutsPerWeek - (8 / 26)) < 1e-9);
  assert.ok(Math.abs(model.longTerm.adherencePct - ((8 / 26) / 4) * 100) < 1e-9);
});

test('regions expose best-set kg delta, volume delta, colour, and image path', () => {
  const model = buildFitnessModel({
    events: events([
      // Prior ~30d (2026-06-14 .. 2026-07-13): chest 40kg, volume 10*40=400
      workout({
        date: '2026-06-20',
        focus: ['chest'],
        exercises: [{ name: 'Bench Press', sets: [{ reps: 10, weight_kg: 40 }] }]
      }),
      // Current ~30d (2026-07-14 .. 2026-08-12): chest 50kg, volume 10*50=500
      workout({
        date: '2026-08-01',
        focus: ['chest'],
        exercises: [{ name: 'Bench Press', sets: [{ reps: 10, weight_kg: 50 }] }]
      }),
      // Arms only in current window → no best-set delta
      workout({
        date: '2026-08-02',
        focus: ['arms'],
        exercises: [{ name: 'Bicep Curl', sets: [{ reps: 12, weight_kg: 14 }] }]
      })
    ]),
    date: '2026-08-12'
  });

  assert.equal(model.regions.length, 5);
  const chest = model.regions.find(r => r.key === 'chest');
  assert.equal(chest.label, 'Chest');
  assert.equal(chest.image, 'assets/fitness/regions/chest.png');
  assert.equal(chest.bestSetDeltaKg, 10);
  assert.equal(chest.currentBestKg, 50);
  assert.equal(chest.currentVolume, 500);
  assert.ok(Math.abs(chest.volumeDeltaPct - 25) < 1e-9);
  assert.equal(chest.colour, 'green');

  const arms = model.regions.find(r => r.key === 'arms');
  assert.equal(arms.bestSetDeltaKg, null);
  assert.equal(arms.currentBestKg, 14);
  assert.equal(arms.currentVolume, 168);
  assert.equal(arms.colour, 'neutral');

  const legs = model.regions.find(r => r.key === 'legs');
  assert.equal(legs.image, 'assets/fitness/regions/legs.png');
  assert.equal(legs.bestSetDeltaKg, null);
  assert.equal(legs.currentBestKg, null);
  assert.equal(legs.currentVolume, 0);
  assert.equal(legs.volumeDeltaPct, null);
});

test('strengthDeltaPct averages region best-set percent changes with data', () => {
  const model = buildFitnessModel({
    events: events([
      workout({
        date: '2026-06-20',
        focus: ['chest'],
        exercises: [{ name: 'Bench Press', sets: [{ reps: 5, weight_kg: 40 }] }]
      }),
      workout({
        date: '2026-06-21',
        focus: ['back'],
        exercises: [{ name: 'Seated Row', sets: [{ reps: 8, weight_kg: 50 }] }]
      }),
      workout({
        date: '2026-08-01',
        focus: ['chest'],
        exercises: [{ name: 'Bench Press', sets: [{ reps: 5, weight_kg: 50 }] }]
      }),
      workout({
        date: '2026-08-02',
        focus: ['back'],
        exercises: [{ name: 'Seated Row', sets: [{ reps: 8, weight_kg: 55 }] }]
      })
    ]),
    date: '2026-08-12'
  });
  // chest +25%, back +10% → mean 17.5
  assert.ok(Math.abs(model.longTerm.strengthDeltaPct - 17.5) < 1e-9);
});

test('existing streak and weekVolume fields remain on the model', () => {
  const model = buildFitnessModel({
    events: events([workout({ date: '2026-08-12' })]),
    date: '2026-08-12'
  });
  assert.equal(typeof model.streak, 'number');
  assert.equal(model.weekVolume.length, 7);
  assert.ok(Array.isArray(model.focusHits));
  assert.ok(Array.isArray(model.comparisons));
  assert.equal(model.month.length, 30);
});
