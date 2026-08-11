import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXERCISE_LIBRARY_PATH,
  parseExerciseLibrary,
  validateExerciseLibraryEntry,
  upsertExerciseLibraryEntry,
  searchExerciseLibrary,
  selectExerciseHighlights,
  formatExerciseLibraryForPrompt,
  exerciseLibraryEntryFromCsvRow,
  searchExerciseLibrarySchema,
  saveExerciseLibraryEntrySchema,
  applyCompletedWorkoutToLibrary
} from '../../netlify/functions/_shared/exercise-library.mjs';

test('EXERCISE_LIBRARY_PATH is the canonical chat-direct blob', () => {
  assert.equal(EXERCISE_LIBRARY_PATH, 'data/exercise-library.json');
});

test('parseExerciseLibrary tolerates bad JSON and non-arrays', () => {
  assert.deepEqual(parseExerciseLibrary(null), []);
  assert.deepEqual(parseExerciseLibrary('{'), []);
  assert.deepEqual(parseExerciseLibrary('{}'), []);
  assert.deepEqual(parseExerciseLibrary('[{"name":"Bar Press","target_area":"Chest"}]').length, 1);
});

test('validateExerciseLibraryEntry requires name and target_area', () => {
  assert.equal(validateExerciseLibraryEntry({ name: 'X' }), null);
  const ok = validateExerciseLibraryEntry({
    name: ' Bar Press ',
    target_area: 'Chest',
    equipment: 'Crossbar, Fitness Bench',
    focus_areas: ['Mid Chest', 'Front Delts'],
    setup_cues: 'Flat bench.',
    in_rotation: true,
    working_weight_kg: 42,
    default_cable_type: 'concentric',
    default_bench_angle_deg: 0,
    attachment: 'bar',
    last_performed: '2026-07-29'
  });
  assert.equal(ok.name, 'Bar Press');
  assert.deepEqual(ok.equipment, ['Crossbar', 'Fitness Bench']);
  assert.equal(ok.in_rotation, true);
  assert.equal(ok.default_cable_type, 'concentric');
  assert.equal(validateExerciseLibraryEntry({
    name: 'X', target_area: 'Chest', default_cable_type: 'nope'
  }), null);
});

test('upsertExerciseLibraryEntry replaces by case-insensitive name', () => {
  const first = upsertExerciseLibraryEntry([], {
    name: 'Bar Press', target_area: 'Chest'
  }, '2026-08-05T00:00:00+10:00');
  assert.equal(first[0].updated_at, '2026-08-05T00:00:00+10:00');
  const second = upsertExerciseLibraryEntry(first, {
    name: 'bar press', target_area: 'Chest', working_weight_kg: 44
  }, '2026-08-06T00:00:00+10:00');
  assert.equal(second.length, 1);
  assert.equal(second[0].working_weight_kg, 44);
});

test('selectExerciseHighlights prefers in_rotation then last_performed', () => {
  const entries = [
    { name: 'A', target_area: 'Chest', in_rotation: false, last_performed: '2026-07-01' },
    { name: 'B', target_area: 'Legs', in_rotation: true, last_performed: '2026-06-01' },
    { name: 'C', target_area: 'Back', in_rotation: false, last_performed: '2026-07-20' },
    { name: 'D', target_area: 'Arms', in_rotation: false }
  ];
  const highlights = selectExerciseHighlights(entries, 3);
  assert.deepEqual(highlights.map(e => e.name), ['B', 'C', 'A']);
});

test('searchExerciseLibrary ANDs query tokens across fields', () => {
  const entries = [
    { name: 'Bar Press', target_area: 'Chest', equipment: ['Crossbar'], focus_areas: ['Mid Chest'], setup_cues: 'Flat zero degrees', in_rotation: false },
    { name: 'Bar Curl', target_area: 'Arms', equipment: ['Crossbar'], focus_areas: ['Biceps'], in_rotation: true }
  ];
  assert.equal(searchExerciseLibrary(entries, { query: 'bar chest' }).length, 1);
  assert.equal(searchExerciseLibrary(entries, { query: 'bar', in_rotation: true })[0].name, 'Bar Curl');
  assert.equal(searchExerciseLibrary(entries, { query: 'bar', target_area: 'Arms' })[0].name, 'Bar Curl');
  assert.equal(searchExerciseLibrary(entries, { query: 'bar', limit: 1 }).length, 1);
});

