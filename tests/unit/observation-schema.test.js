import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OBSERVATION_SCHEMA_VERSION,
  OBSERVATION_TEXT_MAX_LENGTH,
  compareObservationsNewestFirst,
  generateObservationId,
  isValidObservationId,
  observationIndexRecord,
  parseObservationRecord,
  projectObservation,
  validateObservationCreateInput
} from '../../netlify/functions/_shared/observation-schema.mjs';
import { observationKey } from '../../netlify/functions/_shared/professional-blobs.mjs';
import { compareTimelineOrder } from '../../netlify/functions/_shared/entity-overview.mjs';

const PERSON_REF = 'shared:person:person_00000000-0000-4000-8000-000000000001';
const ORG_REF = 'shared:organisation:organisation_00000000-0000-4000-8000-000000000002';

test('generateObservationId is path-safe and validates', () => {
  const id = generateObservationId();
  assert.equal(isValidObservationId(id), true);
  assert.match(id, /^observation_[0-9a-f-]{36}$/);
  assert.equal(id.includes('/'), false);
  assert.equal(id.includes('..'), false);
});

test('rejects unsafe observation ids before key construction', () => {
  assert.throws(() => observationKey('../etc/passwd'), (error) => error.code === 'invalid_observation_id');
  assert.throws(() => observationKey('observation_not-a-uuid'), (error) => error.code === 'invalid_observation_id');
});

test('validateObservationCreateInput accepts a valid input', () => {
  const validated = validateObservationCreateInput({
    about_ref: PERSON_REF,
    text: '  Mentioned a new role at UNSW.  ',
    occurred_at: '2026-09-01T10:00:00.000Z',
    source: 'meeting'
  });
  assert.equal(validated.about_ref, PERSON_REF);
  assert.equal(validated.text, 'Mentioned a new role at UNSW.');
  assert.equal(validated.occurred_at, '2026-09-01T10:00:00.000Z');
  assert.equal(validated.source, 'meeting');
  assert.equal(validated.linked_ref, null);
});

test('validateObservationCreateInput also accepts an organisation about_ref', () => {
  const validated = validateObservationCreateInput({
    about_ref: ORG_REF,
    text: 'Expanding into APAC.',
    occurred_at: '2026-09-01T10:00:00.000Z',
    source: 'manual'
  });
  assert.equal(validated.about_ref, ORG_REF);
});

test('text is required and empty/whitespace-only text is rejected', () => {
  assert.throws(
    () =>
      validateObservationCreateInput({
        about_ref: PERSON_REF,
        occurred_at: '2026-09-01T10:00:00.000Z',
        source: 'manual'
      }),
    (error) => error.code === 'text_required'
  );
  assert.throws(
    () =>
      validateObservationCreateInput({
        about_ref: PERSON_REF,
        text: '   ',
        occurred_at: '2026-09-01T10:00:00.000Z',
        source: 'manual'
      }),
    (error) => error.code === 'text_required'
  );
});

test('text over OBSERVATION_TEXT_MAX_LENGTH is rejected', () => {
  assert.throws(
    () =>
      validateObservationCreateInput({
        about_ref: PERSON_REF,
        text: 'x'.repeat(OBSERVATION_TEXT_MAX_LENGTH + 1),
        occurred_at: '2026-09-01T10:00:00.000Z',
        source: 'manual'
      }),
    (error) => error.code === 'text_too_long'
  );
});

test('occurred_at is required and must be a valid ISO timestamp', () => {
  assert.throws(
    () =>
      validateObservationCreateInput({
        about_ref: PERSON_REF,
        text: 'hi',
        source: 'manual'
      }),
    (error) => error.code === 'invalid_occurred_at'
  );
  assert.throws(
    () =>
      validateObservationCreateInput({
        about_ref: PERSON_REF,
        text: 'hi',
        occurred_at: 'not-a-timestamp',
        source: 'manual'
      }),
    (error) => error.code === 'invalid_occurred_at'
  );
});

test('source must be one of the permitted enum values', () => {
  assert.throws(
    () =>
      validateObservationCreateInput({
        about_ref: PERSON_REF,
        text: 'hi',
        occurred_at: '2026-09-01T10:00:00.000Z',
        source: 'gossip'
      }),
    (error) => error.code === 'invalid_source'
  );
  for (const source of ['meeting', 'communication', 'manual', 'imported']) {
    const validated = validateObservationCreateInput({
      about_ref: PERSON_REF,
      text: 'hi',
      occurred_at: '2026-09-01T10:00:00.000Z',
      source
    });
    assert.equal(validated.source, source);
  }
});

