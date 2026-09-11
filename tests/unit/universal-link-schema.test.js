import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LINK_STATUSES,
  LINK_VISIBILITIES,
  UNIVERSAL_LINK_SCHEMA_VERSION,
  equivalenceInput,
  parseUniversalLink,
  validateUniversalLinkRecord
} from '../../netlify/functions/_shared/universal-link-schema.mjs';

function validRecord(overrides = {}) {
  return {
    schema_version: UNIVERSAL_LINK_SCHEMA_VERSION,
    id: 'ul_deadbeef',
    source_ref: 'tasks:task:task_email_seth',
    target_ref: 'shared:person:person_seth',
    relationship_type: 'collaborator',
    role: null,
    context_key: null,
    context_ref: null,
    temporal_mode: 'timeless',
    valid_from: null,
    valid_to: null,
    occurred_at: null,
    status: 'current',
    visibility: 'operator',
    metadata: {},
    created_at: '2026-09-11T00:00:00.000Z',
    updated_at: '2026-09-11T00:00:00.000Z',
    ...overrides
  };
}

test('parseUniversalLink accepts a well formed record and returns a copy', () => {
  const record = validRecord();
  const parsed = parseUniversalLink(record);
  assert.deepEqual(parsed, record);
  assert.notEqual(parsed, record);
});

test('parseUniversalLink rejects structurally malformed records', () => {
  assert.equal(parseUniversalLink(null), null);
  assert.equal(parseUniversalLink([]), null);
  assert.equal(parseUniversalLink(validRecord({ schema_version: 2 })), null);
  assert.equal(parseUniversalLink(validRecord({ id: 'not-prefixed' })), null);
  assert.equal(parseUniversalLink(validRecord({ source_ref: 'garbage' })), null, 'malformed source ref');
  assert.equal(parseUniversalLink(validRecord({ target_ref: 'unknown:kind:x' })), null, 'unregistered target ref kind');
  assert.equal(parseUniversalLink(validRecord({ relationship_type: '' })), null);
  assert.equal(parseUniversalLink(validRecord({ status: 'unknown' })), null);
  assert.equal(parseUniversalLink(validRecord({ visibility: 'public' })), null);
  assert.equal(parseUniversalLink(validRecord({ metadata: [] })), null);
  assert.equal(parseUniversalLink(validRecord({ role: 123 })), null, 'role must be string or null');
  assert.ok(LINK_STATUSES.has(validRecord().status));
  assert.ok(LINK_VISIBILITIES.has(validRecord().visibility));
});

test('validateUniversalLinkRecord accepts a record consistent with its registry declaration', () => {
  const validated = validateUniversalLinkRecord(validRecord());
  assert.equal(validated.relationship_type, 'collaborator');
});

test('validateUniversalLinkRecord rejects a malformed record before consulting the registry', () => {
  assert.throws(
    () => validateUniversalLinkRecord(validRecord({ status: 'unknown' })),
    error => error.status === 400 && error.code === 'invalid_link_record'
  );
});

test('validateUniversalLinkRecord rejects an unknown relationship key', () => {
  assert.throws(
    () => validateUniversalLinkRecord(validRecord({ relationship_type: 'made_up' })),
    error => error.code === 'unknown_relationship_key'
  );
});

test('validateUniversalLinkRecord rejects reversed source/target kinds', () => {
  assert.throws(
    () => validateUniversalLinkRecord(validRecord({
      source_ref: 'shared:person:person_seth',
      target_ref: 'tasks:task:task_email_seth'
    })),
    error => error.code === 'invalid_source_kind'
  );
});

test('validateUniversalLinkRecord rejects a temporal_mode that disagrees with the registry', () => {
  // A record claiming to be `period` for a relationship the registry
  // declares `timeless` — this is the malformed-temporal-field corruption
  // case, distinct from dates actually being present.
  assert.throws(
    () => validateUniversalLinkRecord(validRecord({ temporal_mode: 'period' })),
    error => error.code === 'temporal_mode_mismatch'
  );
});

test('validateUniversalLinkRecord rejects dates that violate the temporal mode', () => {
  assert.throws(
    () => validateUniversalLinkRecord(validRecord({ valid_from: '2026-01-01T00:00:00.000Z' })),
    error => error.code === 'dates_on_timeless_relationship'
  );
});

test('equivalenceInput sorts keys, normalizes undefined to null, and excludes valid_to/status/timestamps', () => {
  const input = equivalenceInput({
    sourceRef: 'tasks:task:task_email_seth',
    targetRef: 'shared:person:person_seth',
    relationshipType: 'collaborator'
  });
  assert.deepEqual(Object.keys(input), [
    'context_key',
    'context_ref',
    'occurred_at',
    'relationship_type',
    'role',
    'source_ref',
    'target_ref',
    'valid_from'
  ]);
  assert.equal(input.context_key, null);
  assert.equal(input.role, null);
  assert.equal('valid_to' in input, false);
  assert.equal('status' in input, false);
  assert.equal('created_at' in input, false);
});

test('equivalenceInput produces identical output for identical relationship-defining fields', () => {
  const base = {
    sourceRef: 'tasks:task:task_email_seth',
    targetRef: 'shared:person:person_seth',
    relationshipType: 'collaborator'
  };
  assert.deepEqual(equivalenceInput(base), equivalenceInput({ ...base }));
});
