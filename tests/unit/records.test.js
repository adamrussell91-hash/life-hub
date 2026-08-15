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
    'data/body/2020/01/2020-01-02-weight.md',
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
  assert.deepEqual(parseCanonicalPath('data/body/2024/02/2024-02-29-aeke.md'), {
    domain: 'body', year: '2024', month: '02', date: '2024-02-29'
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
  assert.deepEqual(validateRecord({
    ...base,
    date: '2024-02-29',
    created_at: '2024-02-29T07:45:00+11:00',
    updated_at: '2024-02-29T07:45:00+11:00'
  }), []);

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

test('accepts both actual Sydney offsets during the autumn repeated hour', () => {
  const base = {
    ...common,
    type: 'weight',
    date: '2026-04-05',
    time: '02:30',
    weight_kg: 86.3
  };
  assert.deepEqual(validateRecord({
    ...base,
    created_at: '2026-04-05T02:30:00+11:00',
    updated_at: '2026-04-05T02:30:00+10:00'
  }), []);
  assert.match(validateRecord({
    ...base,
    created_at: '2026-04-05T03:30:00+11:00',
    updated_at: '2026-04-05T03:30:00+11:00'
  }).join('; '), /created_at|updated_at/);
});

test('accepts every canonical domain record and nullable observations', () => {
  const records = [
    {
      ...common, type: 'meal', meal: 'dinner', calories: 0, protein_g: 0, fat_g: 0,
      saturated_fat_g: 0, unsaturated_fat_g: 0, carbs_g: 0, sugar_g: 0,
      fibre_g: 0, sodium_mg: 0, calcium_mg: 0, polyphenol_score: 10, omega3: 'none'
    },
    {
      ...common, type: 'workout', title: 'Restorative session', session_kind: 'mobility', focus: ['mobility'],
      duration_min: 0, day_type: 'movement', status: 'planned', recovery_flag_next_day: false,
      exercises: [{ name: 'Mobility', equipment: 'mat', sets: [{ reps: 0, weight_kg: 0, cable_type: 'none' }] }],
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
    { ...common, type: 'fragrance', fragrance: 'Aether', occasion: null },
    { ...common, type: 'bloods', markers: [] }
  ];

  for (const record of records) {
    assert.deepEqual(validateRecord(record), [], `${record.type} should be valid`);
  }
});

test('accepts bloods records with a markers array', () => {
  const record = {
    ...common,
    type: 'bloods',
    markers: [
      {
        key: 'alt',
        label: 'ALT',
        category: 'Liver Function',
        value: 42,
        unit: 'U/L',
        ref_low: null,
        ref_high: 40,
        status: 'High'
      },
      {
        key: 'hepb_sag',
        label: 'HepB sAg',
        category: 'Liver Function',
        value: null,
        unit: 'Qualitative',
        ref_low: null,
        ref_high: null,
        status: null
      }
    ]
  };
  assert.deepEqual(validateRecord(record), []);
});

test('rejects bloods records with a non-array markers field', () => {
  assert.match(
    validateRecord({ ...common, type: 'bloods', markers: 'nope' }).join('; '),
    /markers/
  );
});

test('parses a canonical bloods event path', () => {
  const text = `---
schema_version: 1
id: "notion-bloods-2026-05-19"
type: "bloods"
date: "2026-05-19"
time: "12:00"
created_at: "2026-05-19T12:00:00+10:00"
updated_at: "2026-05-19T12:00:00+10:00"
source: "notion_import"
markers: [{"key":"alt","label":"ALT","category":"Liver Function","value":42,"unit":"U/L","ref_low":null,"ref_high":40,"status":"High"}]
---
`;
  const event = parseEventDocument(text, 'data/body/2026/05/2026-05-19-bloods.md', load);
  assert.equal(event.record.type, 'bloods');
  assert.equal(event.record.markers[0].key, 'alt');
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

const CABLE_TYPES = ['constant_force', 'concentric', 'eccentric', 'elastic', 'rowing', 'none'];
const SESSION_KINDS = ['strength', 'walk', 'ep', 'mobility', 'other'];

test('completed strength workouts require session_kind, title, and per-set cable_type', () => {
  const base = {
    ...common,
    type: 'workout',
    title: 'Chest and Curls',
    session_kind: 'strength',
    day_type: 'workout_30',
    status: 'completed',
    recovery_flag_next_day: false,
    exercises: [{
      name: 'Bar Press',
      bench_angle_deg: 0,
      sets: [{ reps: 12, weight_kg: 42, cable_type: 'concentric' }]
    }]
  };
  assert.deepEqual(validateRecord(base), []);

  assert.match(validateRecord({ ...base, title: '' }).join('; '), /title/);
  assert.match(validateRecord({ ...base, session_kind: 'nope' }).join('; '), /session_kind/);
  assert.match(validateRecord({
    ...base,
    exercises: [{ name: 'Bar Press', sets: [{ reps: 12, weight_kg: 42 }] }]
  }).join('; '), /cable_type/);
});

test('completed walk workouts may omit exercises when duration or distance is present', () => {
  const walk = {
    ...common,
    type: 'workout',
    title: 'East Ryde Stroll',
    session_kind: 'walk',
    day_type: 'movement',
    status: 'completed',
    duration_min: 40,
    distance_km: 3.2,
    avg_hr: 118,
    calories_kcal: 180,
    recovery_flag_next_day: false,
    exercises: []
  };
  assert.deepEqual(validateRecord(walk), []);
});

test('validates nested workout exercises, sets, reps, and weights', () => {
  const workout = {
    ...common,
    type: 'workout',
    title: 'Chest and Curls',
    session_kind: 'strength',
    duration_min: 26,
    day_type: 'workout_30',
    status: 'completed',
    recovery_flag_next_day: false,
    exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] }]
  };
  assert.deepEqual(validateRecord(workout), []);

  for (const exercises of [
    'not-an-array',
    [{}],
    [{ name: 'Chest Press', sets: 'not-an-array' }],
    [{ name: 'Chest Press', sets: [{}] }],
    [{ name: 'Chest Press', sets: [{ reps: -1, weight_kg: 32, cable_type: 'concentric' }] }],
    [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: Number.NaN, cable_type: 'concentric' }] }]
  ]) {
    assert.notDeepEqual(validateRecord({ ...workout, exercises }), []);
  }
});

