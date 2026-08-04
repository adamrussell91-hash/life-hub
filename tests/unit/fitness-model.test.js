import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFitnessModel,
  estimateOneRepMax,
  sessionVolume,
  normalizeExerciseName
} from '../../js/app/fitness-model.js';

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
