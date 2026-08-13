import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalPath, logEntryToolSchema, validateLogEntry, buildRecordSlug } from '../../netlify/functions/_shared/chat-schema.mjs';

test('builds the canonical path for each writable record type', () => {
  assert.equal(buildCanonicalPath({ type: 'meal', date: '2026-08-01', slug: 'breakfast' }), 'data/nutrition/2026/08/2026-08-01-breakfast.md');
  assert.equal(buildCanonicalPath({ type: 'weight', date: '2026-08-01', slug: 'weight' }), 'data/body/2026/08/2026-08-01-weight.md');
});

test('meal slugs are slot-only so same-day corrections overwrite', () => {
  assert.equal(buildRecordSlug({ type: 'meal', meal: 'lunch', time: '13:45' }), 'lunch');
  assert.equal(buildRecordSlug({ type: 'meal', meal: 'snack', time: '16:00' }), 'snack');
  assert.equal(
    buildCanonicalPath({
      type: 'meal',
      date: '2026-08-07',
      slug: buildRecordSlug({ type: 'meal', meal: 'lunch', time: '13:45' })
    }),
    'data/nutrition/2026/08/2026-08-07-lunch.md'
  );
});

test('non-meal slugs still include time when present', () => {
  assert.equal(buildRecordSlug({ type: 'workout', time: '07:30' }), 'workout-0730');
  assert.equal(buildRecordSlug({ type: 'skincare', routine: 'am', time: '08:00' }), 'am-0800');
  assert.equal(buildRecordSlug({ type: 'diary', time: '21:15' }), 'diary-2115');
});

test('rejects an unknown type, invalid date, or invalid slug', () => {
  assert.throws(() => buildCanonicalPath({ type: 'nope', date: '2026-08-01', slug: 'x' }), TypeError);
  assert.throws(() => buildCanonicalPath({ type: 'meal', date: '2026-13-40', slug: 'x' }), TypeError);
  assert.throws(() => buildCanonicalPath({ type: 'meal', date: '2026-08-01', slug: 'Bad Slug' }), TypeError);
});

test('the tool schema restricts type to the allowed list when supplied', () => {
  const schema = logEntryToolSchema(['meal']);
  assert.equal(schema.name, 'log_entry');
  assert.deepEqual(schema.input_schema.properties.type.enum, ['meal']);
});

const FULL_MEAL_FIELDS = {
  meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12, sodium_mg: 420,
  calcium_mg: 210, polyphenol_score: 4, omega3: 'low'
};