test('about_ref must be shared:person or shared:organisation', () => {
  assert.throws(
    () =>
      validateObservationCreateInput({
        about_ref: 'tasks:task:task_00000000-0000-4000-8000-000000000003',
        text: 'hi',
        occurred_at: '2026-09-01T10:00:00.000Z',
        source: 'manual'
      }),
    (error) => error.code === 'invalid_about_ref'
  );
  assert.throws(
    () =>
      validateObservationCreateInput({
        about_ref: 'not-a-ref',
        text: 'hi',
        occurred_at: '2026-09-01T10:00:00.000Z',
        source: 'manual'
      }),
    (error) => error.code === 'invalid_about_ref'
  );
});

test('linked_ref is optional, accepted when a valid ref, rejected when malformed', () => {
  const validated = validateObservationCreateInput({
    about_ref: PERSON_REF,
    text: 'hi',
    occurred_at: '2026-09-01T10:00:00.000Z',
    source: 'communication',
    linked_ref: 'professional:communication:communication_00000000-0000-4000-8000-000000000004'
  });
  assert.equal(
    validated.linked_ref,
    'professional:communication:communication_00000000-0000-4000-8000-000000000004'
  );

  assert.throws(
    () =>
      validateObservationCreateInput({
        about_ref: PERSON_REF,
        text: 'hi',
        occurred_at: '2026-09-01T10:00:00.000Z',
        source: 'manual',
        linked_ref: 'not-a-ref'
      }),
    (error) => error.code === 'invalid_linked_ref'
  );
});

test('unknown top-level field is rejected', () => {
  assert.throws(
    () =>
      validateObservationCreateInput({
        about_ref: PERSON_REF,
        text: 'hi',
        occurred_at: '2026-09-01T10:00:00.000Z',
        source: 'manual',
        actor: 'someone'
      }),
    (error) => error.code === 'unknown_field'
  );
});

test('parseObservationRecord round-trips a stored record and rejects unknown fields', () => {
  const id = generateObservationId();
  const base = {
    schema_version: OBSERVATION_SCHEMA_VERSION,
    id,
    about_ref: PERSON_REF,
    text: 'Note',
    occurred_at: '2026-09-01T10:00:00.000Z',
    source: 'manual',
    linked_ref: null,
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z'
  };
  assert.ok(parseObservationRecord(base));
  assert.equal(parseObservationRecord({ ...base, person_id: 'x' }), null);
  assert.equal(parseObservationRecord({ ...base, source: 'gossip' }), null);
});

test('projectObservation returns the full record shape with no hidden fields', () => {
  const id = generateObservationId();
  const record = {
    schema_version: OBSERVATION_SCHEMA_VERSION,
    id,
    about_ref: PERSON_REF,
    text: 'Note',
    occurred_at: '2026-09-01T10:00:00.000Z',
    source: 'manual',
    linked_ref: null,
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z'
  };
  assert.deepEqual(projectObservation(record), record);
});

test('observationIndexRecord carries only the minimal sort/filter fields', () => {
  const id = generateObservationId();
  const record = {
    schema_version: OBSERVATION_SCHEMA_VERSION,
    id,
    about_ref: PERSON_REF,
    text: 'Note',
    occurred_at: '2026-09-01T10:00:00.000Z',
    source: 'manual',
    linked_ref: null,
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z'
  };
  assert.deepEqual(observationIndexRecord(record), {
    id,
    about_ref: PERSON_REF,
    occurred_at: '2026-09-01T10:00:00.000Z',
    source: 'manual'
  });
});

test('compareObservationsNewestFirst sorts newest occurred_at first, ties broken by ascending id', () => {
  const rows = [
    { id: 'observation_a', occurred_at: '2026-01-01T00:00:00.000Z' },
    { id: 'observation_c', occurred_at: '2026-02-01T00:00:00.000Z' },
    { id: 'observation_b', occurred_at: '2026-02-01T00:00:00.000Z' }
  ];
  rows.sort(compareObservationsNewestFirst);
  assert.deepEqual(
    rows.map((row) => row.id),
    ['observation_b', 'observation_c', 'observation_a']
  );
});

test('entity-overview.mjs exports compareTimelineOrder and it ties by ascending id', () => {
  assert.equal(typeof compareTimelineOrder, 'function');
  const rows = [
    { id: 'z', date: '2026-02-01T00:00:00.000Z' },
    { id: 'a', date: '2026-02-01T00:00:00.000Z' }
  ];
  rows.sort(compareTimelineOrder);
  assert.deepEqual(rows.map((row) => row.id), ['a', 'z']);
});