test('accepts optional per-exercise coach_cues (start/rest/final_set) on a planned session', () => {
  const planned = {
    ...common,
    type: 'workout',
    title: 'Chest and Curls',
    session_kind: 'strength',
    day_type: 'workout_30',
    status: 'planned',
    recovery_flag_next_day: false,
    exercises: [{
      name: 'Chest Press',
      coach_cues: {
        start: "Let's get that chest pumped, big guy.",
        rest: 'Shake it out, breathe, next set is coming.',
        final_set: '1-2 reps in the tank, this is the one that counts.'
      },
      sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }]
    }]
  };
  assert.deepEqual(validateRecord(planned), []);
});

test('a planned exercise with no coach_cues is still valid (the field is optional)', () => {
  const planned = {
    ...common,
    type: 'workout',
    title: 'Chest and Curls',
    session_kind: 'strength',
    day_type: 'workout_30',
    status: 'planned',
    recovery_flag_next_day: false,
    exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] }]
  };
  assert.deepEqual(validateRecord(planned), []);
});

test('rejects coach_cues that is not an object, or whose sub-fields are not strings', () => {
  const base = {
    ...common,
    type: 'workout',
    title: 'Chest and Curls',
    session_kind: 'strength',
    day_type: 'workout_30',
    status: 'planned',
    recovery_flag_next_day: false
  };
  for (const coach_cues of ['not-an-object', 42, ['array'], { start: 42 }, { final_set: false }]) {
    const exercises = [{ name: 'Chest Press', coach_cues, sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] }];
    assert.notEqual(validateRecord({ ...base, exercises }).length, 0, JSON.stringify(coach_cues));
  }
});

