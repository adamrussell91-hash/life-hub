import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { parseCanonicalPath, parseEventDocument } from '../../js/core/records.js';
import { validateRecord } from '../../js/core/validate.js';
import * as recordValidation from '../../js/core/validate.js';

const valid = `---
schema_version: 1
id: meal-1
type: meal
date: 2026-07-30
time: "07:45"
created_at: 2026-07-30T07:45:00+10:00
updated_at: 2026-07-30T07:45:00+10:00
source: test_fixture
meal: breakfast
calories: 520
protein_g: 38
fat_g: 12
polyphenol_score: 6
---
Protein smoothie.`;

const common = {
  schema_version: 1,
  id: 'event-1',
  date: '2026-07-30',
  time: '07:45',
  created_at: '2026-07-30T07:45:00+10:00',
  updated_at: '2026-07-30T07:45:00+10:00',
  source: 'test_fixture'
};

test('parses a canonical meal and body', () => {
  const event = parseEventDocument(valid, 'data/nutrition/2026/07/2026-07-30-breakfast.md', load);
  assert.equal(event.record.id, 'meal-1');
  assert.equal(event.record.date, '2026-07-30');
  assert.equal(event.body, 'Protein smoothie.');
  assert.equal(event.legacy, false);
});

test('marks missing historical common metadata as legacy without inventing values', () => {
  const event = parseEventDocument(
    '---\ntype: weight\ndate: 2020-01-02\nweight_kg: 90\n---',
    'data/body/weight/2020/01/2020-01-02-weight.md',
    load
  );
  assert.equal(event.legacy, true);
  assert.equal(event.record.weight_kg, 90);
  assert.equal(Object.hasOwn(event.record, 'schema_version'), false);
  assert.equal(Object.hasOwn(event.record, 'id'), false);
  assert.equal(Object.hasOwn(event.record, 'source'), false);
});

test('rejects schema-versioned records missing common metadata instead of treating them as legacy', () => {
  assert.throws(
    () => parseEventDocument(
      valid.replace('id: meal-1\n', ''),
      'data/nutrition/2026/07/2026-07-30-breakfast.md',
      load
    ),
    /id is required/
  );
});

test('rejects negative nutrition and path/date disagreement', () => {
  assert.throws(
    () => parseEventDocument(
      valid.replace('calories: 520', 'calories: -1'),
      'data/nutrition/2026/07/2026-07-31-breakfast.md',
      load
    ),
    /calories.*date|date.*calories/
  );
});

test('canonical paths require matching directories and semantic calendar dates', () => {
  assert.deepEqual(parseCanonicalPath('data/body/composition/2024/02/2024-02-29-aeke.md'), {
    domain: 'body/composition', year: '2024', month: '02', date: '2024-02-29'
  });
  assert.throws(
    () => parseCanonicalPath('data/nutrition/2026/02/2026-02-30-breakfast.md'),
    /calendar date/
  );
  assert.throws(
    () => parseCanonicalPath('data/nutrition/2025/07/2026-07-30-breakfast.md'),
    /directories/
  );
});

test('requires frontmatter and matching record type for the canonical domain', () => {
  assert.throws(
    () => parseEventDocument('not frontmatter', 'data/nutrition/2026/07/2026-07-30-meal.md', load),
    /Missing YAML frontmatter/
  );
  assert.throws(
    () => parseEventDocument(
      valid.replace('type: meal', 'type: workout'),
      'data/nutrition/2026/07/2026-07-30-breakfast.md',
      load
    ),
    /does not match path domain/
  );
});

test('validates common metadata for non-legacy records', () => {
  const base = { ...common, type: 'weight', weight_kg: 86.3 };
  assert.deepEqual(validateRecord(base), []);

  for (const [field, value] of [
    ['schema_version', 2],
    ['id', ''],
    ['date', '2026-02-30'],
    ['time', '24:00'],
    ['created_at', '2026-07-30T07:45:00Z'],
    ['updated_at', 'not-a-timestamp'],
    ['source', '']
  ]) {
    const errors = validateRecord({ ...base, [field]: value });
    assert.match(errors.join('; '), new RegExp(field));
  }
});