test('formatExerciseLibraryForPrompt is compact and omits empty libraries', () => {
  assert.equal(formatExerciseLibraryForPrompt([]), '');
  const text = formatExerciseLibraryForPrompt([
    { name: 'Bar Press', target_area: 'Chest', equipment: ['Crossbar'], working_weight_kg: 42, in_rotation: true }
  ]);
  assert.match(text, /Bar Press/);
  assert.match(text, /Chest/);
  assert.match(text, /42/);
  assert.doesNotMatch(text, /Flat zero/);
});

test('formatExerciseLibraryForPrompt surfaces last_performed and best_weight_kg so Chadwick knows last session\'s actuals', () => {
  const text = formatExerciseLibraryForPrompt([
    {
      name: 'Bar Press',
      target_area: 'Chest',
      working_weight_kg: 42,
      best_weight_kg: 44,
      last_performed: '2026-07-29',
      times_performed: 6,
      in_rotation: true
    }
  ]);
  assert.match(text, /last 29 Jul/);
  assert.match(text, /PB 44/);
  assert.match(text, /6x logged/);
});

test('formatExerciseLibraryForPrompt omits progress bits an entry has never had', () => {
  const text = formatExerciseLibraryForPrompt([
    { name: 'Brand New Move', target_area: 'Back' }
  ]);
  assert.doesNotMatch(text, /last /);
  assert.doesNotMatch(text, /PB/);
  assert.doesNotMatch(text, /logged/);
});

test('exerciseLibraryEntryFromCsvRow maps Notion columns', () => {
  const entry = exerciseLibraryEntryFromCsvRow({
    Exercise: 'Bar Press',
    'Target area': 'Chest',
    Equipment: 'Crossbar, Fitness Bench',
    'Focus areas': 'Mid Chest, Front Delts',
    'Setup & cues': 'Flat bench.',
    'In rotation': 'Yes',
    'Best weight kg': '42',
    'Current working weight kg': '40',
    'Default reps': '8',
    'Default sets': '2',
    'Last performed': '29 Jul 2026',
    'Movement pattern': '',
    'Demo link': ''
  });
  assert.equal(entry.name, 'Bar Press');
  assert.equal(entry.in_rotation, true);
  assert.equal(entry.last_performed, '2026-07-29');
  assert.deepEqual(entry.equipment, ['Crossbar', 'Fitness Bench']);
  assert.equal(entry.best_weight_kg, 42);
});

test('tool schemas expose the expected names', () => {
  assert.equal(searchExerciseLibrarySchema().name, 'search_exercise_library');
  assert.equal(saveExerciseLibraryEntrySchema().name, 'save_exercise_library_entry');
});

function workoutRecord(exercises, date = '2026-08-05') {
  return { type: 'workout', status: 'completed', date, exercises };
}

test('applyCompletedWorkoutToLibrary records a new best and flags the PB', () => {
  const library = [{ name: 'Bar Press', target_area: 'Chest', best_weight_kg: 40, times_performed: 3 }];
  const record = workoutRecord([{ name: 'Bar Press', sets: [
    { reps: 8, weight_kg: 38, cable_type: 'concentric' },
    { reps: 6, weight_kg: 42, cable_type: 'concentric' }
  ] }]);

  const { entries, pbs } = applyCompletedWorkoutToLibrary(library, record, '2026-08-05T18:00:00+10:00');

  assert.equal(entries[0].best_weight_kg, 42);
  assert.equal(entries[0].working_weight_kg, 42);
  assert.equal(entries[0].times_performed, 4);
  assert.equal(entries[0].last_performed, '2026-08-05');
  assert.equal(entries[0].updated_at, '2026-08-05T18:00:00+10:00');
  assert.deepEqual(pbs, [{ name: 'Bar Press', best_weight_kg: 42, previous_best_weight_kg: 40 }]);
});

