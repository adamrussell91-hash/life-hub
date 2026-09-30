import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bestSetPerformance,
  describeSet,
  resolveCountsAs,
  resolveTrackingType
} from '../../apps/life/js/core/exercise-tracking.js';
import { validateLogEntry } from '../../netlify/functions/_shared/chat-schema.mjs';
import { appendSet, cloneLoggerDraft } from '../../apps/life/js/app/fitness-logger-draft.js';
import { formatExerciseSets } from '../../apps/life/js/app/format-exercise.js';
import {
  formatExerciseLibraryForPrompt,
  searchExerciseLibrary,
  validateExerciseLibraryBatch,
  validateExerciseLibraryEntry
} from '../../netlify/functions/_shared/exercise-library.mjs';
import { getExerciseProgress } from '../../netlify/functions/_shared/fitness-tools.mjs';
import { buildTemplateRecord } from '../../netlify/functions/_shared/workout-templates.mjs';

const NOW = '2026-09-30T08:00:00+10:00';

function workout(exercises, status = 'completed') {
  return {
    type: 'workout',
    date: '2026-09-30',
    fields: {
      title: 'Spidey Flow',
      session_kind: 'mobility',
      day_type: 'movement',
      status,
      exercises
    },
    notes: 'Spidey Flow — hips opened up'
  };
}

test('resolveTrackingType: explicit, then library, then set shape; old K1 sets stay weighted', () => {
  assert.equal(resolveTrackingType({ tracking: 'timed', sets: [] }), 'timed');
  assert.equal(resolveTrackingType({ sets: [{ reps: 10 }] }, { tracking_type: 'bodyweight_reps' }), 'bodyweight_reps');
  assert.equal(resolveTrackingType({ sets: [{ duration_sec: 45 }] }), 'timed');
  assert.equal(resolveTrackingType({ sets: [{ reps: 30, time_cap_sec: 60 }] }), 'reps_in_time');
  assert.equal(resolveTrackingType({ sets: [{ reps: 12, weight_kg: 0, cable_type: 'none' }] }), 'bodyweight_reps');
  assert.equal(resolveTrackingType({ sets: [{ reps: 10, weight_kg: 30, cable_type: 'constant_force' }] }), 'weighted');
  assert.equal(resolveTrackingType({ sets: [{ reps: 10, weight_kg: 30 }] }), 'weighted');
});

test('resolveCountsAs defaults from the tracking type unless the library says otherwise', () => {
  assert.equal(resolveCountsAs('timed'), 'mobility');
  assert.equal(resolveCountsAs('reps_in_time'), 'conditioning');
  assert.equal(resolveCountsAs('timed', { counts_as: 'strength' }), 'strength');
});

test('bestSetPerformance compares the right number per type', () => {
  assert.equal(bestSetPerformance([{ duration_sec: 30 }, { duration_sec: 50 }], 'timed').value, 50);
  assert.equal(bestSetPerformance([{ reps: 8 }, { reps: 12 }], 'bodyweight_reps').value, 12);
  assert.equal(bestSetPerformance([{ reps: 30, time_cap_sec: 60 }, { reps: 20, time_cap_sec: 30 }], 'reps_in_time', { timeCapSec: 30 }).value, 20);
  assert.equal(bestSetPerformance([{ reps: 10, weight_kg: 30 }, { reps: 6, weight_kg: 35 }], 'weighted').value, 35);
});

test('describeSet reads naturally and leaves weighted sets to the existing formatter', () => {
  assert.equal(describeSet({ duration_sec: 45 }, 'timed'), '45 s hold');
  assert.equal(describeSet({ reps: 30, time_cap_sec: 60 }, 'reps_in_time'), '30 reps in 60 s');
  assert.equal(describeSet({ time_cap_sec: 60 }, 'reps_in_time'), 'max reps in 60 s');
  assert.equal(describeSet({ reps: 12, weight_kg: 5 }, 'bodyweight_reps'), 'bodyweight +5 kg × 12 reps');
  assert.equal(describeSet({ reps: 10, weight_kg: 30 }, 'weighted'), null);
  assert.equal(
    formatExerciseSets({ tracking: 'timed', sets: [{ duration_sec: 60 }] }),
    'Set 1: 60 s hold'
  );
  assert.equal(
    formatExerciseSets({ sets: [{ reps: 10, weight_kg: 30, cable_type: 'constant_force' }] }),
    'Set 1: 30 kg × 10 reps · cable: constant force'
  );
});