test('validates a well-formed meal log entry into a canonical record', () => {
  const result = validateLogEntry({
    type: 'meal',
    date: '2026-08-01',
    fields: { ...FULL_MEAL_FIELDS }
  }, { id: 'meal-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, true);
  assert.equal(result.record.calories, 520);
  assert.equal(result.record.sodium_mg, 420);
  assert.equal(result.record.source, 'chat');
});

test('rejects a meal log entry missing sodium_mg', () => {
  const { sodium_mg, ...rest } = FULL_MEAL_FIELDS;
  const result = validateLogEntry({
    type: 'meal',
    date: '2026-08-01',
    fields: rest
  }, { id: 'meal-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('sodium_mg')));
});

test('rejects a meal log entry missing calcium_mg, polyphenol_score, or omega3', () => {
  const { calcium_mg, polyphenol_score, omega3, ...rest } = FULL_MEAL_FIELDS;
  const result = validateLogEntry({
    type: 'meal',
    date: '2026-08-01',
    fields: rest
  }, { id: 'meal-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('calcium_mg')));
  assert.ok(result.errors.some(error => error.includes('polyphenol_score')));
  assert.ok(result.errors.some(error => error.includes('omega3')));
});

test('meal tool schema requires the full macro/judgment set, not just core macros', () => {
  const schema = logEntryToolSchema(['meal']);
  assert.deepEqual(schema.input_schema.properties.fields.required, [
    'meal', 'calories', 'protein_g', 'fat_g', 'sodium_mg', 'calcium_mg', 'polyphenol_score', 'omega3'
  ]);
});

test('rejects a log entry with semantically invalid fields', () => {
  const result = validateLogEntry({
    type: 'meal',
    date: '2026-08-01',
    fields: { ...FULL_MEAL_FIELDS, meal: 'brunch' }
  }, { id: 'meal-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('meal')));
});

test('rejects an unknown record type before touching field validation', () => {
  assert.deepEqual(
    validateLogEntry({ type: 'sleep', date: '2026-08-01', fields: {} }, { id: 'x', now: '2026-08-01T00:00:00+10:00' }),
    { valid: false, errors: ['Unknown record type: sleep'] }
  );
});

test('rejects a payload whose fields is missing or not an object', () => {
  assert.equal(
    validateLogEntry({ type: 'meal', date: '2026-08-01' }, { id: 'x', now: '2026-08-01T00:00:00+10:00' }).valid,
    false
  );
});

test('rejects fields outside the domain whitelist instead of letting them reach the record', () => {
  const result = validateLogEntry({
    type: 'meal',
    date: '2026-08-01',
    fields: {
      meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12, sodium_mg: 420,
      id: 'attacker-id', type: 'workout', date: '1999-01-01',
      source: 'attacker', schema_version: 999,
      created_at: 'bogus', updated_at: 'bogus'
    }
  }, { id: 'meal-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, false);
  for (const key of ['id', 'type', 'date', 'source', 'schema_version', 'created_at', 'updated_at']) {
    assert.ok(result.errors.some(error => error.includes(key)), `expected an error mentioning ${key}`);
  }
});

test('spread order still protects protected keys if a field name were ever whitelisted', () => {
  const result = validateLogEntry({
    type: 'meal',
    date: '2026-08-01',
    fields: { ...FULL_MEAL_FIELDS }
  }, { id: 'meal-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, true);
  assert.equal(result.record.id, 'meal-1');
  assert.equal(result.record.type, 'meal');
  assert.equal(result.record.date, '2026-08-01');
  assert.equal(result.record.source, 'chat');
  assert.equal(result.record.schema_version, 1);
  assert.equal(result.record.created_at, '2026-08-01T07:45:00+10:00');
  assert.equal(result.record.updated_at, '2026-08-01T07:45:00+10:00');
});

test('a field name crafted to break YAML frontmatter is rejected as an unknown field', () => {
  const result = validateLogEntry({
    type: 'meal',
    date: '2026-08-01',
    fields: {
      meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12, sodium_mg: 420,
      'innocent\n---\ninjected_type: hacked\nreal_key': 'attempted frontmatter injection'
    }
  }, { id: 'meal-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, false);
});

test('the meal whitelist accepts every field validateMeal actually recognizes', () => {
  const result = validateLogEntry({
    type: 'meal',
    date: '2026-08-01',
    fields: {
      meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12,
      saturated_fat_g: 3, unsaturated_fat_g: 9, carbs_g: 40, sugar_g: 5, fibre_g: 6,
      sodium_mg: 400, calcium_mg: 120, polyphenol_score: 7, omega3: 'high'
    }
  }, { id: 'meal-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('the workout whitelist accepts every field validateWorkout actually recognizes', () => {
  const result = validateLogEntry({
    type: 'workout',
    date: '2026-08-01',
    fields: {
      title: 'Push day', session_kind: 'strength', day_type: 'workout_30', status: 'completed',
      duration_min: 30, avg_hr: 128, calories_kcal: 220, distance_km: 0,
      focus: ['chest', 'triceps'], recovery_flag_next_day: true,
      exercises: [{
        name: 'Bench press',
        bench_angle_deg: 30,
        intensification: 'drop_set',
        coach_cues: {
          start: "Let's get that chest pumped, big guy.",
          rest: 'Shake it out, next set is coming.',
          final_set: '1-2 reps in the tank, this is the one that counts.'
        },
        sets: [{ reps: 8, weight_kg: 60, cable_type: 'concentric' }]
      }],
      pain_flags: [{ site: 'left shoulder', note: 'mild twinge' }]
    }
  }, { id: 'workout-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('the workout tool schema advertises coach_cues on each exercise so Chadwick knows to populate it', () => {
  const schema = logEntryToolSchema(['workout']);
  const exerciseProps = schema.input_schema.properties.fields.properties.exercises.items.properties;
  assert.ok(exerciseProps.coach_cues, 'coach_cues should be a declared exercise property');
  assert.deepEqual(
    Object.keys(exerciseProps.coach_cues.properties).sort(),
    ['final_set', 'rest', 'start']
  );
});

test('the diary whitelist accepts every field validateDiary actually recognizes', () => {
  const result = validateLogEntry({
    type: 'diary',
    date: '2026-08-01',
    fields: {
      mood_score: 7, mood: 'good', energy: 'medium',
      tags: ['grateful', 'tired'], highlights: 'Good run', challenges: 'Poor sleep',
      dayone_sent: true
    }
  }, { id: 'diary-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('the measurements whitelist matches validate.js flexed/relaxed arm fields', () => {
  const result = validateLogEntry({
    type: 'measurements',
    date: '2026-08-01',
    fields: {
      chest: 104, waist: 82, hips: 98, shoulders: 118, neck: 38,
      right_arm_flexed: 40, left_arm_flexed: 39,
      right_arm_relaxed: 36, left_arm_relaxed: 35,
      right_thigh: 58, left_thigh: 57, calves: 38
    }
  }, { id: 'tape-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.record.right_arm_flexed, 40);
  assert.equal(result.record.left_arm_relaxed, 35);

  const legacy = validateLogEntry({
    type: 'measurements',
    date: '2026-08-01',
    fields: { right_arm: 40, left_arm: 39 }
  }, { id: 'tape-legacy', now: '2026-08-01T07:45:00+10:00' });
  assert.equal(legacy.valid, false);
  assert.ok(legacy.errors.some(error => error.includes('right_arm')));
  assert.ok(legacy.errors.some(error => error.includes('left_arm')));
});

test('rejects rather than throws when now is missing or not a string', () => {
  const missing = validateLogEntry({ type: 'meal', date: '2026-08-01', fields: { meal: 'breakfast' } }, { id: 'x' });
  assert.equal(missing.valid, false);

  const nonString = validateLogEntry({ type: 'meal', date: '2026-08-01', fields: { meal: 'breakfast' } }, { id: 'x', now: 12345 });
  assert.equal(nonString.valid, false);
});

test('mind_session whitelist and session slug', () => {
  const result = validateLogEntry({
    type: 'mind_session',
    date: '2026-08-13',
    fields: { theme: 'Weekend permission', closing_question: 'What is the weekend for?', mood_at_close: 'low' }
  }, { id: 'ms-1', now: '2026-08-13T17:00:00+10:00' });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(buildRecordSlug(result.record), 'session');
  assert.equal(
    buildCanonicalPath({ type: 'mind_session', date: '2026-08-13', slug: 'session' }),
    'data/mind/2026/08/2026-08-13-session.md'
  );
});

test('diary whitelist accepts moods, system_note, cross_agent_note', () => {
  const result = validateLogEntry({
    type: 'diary',
    date: '2026-08-13',
    fields: {
      mood_score: 6, mood: 'low', moods: ['low', 'good'], energy: 'medium',
      tags: [], dayone_sent: false, system_note: 'Weekend collapse',
      cross_agent_note: 'Penelope→Vera: worth a visit.'
    }
  }, { id: 'd-1', now: '2026-08-13T21:00:00+10:00' });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});