test('validateMindSession requires at least one of title, theme, themes, insight, closing_question', () => {
  const base = {
    schema_version: 1, id: 'ms-1', type: 'mind_session', date: '2026-08-13',
    time: '17:00',
    created_at: '2026-08-13T17:00:00+10:00', updated_at: '2026-08-13T17:00:00+10:00',
    source: 'chat'
  };
  assert.ok(validateRecord({ ...base, theme: 'Weekend permission' }).length === 0);
  assert.ok(validateRecord({ ...base, themes: ['x'] }).length === 0);
  assert.ok(validateRecord({ ...base }).some(e => /title|theme|themes|insight|closing_question/.test(e)));
  assert.ok(validateRecord({ ...base, theme: 'x', mood_at_open: 'wired' }).some(e => /mood_at_open/.test(e)));
});

test('diary source_agent is penelope, import, or omitted', () => {
  const diary = {
    schema_version: 1, id: 'd-1', type: 'diary', date: '2026-08-13',
    time: '21:00',
    created_at: '2026-08-13T21:00:00+10:00', updated_at: '2026-08-13T21:00:00+10:00',
    source: 'chat', mood_score: 6, mood: 'low', energy: 'medium', tags: [], dayone_sent: false
  };
  assert.equal(validateRecord(diary).length, 0);
  assert.equal(validateRecord({ ...diary, source_agent: 'penelope' }).length, 0);
  assert.equal(validateRecord({ ...diary, source_agent: 'import' }).length, 0);
  assert.ok(validateRecord({ ...diary, source_agent: 'vera' }).some(e => /source_agent/.test(e)));
});

test('mind_session accepts title, themes, pattern_tags, session_type, and title-only core', () => {
  const base = {
    schema_version: 1, id: 'ms-1', type: 'mind_session', date: '2026-08-13',
    time: '17:00',
    created_at: '2026-08-13T17:00:00+10:00', updated_at: '2026-08-13T17:00:00+10:00',
    source: 'chat'
  };
  assert.equal(validateRecord({ ...base, title: 'The Filter' }).length, 0);
  assert.equal(validateRecord({
    ...base,
    themes: ['ADHD Reality', 'Self-Compassion'],
    pattern_tags: ['shame-loop'],
    session_type: 'deep-dive',
    framework: 'Compassion-Focused',
    observation: 'The filter activated.',
    source_agent: 'vera'
  }).length, 0);
  assert.ok(validateRecord({ ...base, session_type: 'workshop' }).some(e => /session_type/.test(e)));
  assert.ok(validateRecord({ ...base, source_agent: 'penelope' }).some(e => /source_agent/.test(e)));
  assert.ok(validateRecord({ ...base, themes: 'ADHD' }).some(e => /themes/.test(e)));
});

test('diary moods is 1–3 MOODS and must include primary mood', () => {
  const diary = {
    schema_version: 1, id: 'd-1', type: 'diary', date: '2026-08-13',
    time: '21:00',
    created_at: '2026-08-13T21:00:00+10:00', updated_at: '2026-08-13T21:00:00+10:00',
    source: 'chat', mood_score: 6, mood: 'low', energy: 'medium', tags: [], dayone_sent: false
  };
  assert.equal(validateRecord(diary).length, 0);
  assert.equal(validateRecord({ ...diary, moods: ['low', 'good'] }).length, 0);
  assert.ok(validateRecord({ ...diary, moods: [] }).some(e => /moods/.test(e)));
  assert.ok(validateRecord({ ...diary, moods: ['low', 'good', 'neutral', 'bad'] }).some(e => /moods/.test(e)));
  assert.ok(validateRecord({ ...diary, mood: 'low', moods: ['good'] }).some(e => /mood/.test(e)));
});
