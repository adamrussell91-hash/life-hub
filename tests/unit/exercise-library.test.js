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
  saveExerciseLibraryEntrySchema
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
