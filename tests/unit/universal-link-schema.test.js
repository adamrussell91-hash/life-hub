import test from 'node:test';
import assert from 'node:assert/strict';
import { getRelationshipDeclaration } from '../../netlify/functions/_shared/relationship-registry.mjs';
import {
  LINK_STATUSES,
  LINK_VISIBILITIES,
  UNIVERSAL_LINK_SCHEMA_VERSION,
  buildUniversalLinkRecord,
  computeLinkEquivalenceHash,
  isValidLinkRecordShape,
  linkIdFromEquivalenceHash
} from '../../netlify/functions/_shared/universal-link-schema.mjs';

const collaborator = getRelationshipDeclaration('collaborator');
const baseInput = {
  sourceRef: 'tasks:task:task_email_seth',
  targetRef: 'shared:person:person_seth',
  relationshipType: 'collaborator',
  declaration: collaborator
};

test('equivalence hash is deterministic for identical inputs', () => {
  const a = computeLinkEquivalenceHash({
    sourceRef: baseInput.sourceRef,
    targetRef: baseInput.targetRef,
    relationshipType: 'collaborator'
  });
  const b = computeLinkEquivalenceHash({
    sourceRef: baseInput.sourceRef,
    targetRef: baseInput.targetRef,
    relationshipType: 'collaborator'
  });
  assert.equal(a, b);
  assert.equal(linkIdFromEquivalenceHash(a), `ul_${a}`);
});

test('equivalence hash changes when a duplicate-defining field changes', () => {
  const base = computeLinkEquivalenceHash({
    sourceRef: baseInput.sourceRef,
    targetRef: baseInput.targetRef,
    relationshipType: 'collaborator'
  });
  const differentTarget = computeLinkEquivalenceHash({
    sourceRef: baseInput.sourceRef,
    targetRef: 'shared:person:person_other',
    relationshipType: 'collaborator'
  });
  const differentRole = computeLinkEquivalenceHash({
    sourceRef: 'professional:communication:communication_001',
    targetRef: 'shared:person:person_seth',
    relationshipType: 'employee_at',
    role: 'Gifted Education Teacher'
  });
  const differentRoleValue = computeLinkEquivalenceHash({
    sourceRef: 'professional:communication:communication_001',
    targetRef: 'shared:person:person_seth',
    relationshipType: 'employee_at',
    role: 'Something else'
  });
  assert.notEqual(base, differentTarget);
  assert.notEqual(differentRole, differentRoleValue);
});

test('building a record twice with different valid_to, status-affecting timestamps, or now() still yields the same id', () => {
  const first = buildUniversalLinkRecord({ ...baseInput, now: () => '2026-09-11T00:00:00.000Z' });
  const second = buildUniversalLinkRecord({
    ...baseInput,
    validTo: '2099-01-01T00:00:00.000Z', // must not affect equivalence
    now: () => '2027-01-01T00:00:00.000Z' // must not affect equivalence
  });
  assert.equal(first.id, second.id, 'valid_to and created_at/updated_at are excluded from the equivalence hash');
  assert.notEqual(first.created_at, second.created_at);
});

test('buildUniversalLinkRecord produces a shape that passes isValidLinkRecordShape', () => {
  const record = buildUniversalLinkRecord({ ...baseInput, now: () => '2026-09-11T00:00:00.000Z' });
  assert.equal(record.schema_version, UNIVERSAL_LINK_SCHEMA_VERSION);
  assert.equal(record.status, 'current');
  assert.equal(record.visibility, 'operator');
  assert.equal(record.temporal_mode, 'timeless');
  assert.deepEqual(record.metadata, {});
  assert.equal(isValidLinkRecordShape(record), true);
});

test('buildUniversalLinkRecord rejects an unformattable ref or unknown visibility', () => {
  assert.throws(
    () => buildUniversalLinkRecord({ ...baseInput, sourceRef: { namespace: 'shared', kind: 'student_reference', id: 'x' } }),
    error => error.code === 'invalid_source_ref'
  );
  assert.throws(
    () => buildUniversalLinkRecord({ ...baseInput, visibility: 'public' }),
    error => error.code === 'invalid_visibility'
  );
});

test('isValidLinkRecordShape rejects malformed records', () => {
  const record = buildUniversalLinkRecord({ ...baseInput, now: () => '2026-09-11T00:00:00.000Z' });
  assert.equal(isValidLinkRecordShape(null), false);
  assert.equal(isValidLinkRecordShape({ ...record, schema_version: 2 }), false);
  assert.equal(isValidLinkRecordShape({ ...record, id: 'not-prefixed' }), false);
  assert.equal(isValidLinkRecordShape({ ...record, source_ref: 'garbage' }), false);
  assert.equal(isValidLinkRecordShape({ ...record, status: 'unknown' }), false);
  assert.equal(isValidLinkRecordShape({ ...record, visibility: 'public' }), false);
  assert.equal(isValidLinkRecordShape({ ...record, metadata: [] }), false);
  assert.ok(LINK_STATUSES.has(record.status));
  assert.ok(LINK_VISIBILITIES.has(record.visibility));
});
