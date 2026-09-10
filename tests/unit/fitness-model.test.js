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
  assert.equal(model.workingWeights.length, 1);
  assert.equal(model.workingWeights[0].name, 'Bar Press');
  assert.equal(model.workingWeights[0].weight_kg, 32);
  assert.equal(model.recentSessions.length, 2);
  assert.equal(model.volumeWeeks.length, 2);
  assert.ok(model.weekVolumeKg > 0);
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

test('hero prefers a remaining planned session over today’s completed one', () => {
  const model = buildFitnessModel({
    events: events([
      workout({ date: '2026-07-30', status: 'completed', title: 'Morning Pump', time: '09:00' }),
      workout({ date: '2026-07-30', status: 'planned', title: 'Dog Walk', time: '18:00', exercises: [] })
    ]),
    date: '2026-07-30'
  });
  assert.equal(model.heroSession.title, 'Dog Walk');
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

test('hero falls back to today completed when no planned session remains', () => {
  const model = buildFitnessModel({
    events: events([
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

test('REGION_KEYS lists every strength card region including shoulders and full body', () => {
  assert.deepEqual(REGION_KEYS, [
    'chest', 'shoulders', 'arms', 'abs', 'legs', 'back', 'full_body'
  ]);
});

test('library target_area feeds every Region tile — one shared path, not per-lift patches', () => {
  // Names deliberately avoid REGION_NAME_PATTERNS keywords. Multi-focus session
  // also fails without library. Every library target_area must resolve to a tile.
  const library = new Map([
    ['nova flat load', { name: 'Nova Flat Load', target_area: 'Chest' }],
    ['nova hinge pull', { name: 'Nova Hinge Pull', target_area: 'Arms' }],
    ['nova midline hold', { name: 'Nova Midline Hold', target_area: 'Core' }],
    ['nova thruster', { name: 'Nova Thruster', target_area: 'Legs' }],
    ['nova posterior drive', { name: 'Nova Posterior Drive', target_area: 'Glutes' }],
    ['nova yoke pull', { name: 'Nova Yoke Pull', target_area: 'Back' }],
    ['nova overhead arc', { name: 'Nova Overhead Arc', target_area: 'Shoulders' }],
    ['nova metro circuit', { name: 'Nova Metro Circuit', target_area: 'Full Body' }]
  ]);
  const multi = ['chest', 'arms', 'legs', 'back', 'shoulders'];

  for (const name of [
    'Nova Flat Load', 'Nova Hinge Pull', 'Nova Midline Hold',
    'Nova Thruster', 'Nova Posterior Drive', 'Nova Yoke Pull',
    'Nova Overhead Arc', 'Nova Metro Circuit'
  ]) {
    assert.equal(resolveExerciseRegion({ name }, multi), null, `${name} must need library`);
  }

  assert.equal(resolveExerciseRegion({ name: 'Nova Flat Load' }, multi, library), 'chest');
  assert.equal(resolveExerciseRegion({ name: 'Nova Hinge Pull' }, multi, library), 'arms');
  assert.equal(resolveExerciseRegion({ name: 'Nova Midline Hold' }, multi, library), 'abs');
  assert.equal(resolveExerciseRegion({ name: 'Nova Thruster' }, multi, library), 'legs');
  assert.equal(resolveExerciseRegion({ name: 'Nova Posterior Drive' }, multi, library), 'legs');
  assert.equal(resolveExerciseRegion({ name: 'Nova Yoke Pull' }, multi, library), 'back');
  assert.equal(resolveExerciseRegion({ name: 'Nova Overhead Arc' }, multi, library), 'shoulders');
  assert.equal(resolveExerciseRegion({ name: 'Nova Metro Circuit' }, multi, library), 'full_body');
});

test('buildFitnessModel applies library target_area across all seven tiles in one session', () => {
  const library = new Map([
    ['nova flat load', { name: 'Nova Flat Load', target_area: 'Chest' }],
    ['nova overhead arc', { name: 'Nova Overhead Arc', target_area: 'Shoulders' }],
    ['nova hinge pull', { name: 'Nova Hinge Pull', target_area: 'Arms' }],
    ['nova midline hold', { name: 'Nova Midline Hold', target_area: 'Core' }],
    ['nova thruster', { name: 'Nova Thruster', target_area: 'Legs' }],
    ['nova yoke pull', { name: 'Nova Yoke Pull', target_area: 'Back' }],
    ['nova metro circuit', { name: 'Nova Metro Circuit', target_area: 'Full Body' }]
  ]);
  const model = buildFitnessModel({
    events: events([
      workout({
        date: '2026-09-10',
        focus: ['chest', 'arms', 'legs', 'back', 'core', 'shoulders'],
        exercises: [
          { name: 'Nova Flat Load', sets: [{ reps: 5, weight_kg: 50 }] },
          { name: 'Nova Overhead Arc', sets: [{ reps: 5, weight_kg: 30 }] },
          { name: 'Nova Hinge Pull', sets: [{ reps: 5, weight_kg: 20 }] },
          { name: 'Nova Midline Hold', sets: [{ reps: 5, weight_kg: 15 }] },
          { name: 'Nova Thruster', sets: [{ reps: 5, weight_kg: 80 }] },
          { name: 'Nova Yoke Pull', sets: [{ reps: 5, weight_kg: 40 }] },
          { name: 'Nova Metro Circuit', sets: [{ reps: 5, weight_kg: 25 }] }
        ]
      })
    ]),
    date: '2026-09-10',
    libraryByName: library
  });
  const best = Object.fromEntries(model.regions.map(r => [r.key, r.currentBestKg]));
  assert.deepEqual(best, {
    chest: 50,
    shoulders: 30,
    arms: 20,
    abs: 15,
    legs: 80,
    back: 40,
    full_body: 25
  });
  assert.equal(model.regions.find(r => r.key === 'shoulders').image, 'assets/fitness/regions/shoulders.png');
  assert.equal(model.regions.find(r => r.key === 'full_body').image, 'assets/fitness/regions/full_body.png');
  assert.equal(model.regions.find(r => r.key === 'full_body').label, 'Full Body');
});
test('resolveExerciseRegion uses unique workout focus, then name regex, without library', () => {
  assert.equal(resolveExerciseRegion({ name: 'Mystery Move' }, ['legs']), 'legs');
  assert.equal(resolveExerciseRegion({ name: 'Mystery Move' }, ['core']), 'abs');
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

test('bare press names do not map to chest (Leg Press stays legs; overhead/shoulder → shoulders)', () => {
  assert.equal(resolveExerciseRegion({ name: 'Leg Press' }), 'legs');
  assert.notEqual(resolveExerciseRegion({ name: 'Overhead Press' }), 'chest');
  assert.equal(resolveExerciseRegion({ name: 'Shoulder Press' }), 'shoulders');
  assert.equal(resolveExerciseRegion({ name: 'Bar Seated Overhead Press' }), 'shoulders');
});

test('exercise-level focus override still wins only when library has no target_area', () => {
  // Library target_area is authoritative when present.
  const library = new Map([
    ['bench press', { name: 'Bench Press', target_area: 'Chest' }]
  ]);
  assert.equal(
    resolveExerciseRegion({ name: 'Bench Press', focus: ['arms'] }, [], library),
    'chest'
  );
  assert.equal(resolveExerciseRegion({ name: 'Bench Press', focus: ['arms'] }), 'arms');
});

test('region strength uses library target_area so Bar Press feeds the chest tile', () => {
  // Repro: multi-focus sessions + Bar Press (name ≠ "chest") ignored library →
  // Wide Bench kept winning the tile. Library target_area: Chest must fix it.
  const library = new Map([
    ['bar press', { name: 'Bar Press', target_area: 'Chest' }],
    ['bar wide bench press', { name: 'Bar Wide Bench Press', target_area: 'Chest' }]
  ]);
  const model = buildFitnessModel({
    events: events([
      workout({
        date: '2026-07-30',
        focus: ['arms', 'chest', 'shoulders'],
        exercises: [
          { name: 'Bar Press', sets: [{ reps: 12, weight_kg: 42 }] },
          { name: 'Bar Wide Bench Press', sets: [{ reps: 12, weight_kg: 42 }] }
        ]
      }),
      workout({
        date: '2026-09-10',
        focus: ['arms', 'chest'],
        exercises: [
          { name: 'Bar Press', sets: [{ reps: 8, weight_kg: 44 }] },
          { name: 'Bar Wide Bench Press', sets: [{ reps: 12, weight_kg: 40 }] }
        ]
      })
    ]),
    date: '2026-09-10',
    libraryByName: library
  });
  const chest = model.regions.find(r => r.key === 'chest');
  assert.equal(chest.currentBestKg, 44);
  assert.equal(chest.bestSetDeltaKg, 2);
  assert.equal(chest.colour, 'green');

  const withoutLibrary = buildFitnessModel({
    events: events([
      workout({
        date: '2026-09-10',
        focus: ['arms', 'chest'],
        exercises: [
          { name: 'Bar Press', sets: [{ reps: 8, weight_kg: 44 }] },
          { name: 'Bar Wide Bench Press', sets: [{ reps: 12, weight_kg: 40 }] }
        ]
      })
    ]),
    date: '2026-09-10'
  });
  // Without library, only Wide Bench name-matches chest — proves target_area is load-bearing.
  assert.equal(withoutLibrary.regions.find(r => r.key === 'chest').currentBestKg, 40);
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

  assert.equal(model.regions.length, 7);
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

  assert.equal(model.regions.find(r => r.key === 'shoulders').label, 'Shoulders');
  assert.equal(model.regions.find(r => r.key === 'full_body').label, 'Full Body');
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

test('month averages and next planned session sit on the model', () => {
  const model = buildFitnessModel({
    events: events([
      workout({ date: '2026-07-30' }),
      workout({
        date: '2026-08-29',
        status: 'planned',
        title: 'Upper Body',
        exercises: [{ name: 'Bench Press', sets: [{ reps: 8, weight_kg: 36 }] }]
      })
    ]),
    date: '2026-07-30'
  });
  assert.equal(model.monthVolumeKg, 10 * 32 + 8 * 34 + 12 * 12);
  assert.equal(model.avgSessionVolumeKg, model.monthVolumeKg);
  assert.equal(model.avgDurationMin, 26);
  assert.equal(model.weekRemaining, 3);
  assert.equal(model.nextPlanned.title, 'Upper Body');
  assert.equal(model.nextPlanned.date, '2026-08-29');
  assert.equal(model.heroSession.volume, model.monthVolumeKg);
  assert.equal(model.charts.uniqueLifts, 2);
  assert.equal(model.charts.longestStreak, 1);
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
