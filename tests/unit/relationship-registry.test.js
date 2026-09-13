import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import {
  getRelationshipDeclaration,
  listRelationshipDeclarations,
  projectRelationshipRegistry,
  validateRelationshipInput
} from '../../netlify/functions/_shared/relationship-registry.mjs';

const person = parseEntityRef('shared:person:person_seth');
const organisation = parseEntityRef('shared:organisation:organisation_unsw');
const task = parseEntityRef('tasks:task:task_email_seth');
const communication = parseEntityRef('professional:communication:communication_001');

test('lists the Slice 1–7 relationship declarations with correct inverse labels', () => {
  const keys = listRelationshipDeclarations().map(decl => decl.key).sort();
  assert.deepEqual(keys, [
    'about_person',
    'collaborator',
    'contact',
    'employee_at',
    'follow_up',
    'follows_from',
    'member_of',
    'recipient',
    'related_to'
  ]);
  assert.equal(getRelationshipDeclaration('employee_at').inverse_label, 'employs');
  assert.equal(getRelationshipDeclaration('collaborator').inverse_label, 'collaborates_on');
  assert.equal(getRelationshipDeclaration('contact').inverse_label, 'contacted_for_task');
  assert.equal(getRelationshipDeclaration('recipient').inverse_label, 'received_communication');
  assert.equal(getRelationshipDeclaration('related_to').inverse_label, 'related_to');
});

test('projectRelationshipRegistry exposes every declaration without duplicate_fields', () => {
  const projected = projectRelationshipRegistry();
  assert.equal(projected.length, 9);
  const contact = projected.find(decl => decl.key === 'contact');
  assert.ok(contact);
  assert.deepEqual(Object.keys(contact).sort(), [
    'allowed_visibility',
    'cardinality',
    'inverse_label',
    'key',
    'metadata_keys',
    'role_mode',
    'source_kinds',
    'target_kinds',
    'temporal_mode'
  ]);
  assert.equal('duplicate_fields' in contact, false);
});

test('accepts a well formed period relationship', () => {
  const decl = validateRelationshipInput({
    sourceRef: person,
    targetRef: organisation,
    relationshipType: 'employee_at',
    role: 'Gifted Education Teacher',
    validFrom: '2025-02-01T00:00:00.000Z'
  });
  assert.equal(decl.key, 'employee_at');
});

test('accepts a well formed timeless and point relationship', () => {
  assert.equal(
    validateRelationshipInput({ sourceRef: task, targetRef: person, relationshipType: 'collaborator' }).key,
    'collaborator'
  );
  assert.equal(
    validateRelationshipInput({
      sourceRef: communication,
      targetRef: person,
      relationshipType: 'recipient',
      occurredAt: '2026-09-11T00:00:00.000Z'
    }).key,
    'recipient'
  );
});

test('rejects an unknown relationship key', () => {
  assert.throws(
    () => validateRelationshipInput({ sourceRef: person, targetRef: organisation, relationshipType: 'nonsense' }),
    error => error.status === 400 && error.code === 'unknown_relationship_key'
  );
});

test('rejects reversed source and target types', () => {
  assert.throws(
    () => validateRelationshipInput({ sourceRef: organisation, targetRef: person, relationshipType: 'employee_at' }),
    error => error.code === 'invalid_source_kind'
  );
  assert.throws(
    () => validateRelationshipInput({ sourceRef: task, targetRef: organisation, relationshipType: 'collaborator' }),
    error => error.code === 'invalid_target_kind'
  );
});

test('rejects dates on a timeless relationship', () => {
  assert.throws(
    () => validateRelationshipInput({
      sourceRef: task,
      targetRef: person,
      relationshipType: 'collaborator',
      validFrom: '2026-01-01T00:00:00.000Z'
    }),
    error => error.code === 'dates_on_timeless_relationship'
  );
  assert.throws(
    () => validateRelationshipInput({
      sourceRef: task,
      targetRef: person,
      relationshipType: 'collaborator',
      occurredAt: '2026-01-01T00:00:00.000Z'
    }),
    error => error.code === 'dates_on_timeless_relationship'
  );
});

test('rejects occurred_at on a period relationship', () => {
  assert.throws(
    () => validateRelationshipInput({
      sourceRef: person,
      targetRef: organisation,
      relationshipType: 'employee_at',
      occurredAt: '2026-01-01T00:00:00.000Z'
    }),
    error => error.code === 'occurred_at_on_period_relationship'
  );
});

test('rejects valid_from or valid_to on a point relationship', () => {
  assert.throws(
    () => validateRelationshipInput({
      sourceRef: communication,
      targetRef: person,
      relationshipType: 'recipient',
      validFrom: '2026-01-01T00:00:00.000Z'
    }),
    error => error.code === 'dates_on_point_relationship'
  );
  assert.throws(
    () => validateRelationshipInput({
      sourceRef: communication,
      targetRef: person,
      relationshipType: 'recipient',
      validTo: '2026-01-01T00:00:00.000Z'
    }),
    error => error.code === 'dates_on_point_relationship'
  );
});

test('rejects valid_to before valid_from', () => {
  assert.throws(
    () => validateRelationshipInput({
      sourceRef: person,
      targetRef: organisation,
      relationshipType: 'employee_at',
      validFrom: '2026-06-01T00:00:00.000Z',
      validTo: '2026-01-01T00:00:00.000Z'
    }),
    error => error.code === 'valid_to_before_valid_from'
  );
});

test('rejects a metadata key the relationship does not declare', () => {
  assert.throws(
    () => validateRelationshipInput({
      sourceRef: task,
      targetRef: person,
      relationshipType: 'collaborator',
      metadata: { note: 'not a declared key' }
    }),
    error => error.code === 'unknown_metadata_key'
  );
});

test('rejects a visibility the relationship does not allow', () => {
  assert.throws(
    () => validateRelationshipInput({
      sourceRef: person,
      targetRef: organisation,
      relationshipType: 'employee_at',
      visibility: 'teaching_protected'
    }),
    error => error.code === 'visibility_not_allowed'
  );
});

test('rejects role text for a relationship whose role_mode is none', () => {
  assert.throws(
    () => validateRelationshipInput({
      sourceRef: task,
      targetRef: person,
      relationshipType: 'collaborator',
      role: 'lead'
    }),
    error => error.code === 'role_not_permitted'
  );
});
