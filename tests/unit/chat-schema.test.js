import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalPath, logEntryToolSchema, validateLogEntry, buildRecordSlug, DOMAIN_PROPERTIES, logEntryRejectionPayload } from '../../netlify/functions/_shared/chat-schema.mjs';

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
  assert.equal(buildRecordSlug({ type: 'workout', time: '07:30', status: 'completed' }), 'workout-0730');
  assert.equal(buildRecordSlug({ type: 'skincare', routine: 'am', time: '08:00' }), 'am-0800');
  assert.equal(buildRecordSlug({ type: 'diary', time: '21:15' }), 'diary-2115');
});

test('planned workouts use a stable slug so the same day keeps one plan file', () => {
  assert.equal(buildRecordSlug({ type: 'workout', time: '16:07', status: 'planned' }), 'workout-planned');
  assert.equal(buildRecordSlug({ type: 'workout', time: '16:09', status: 'planned' }), 'workout-planned');
  assert.equal(
    buildCanonicalPath({
      type: 'workout',
      date: '2026-09-05',
      slug: buildRecordSlug({ type: 'workout', time: '16:09', status: 'planned' })
    }),
    'data/fitness/2026/09/2026-09-05-workout-planned.md'
  );
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
  assert.match(schema.description, /confirm/i);
});

test('mind_session-only tool schema describes immediate write', () => {
  const schema = logEntryToolSchema(['mind_session']);
  assert.match(schema.description, /immediately/i);
  assert.match(schema.description, /no Confirm card/i);
  assert.doesNotMatch(schema.description, /review and confirm before it is saved/);
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
      pain_flags: [{ site: 'left shoulder', note: 'mild twinge' }],
      cross_agent_note: 'Chadwick→Sara: left shoulder twinge on press, monitor.'
    }
  }, { id: 'workout-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('validateLogEntry collapses Bar Press set N rows into one Bar Press before save', () => {
  const result = validateLogEntry({
    type: 'workout',
    date: '2026-09-01',
    fields: {
      title: 'Planned session',
      session_kind: 'strength',
      day_type: 'workout_30',
      status: 'completed',
      exercises: [
        { name: 'Bar Press set 1', sets: [{ reps: 10, weight_kg: 30, cable_type: 'constant_force' }] },
        { name: 'Curl set 1', sets: [{ reps: 8, weight_kg: 37, cable_type: 'constant_force' }] },
        { name: 'Bar Press set 2', sets: [{ reps: 8, weight_kg: 34, cable_type: 'constant_force' }] },
        { name: 'Curl set 2', sets: [{ reps: 10, weight_kg: 37, cable_type: 'constant_force' }] }
      ]
    }
  }, { id: 'workout-2026-09-01-1', now: '2026-09-01T18:26:45+10:00' });

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.record.exercises.map(exercise => exercise.name), ['Bar Press', 'Curl']);
  assert.equal(result.record.exercises[0].sets.length, 2);
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

test('mind_session schema includes themes, session_type, and observation', () => {
  const keys = Object.keys(DOMAIN_PROPERTIES.mind_session);
  for (const key of ['themes', 'pattern_tags', 'session_type', 'framework', 'observation', 'title', 'source_agent']) {
    assert.ok(keys.includes(key), key);
  }
});

test('diary schema includes source_agent', () => {
  assert.ok(Object.hasOwn(DOMAIN_PROPERTIES.diary, 'source_agent'));
});

test('medical slugs include a title stem so same-day visits do not collide', () => {
  assert.equal(
    buildRecordSlug({ type: 'medical', title: 'GP review', time: '09:15' }),
    'medical-gp-review-0915'
  );
  assert.equal(
    buildRecordSlug({ type: 'medical', title: 'Therapy Session with Kate', time: '15:45' }),
    'medical-therapy-session-with-kate-1545'
  );
  assert.equal(
    buildCanonicalPath({
      type: 'medical',
      date: '2026-08-20',
      slug: buildRecordSlug({ type: 'medical', title: 'GP review', time: '09:15' })
    }),
    'data/body/2026/08/2026-08-20-medical-gp-review-0915.md'
  );
});

test('validates a well-formed medical log entry', () => {
  const result = validateLogEntry({
    type: 'medical',
    date: '2026-08-20',
    time: '09:15',
    notes: 'Check-in — stable vs last.',
    fields: {
      title: 'GP review',
      record_type: 'Appointment',
      lane: 'appointment',
      provider: 'Dr Nerida McDonald',
      location: 'Walker Street Doctors',
      location_kind: 'place',
      episode: null
    }
  }, { id: 'med-1', now: '2026-08-20T09:15:00+10:00' });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.record.type, 'medical');
  assert.equal(result.record.title, 'GP review');
  assert.equal(result.notes, 'Check-in — stable vs last.');
});

test('normalizes a title-only medical log entry from chat', () => {
  const result = validateLogEntry({
    type: 'medical',
    date: '2026-08-26',
    notes: 'Just had my stelara injection at the doctors',
    fields: { title: 'Stelara injection' }
  }, { id: 'med-2', now: '2026-08-26T21:33:00+10:00' });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.record.record_type, 'Prescription');
  assert.equal(result.record.lane, 'prescription');
  assert.equal(result.record.location_kind, 'unknown');
});

test('logEntryRejectionPayload includes a retry hint for medical payloads', () => {
  const payload = logEntryRejectionPayload(
    { type: 'medical', date: '2026-08-01', fields: { title: 'Stelara injection' } },
    ['lane must be one of: prescription']
  );
  assert.equal(payload.ok, false);
  assert.equal(payload.status, 'validation_failed');
  assert.match(payload.retry, /title.*notes only/i);
});

test('medical schema includes visit fields and episode', () => {
  const keys = Object.keys(DOMAIN_PROPERTIES.medical);
  for (const key of [
    'title', 'record_type', 'lane', 'date_end', 'provider', 'location',
    'location_kind', 'follow_up_date', 'cost_aud', 'insurance_status', 'episode'
  ]) {
    assert.ok(keys.includes(key), key);
  }
});