test('log_entry accepts yoga holds, push-ups in a window and bodyweight reps without fake kg or cable', () => {
  const validation = validateLogEntry(workout([
    { name: 'Pigeon Pose', tracking: 'timed', sets: [{ duration_sec: 60 }, { duration_sec: 60 }] },
    { name: 'Push Up', tracking: 'reps_in_time', sets: [{ reps: 32, time_cap_sec: 60 }] },
    { name: 'Pull Up', tracking: 'bodyweight_reps', sets: [{ reps: 8 }] },
    { name: 'Bar Press', sets: [{ reps: 10, weight_kg: 30, cable_type: 'constant_force' }] }
  ]), { id: 'workout-test', now: NOW });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test('log_entry still demands kg and cable on K1 weighted sets, and seconds on timed sets', () => {
  const weighted = validateLogEntry(workout([{ name: 'Bar Press', sets: [{ reps: 10 }] }]), { id: 'w', now: NOW });
  assert.equal(weighted.valid, false);
  assert.ok(weighted.errors.some(error => /weight_kg is required/.test(error)));
  assert.ok(weighted.errors.some(error => /cable_type is required/.test(error)));

  const timed = validateLogEntry(workout([{ name: 'Plank', tracking: 'timed', sets: [{}] }]), { id: 'w', now: NOW });
  assert.equal(timed.valid, false);
  assert.ok(timed.errors.some(error => /duration_sec is required/.test(error)));

  const window = validateLogEntry(workout([{ name: 'Push Up', tracking: 'reps_in_time', sets: [{ reps: 30 }] }]), { id: 'w', now: NOW });
  assert.equal(window.valid, false);
  assert.ok(window.errors.some(error => /time_cap_sec is required/.test(error)));

  const badType = validateLogEntry(workout([{ name: 'Plank', tracking: 'vibes', sets: [{ duration_sec: 30 }] }]), { id: 'w', now: NOW });
  assert.equal(badType.valid, false);
});

test('a planned reps-in-time set may omit reps (max effort); completed must record them', () => {
  const planned = validateLogEntry(workout([{ name: 'Push Up', tracking: 'reps_in_time', sets: [{ time_cap_sec: 60 }] }], 'planned'), { id: 'w', now: NOW });
  assert.equal(planned.valid, true, JSON.stringify(planned.errors));
  const completed = validateLogEntry(workout([{ name: 'Push Up', tracking: 'reps_in_time', sets: [{ time_cap_sec: 60 }] }]), { id: 'w', now: NOW });
  assert.equal(completed.valid, false);
});

test('Fitness logger keeps holds and windows and never relabels bodyweight work as a cable mode', () => {
  const draft = cloneLoggerDraft({
    date: '2026-09-30',
    status: 'planned',
    exercises: [
      { name: 'Pigeon Pose', tracking: 'timed', sets: [{ duration_sec: 45 }] },
      { name: 'Push Up', tracking: 'reps_in_time', sets: [{ time_cap_sec: 60 }] },
      { name: 'Bar Press', sets: [{ reps: 10, weight_kg: 30, cable_type: 'none' }] }
    ]
  });
  const [pigeon, pushUp, press] = draft.exercises;
  assert.equal(pigeon.tracking, 'timed');
  assert.equal(pigeon.sets[0].duration_sec, 45);
  assert.equal(pigeon.sets[0].cable_type, 'none');
  assert.equal(pushUp.sets[0].time_cap_sec, 60);
  assert.equal(press.sets[0].cable_type, 'constant_force', 'loaded K1 work still normalises to a cable mode');

  const grown = appendSet(pigeon);
  assert.equal(grown.sets.length, 2);
  assert.equal(grown.sets[1].duration_sec, 45);
  assert.equal(grown.sets[1].cable_type, 'none');
});

test('templates keep tracking and hold times', () => {
  const template = buildTemplateRecord({
    title: 'Spidey Flow',
    exercises: [{ name: 'Pigeon Pose', tracking: 'timed', sets: [{ duration_sec: 60, weight_kg: 0, cable_type: 'none' }] }]
  }, '2026-09-30');
  assert.equal(template.exercises[0].tracking, 'timed');
  assert.equal(template.exercises[0].sets[0].duration_sec, 60);
});

test('Exercise Library stores what a learned move is and where it came from', () => {
  const entry = validateExerciseLibraryEntry({
    name: 'Spider-Man Push Up',
    target_area: 'chest',
    primary_muscles: ['chest', 'obliques'],
    secondary_muscles: 'triceps, hip flexors',
    difficulty: 'intermediate',
    tracking_type: 'bodyweight_reps',
    counts_as: 'bodyweight',
    progressions: ['Deficit Spider-Man Push Up'],
    regressions: ['Incline Spider-Man Push Up'],
    safety_notes: 'Knee-friendly: no impact.',
    aeke_translation: 'Stays bodyweight on the floor beside the K1; finish with K1 cable fly for load.',
    source_title: 'Tom Holland Spider-Man training breakdown',
    source_url: 'https://example.com/spidey',
    source_program: 'Tom Holland Spider-Man: Brand New Day',
    default_reps: 10
  });
  assert.deepEqual(entry.secondary_muscles, ['triceps', 'hip flexors']);
  assert.equal(entry.difficulty, 'intermediate');
  assert.equal(entry.tracking_type, 'bodyweight_reps');
  assert.equal(entry.source_program, 'Tom Holland Spider-Man: Brand New Day');
  assert.equal(validateExerciseLibraryEntry({ name: 'X', difficulty: 'godlike' }), null);
  assert.equal(validateExerciseLibraryEntry({ name: 'X', tracking_type: 'vibes' }), null);
});

test('validateExerciseLibraryBatch saves a researched program in one call and stamps learned_on', () => {
  const { entries, rejected } = validateExerciseLibraryBatch({
    entries: [
      { name: 'Pigeon Pose', tracking_type: 'timed', source_program: 'Spidey' },
      { name: 'Bar Press', in_rotation: true },
      { name: 'Broken', difficulty: 'godlike' }
    ]
  }, { today: '2026-09-30', existing: [{ name: 'Bar Press' }] });
  assert.equal(entries.length, 2);
  assert.deepEqual(rejected, ['Broken']);
  assert.equal(entries[0].learned_on, '2026-09-30');
  assert.equal(entries[1].learned_on, undefined, 'plain updates to existing moves are not "learned"');

  const single = validateExerciseLibraryBatch({ name: 'Plank', shelved_until: '2026-10-20' }, { today: '2026-09-30' });
  assert.equal(single.entries[0].shelved_on, '2026-09-30');
});

test('library search finds moves by muscle, program and tracking type', () => {
  const library = [
    { name: 'Pigeon Pose', target_area: 'mobility', primary_muscles: ['glutes', 'hip flexors'], tracking_type: 'timed', source_program: 'Spidey' },
    { name: 'Bar Press', target_area: 'chest', primary_muscles: ['chest'] }
  ];
  assert.deepEqual(searchExerciseLibrary(library, { query: 'hip flexors' }).map(e => e.name), ['Pigeon Pose']);
  assert.deepEqual(searchExerciseLibrary(library, { query: 'spidey' }).map(e => e.name), ['Pigeon Pose']);
  assert.deepEqual(searchExerciseLibrary(library, { query: '', tracking_type: 'timed' }).map(e => e.name), ['Pigeon Pose']);
  assert.deepEqual(searchExerciseLibrary(library, { query: '' }), []);
});

test('library prompt lines show tracking, difficulty, bests and source for learned moves', () => {
  const text = formatExerciseLibraryForPrompt([
    { name: 'Pigeon Pose', target_area: 'mobility', primary_muscles: ['glutes'], tracking_type: 'timed', difficulty: 'beginner', best_duration_sec: 60, source_program: 'Spidey' }
  ], '2026-09-30');
  assert.match(text, /Pigeon Pose — mobility · glutes · timed · beginner/);
  assert.match(text, /best hold 60 s/);
  assert.match(text, /from Spidey/);
});

test('get_exercise_progress measures holds by seconds and push-ups by reps in the same window', () => {
  const records = [
    { type: 'workout', status: 'completed', date: '2026-09-01', exercises: [{ name: 'Pigeon Pose', tracking: 'timed', sets: [{ duration_sec: 30 }] }] },
    { type: 'workout', status: 'completed', date: '2026-09-10', exercises: [{ name: 'Pigeon Pose', tracking: 'timed', sets: [{ duration_sec: 45 }, { duration_sec: 40 }] }] },
    { type: 'workout', status: 'completed', date: '2026-09-20', exercises: [{ name: 'Push Up', sets: [{ reps: 20, time_cap_sec: 30 }] }] },
    { type: 'workout', status: 'completed', date: '2026-09-22', exercises: [{ name: 'Push Up', sets: [{ reps: 25, time_cap_sec: 60 }] }] },
    { type: 'workout', status: 'completed', date: '2026-09-28', exercises: [{ name: 'Push Up', sets: [{ reps: 31, time_cap_sec: 60 }] }] }
  ];
  const hold = getExerciseProgress(records, '2026-09-30', { query: 'pigeon' });
  assert.equal(hold.tracking_type, 'timed');
  assert.equal(hold.unit, 'sec');
  assert.equal(hold.first.value, 30);
  assert.equal(hold.latest.value, 45);
  assert.equal(hold.latest.total, 85);
  assert.equal(hold.change, 15);
  assert.equal(hold.trend, 'up');

  const pushUps = getExerciseProgress(records, '2026-09-30', { query: 'push up' });
  assert.equal(pushUps.tracking_type, 'reps_in_time');
  assert.equal(pushUps.time_cap_sec, 60);
  assert.equal(pushUps.sessions, 2, 'the 30 s test is excluded from the 60 s trend');
  assert.equal(pushUps.change, 6);

  const missing = getExerciseProgress(records, '2026-09-30', { query: 'dragon flag' });
  assert.equal(missing.found, false);
});