test('applyCompletedWorkoutToLibrary does not flag a tied best as a new PB', () => {
  const library = [{ name: 'Bar Press', target_area: 'Chest', best_weight_kg: 40, times_performed: 1 }];
  const record = workoutRecord([{ name: 'Bar Press', sets: [{ reps: 8, weight_kg: 40, cable_type: 'concentric' }] }]);

  const { entries, pbs } = applyCompletedWorkoutToLibrary(library, record, '2026-08-05T18:00:00+10:00');

  assert.equal(entries[0].best_weight_kg, 40);
  assert.equal(entries[0].times_performed, 2);
  assert.deepEqual(pbs, []);
});

test('applyCompletedWorkoutToLibrary sets an initial best on first-ever performance without flagging a PB', () => {
  const library = [{ name: 'Bar Press', target_area: 'Chest' }];
  const record = workoutRecord([{ name: 'Bar Press', sets: [{ reps: 8, weight_kg: 30, cable_type: 'concentric' }] }]);

  const { entries, pbs } = applyCompletedWorkoutToLibrary(library, record, '2026-08-05T18:00:00+10:00');

  assert.equal(entries[0].best_weight_kg, 30);
  assert.equal(entries[0].times_performed, 1);
  assert.deepEqual(pbs, []);
});

test('applyCompletedWorkoutToLibrary handles bodyweight-only sets (weight_kg 0) without crashing or false PBs', () => {
  const library = [{ name: 'Pull Up', target_area: 'Back', best_weight_kg: 0, times_performed: 5 }];
  const record = workoutRecord([{ name: 'Pull Up', sets: [{ reps: 10, weight_kg: 0, cable_type: 'none' }] }]);

  const { entries, pbs } = applyCompletedWorkoutToLibrary(library, record, '2026-08-05T18:00:00+10:00');

  assert.equal(entries[0].best_weight_kg, 0);
  assert.equal(entries[0].working_weight_kg, 0);
  assert.equal(entries[0].times_performed, 6);
  assert.deepEqual(pbs, []);
});

test('applyCompletedWorkoutToLibrary matches case/whitespace variants without creating duplicate rows', () => {
  const library = [{ name: 'Bar Press', target_area: 'Chest', best_weight_kg: 40 }];
  const record = workoutRecord([{ name: ' bar press ', sets: [{ reps: 8, weight_kg: 41, cable_type: 'concentric' }] }]);

  const { entries } = applyCompletedWorkoutToLibrary(library, record, '2026-08-05T18:00:00+10:00');

  assert.equal(entries.length, 1);
  assert.equal(entries[0].best_weight_kg, 41);
});

test('applyCompletedWorkoutToLibrary leaves an exercise with no library match untouched', () => {
  const library = [{ name: 'Bar Press', target_area: 'Chest', best_weight_kg: 40 }];
  const record = workoutRecord([{ name: 'Brand New Move', sets: [{ reps: 8, weight_kg: 20, cable_type: 'concentric' }] }]);

  const { entries, pbs } = applyCompletedWorkoutToLibrary(library, record, '2026-08-05T18:00:00+10:00');

  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, 'Bar Press');
  assert.deepEqual(pbs, []);
});

test('applyCompletedWorkoutToLibrary tolerates a record with no exercises', () => {
  const library = [{ name: 'Bar Press', target_area: 'Chest', best_weight_kg: 40 }];
  const { entries, pbs } = applyCompletedWorkoutToLibrary(library, { type: 'workout', status: 'completed' }, 'x');
  assert.deepEqual(entries, library);
  assert.deepEqual(pbs, []);
});