test('accepts every canonical domain record and nullable observations', () => {
  const records = [
    {
      ...common, type: 'meal', meal: 'dinner', calories: 0, protein_g: 0, fat_g: 0,
      saturated_fat_g: 0, unsaturated_fat_g: 0, carbs_g: 0, sugar_g: 0,
      fibre_g: 0, sodium_mg: 0, calcium_mg: 0, polyphenol_score: 10, omega3: 'none'
    },
    {
      ...common, type: 'workout', title: 'Restorative session', focus: ['mobility'],
      duration_min: 0, day_type: 'movement', status: 'planned', recovery_flag_next_day: false,
      exercises: [{ name: 'Mobility', equipment: 'mat', sets: [{ reps: 0, weight_kg: 0 }] }],
      pain_flags: []
    },
    {
      ...common, type: 'diary', mood_score: null, mood: null, energy: null,
      tags: [], highlights: '', challenges: '', dayone_sent: false
    },
    { ...common, type: 'weight', weight_kg: null },
    {
      ...common, type: 'composition', weight_kg: null, body_fat_pct: null,
      skeletal_muscle_kg: null, visceral_fat_level: null, body_age: null
    },
    { ...common, type: 'measurements', chest: null, waist: 0, shoulders: 121 },
    {
      ...common, type: 'sleep', bed_time: '23:10', wake_time: '06:40',
      duration_h: null, quality: null
    },
    { ...common, type: 'heart', resting_hr: null, avg_hr: 0 },
    {
      ...common, type: 'skincare', routine: 'pm', completed: true,
      products: ['cleanser'], skin_note: null
    },
    { ...common, type: 'fragrance', fragrance: 'Aether', occasion: null }
  ];

  for (const record of records) {
    assert.deepEqual(validateRecord(record), [], `${record.type} should be valid`);
  }
});

test('rejects unknown types and invalid enumerations', () => {
  assert.match(validateRecord({ ...common, type: 'medical' }).join('; '), /Unknown record type/);

  const invalid = [
    [{ ...common, type: 'meal', meal: 'brunch', calories: 1, protein_g: 1, fat_g: 1 }, 'meal'],
    [{ ...common, type: 'diary', mood: 'fine', energy: 'wired' }, 'mood|energy'],
    [{ ...common, type: 'workout', day_type: 'hard', status: 'done', exercises: [] }, 'day_type|status'],
    [{ ...common, type: 'skincare', routine: 'midday', completed: true, products: [] }, 'routine']
  ];

  for (const [record, pattern] of invalid) {
    assert.match(validateRecord(record).join('; '), new RegExp(pattern));
  }
});

test('reports every duplicate non-empty ID deterministically across records and parsed events', () => {
  const errors = recordValidation.validateUniqueIds?.([
    { id: 'zeta' },
    { record: { id: 'alpha' } },
    { id: '' },
    { record: { id: 'zeta' } },
    { id: 'alpha' },
    { record: { id: 'zeta' } },
    { id: null }
  ]);

  assert.deepEqual(errors, [
    'duplicate id "alpha" appears 2 times',
    'duplicate id "zeta" appears 3 times'
  ]);
});

test('rejects non-finite and negative domain numbers', () => {
  const invalid = [
    [{ ...common, type: 'meal', meal: 'snack', calories: Number.NaN, protein_g: 1, fat_g: 1 }, 'calories'],
    [{ ...common, type: 'weight', weight_kg: -1 }, 'weight_kg'],
    [{ ...common, type: 'composition', body_fat_pct: Number.POSITIVE_INFINITY }, 'body_fat_pct'],
    [{ ...common, type: 'measurements', waist: -1 }, 'waist'],
    [{ ...common, type: 'sleep', duration_h: -1 }, 'duration_h'],
    [{ ...common, type: 'heart', resting_hr: -1 }, 'resting_hr'],
    [{ ...common, type: 'diary', mood_score: 11 }, 'mood_score']
  ];

  for (const [record, field] of invalid) {
    assert.match(validateRecord(record).join('; '), new RegExp(field));
  }
});

test('validates nested workout exercises, sets, reps, and weights', () => {
  const workout = {
    ...common,
    type: 'workout',
    title: 'Chest and Curls',
    duration_min: 26,
    day_type: 'workout_30',
    status: 'completed',
    recovery_flag_next_day: false,
    exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32 }] }]
  };
  assert.deepEqual(validateRecord(workout), []);

  for (const exercises of [
    'not-an-array',
    [{}],
    [{ name: 'Chest Press', sets: 'not-an-array' }],
    [{ name: 'Chest Press', sets: [{}] }],
    [{ name: 'Chest Press', sets: [{ reps: -1, weight_kg: 32 }] }],
    [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: Number.NaN }] }]
  ]) {
    assert.notDeepEqual(validateRecord({ ...workout, exercises }), []);
  }
});
