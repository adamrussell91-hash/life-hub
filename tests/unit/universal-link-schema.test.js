import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  LINK_ID_PATTERN,
  LINK_STATUSES,
  LINK_VISIBILITIES,
  OPERATION_ID_PATTERN,
  OPERATION_SCHEMA_VERSION,
  OPERATION_STATUSES,
  OPERATION_STEPS,
  OPERATION_TYPES,
  ORDINARY_READ_STATUSES,
  REASON_CODE_PATTERN,
  UNIVERSAL_LINK_SCHEMA_VERSION,
  equivalenceInput,
  generateLinkId,
  generateOperationId,
  isValidLinkId,
  isValidOperationId,
  isValidReasonCode,
  parseUniversalLink,
  validateOperationRecord,
  validateUniversalLinkRecord
} from '../../netlify/functions/_shared/universal-link-schema.mjs';

// The canonical deterministic id form is `ul_` + 64 lowercase hex chars
// (a SHA-256 digest). Tests use a hash of a readable label so ids stay
// both realistic and distinguishable.
function ulId(label) {
  return `ul_${createHash('sha256').update(label).digest('hex')}`;
}

function validRecord(overrides = {}) {
  return {
    schema_version: UNIVERSAL_LINK_SCHEMA_VERSION,
    id: ulId('default'),
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

test('isValidLinkId accepts only ul_ followed by exactly 64 lowercase hex characters', () => {
  assert.equal(isValidLinkId(ulId('valid')), true);
  assert.match(ulId('valid'), LINK_ID_PATTERN);
  for (const bad of [
    'ul_deadbeef', // too short
    'ul_' + 'a'.repeat(63), // one char short
    'ul_' + 'a'.repeat(65), // one char long
    'ul_' + 'A'.repeat(64), // uppercase not permitted
    'ul_' + 'g'.repeat(64), // non-hex character
    `not_${'a'.repeat(64)}`, // wrong prefix
    'ul_../../etc/passwd', // path traversal
    'ul_' + 'a'.repeat(60) + '/../', // path traversal with correct-length prefix
    '',
    null,
    undefined,
    123
  ]) {
    assert.equal(isValidLinkId(bad), false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test('parseUniversalLink rejects a record whose id is not the canonical deterministic form', () => {
  assert.equal(parseUniversalLink(validRecord({ id: 'ul_deadbeef' })), null);
  assert.equal(parseUniversalLink(validRecord({ id: 'ul_../../etc/passwd' })), null);
});

test('ORDINARY_READ_STATUSES contains exactly current and ended', () => {
  assert.deepEqual([...ORDINARY_READ_STATUSES].sort(), ['current', 'ended']);
  assert.equal(ORDINARY_READ_STATUSES.has('suppressed'), false);
  assert.equal(ORDINARY_READ_STATUSES.has('deleted'), false);
});

test('equivalenceInput produces identical output for identical relationship-defining fields', () => {
  const base = {
    sourceRef: 'tasks:task:task_email_seth',
    targetRef: 'shared:person:person_seth',
    relationshipType: 'collaborator'
  };
  assert.deepEqual(equivalenceInput(base), equivalenceInput({ ...base }));
});

// --- Slice 2: deterministic id generation and write validation ---

test('generateLinkId is stable across equivalent inputs regardless of property order', () => {
  const base = {
    sourceRef: 'tasks:task:task_email_seth',
    targetRef: 'shared:person:person_seth',
    relationshipType: 'collaborator'
  };
  const idFromOrderA = generateLinkId(equivalenceInput(base));
  const idFromOrderB = generateLinkId(equivalenceInput({
    relationshipType: base.relationshipType,
    targetRef: base.targetRef,
    sourceRef: base.sourceRef
  }));
  assert.equal(idFromOrderA, idFromOrderB);
  assert.match(idFromOrderA, LINK_ID_PATTERN);
});

test('generateLinkId is unaffected by valid_to, status, timestamps, display labels, or extraneous fields', () => {
  // equivalenceInput destructures only its named duplicate-field
  // parameters, so a caller building it straight from a wider client
  // payload (which may carry valid_to, status, timestamps, or display
  // labels alongside the real duplicate fields) still produces an
  // equivalence object — and therefore a link id — with none of that noise
  // in it.
  const clean = {
    sourceRef: 'tasks:task:task_email_seth',
    targetRef: 'shared:person:person_seth',
    relationshipType: 'collaborator'
  };
  const noisyClientPayload = {
    ...clean,
    valid_to: '2027-01-01T00:00:00.000Z',
    status: 'ended',
    created_at: '2020-01-01T00:00:00.000Z',
    updated_at: '2020-01-01T00:00:00.000Z',
    display_label: 'Seth Example',
    source_title: 'Do not hash me'
  };
  const cleanId = generateLinkId(equivalenceInput(clean));
  const noisyId = generateLinkId(equivalenceInput(noisyClientPayload));
  assert.equal(cleanId, noisyId);
  // Confirm equivalenceInput itself dropped the noise, not just that the
  // two ids happen to match.
  assert.equal('valid_to' in equivalenceInput(noisyClientPayload), false);
  assert.equal('status' in equivalenceInput(noisyClientPayload), false);
  assert.equal('display_label' in equivalenceInput(noisyClientPayload), false);
});

test('generateLinkId changes when any duplicate field changes', () => {
  const base = {
    sourceRef: 'tasks:task:task_email_seth',
    targetRef: 'shared:person:person_seth',
    relationshipType: 'collaborator'
  };
  const baseId = generateLinkId(equivalenceInput(base));
  const variants = [
    { ...base, sourceRef: 'tasks:task:task_other' },
    { ...base, targetRef: 'shared:person:person_other' },
    { ...base, relationshipType: 'contact' },
    { ...base, contextKey: 'tasks' },
    { ...base, contextRef: 'tasks:project:proj_1' },
    { ...base, role: 'Reviewer' },
    { ...base, validFrom: '2026-01-01T00:00:00.000Z' },
    { ...base, occurredAt: '2026-01-01T00:00:00.000Z' }
  ];
  for (const variant of variants) {
    const variantId = generateLinkId(equivalenceInput(variant));
    assert.notEqual(variantId, baseId, `expected a distinct id for ${JSON.stringify(variant)}`);
  }
});

test('isValidOperationId accepts only op_ followed by exactly 32 lowercase hex characters', () => {
  const id = generateOperationId();
  assert.equal(isValidOperationId(id), true);
  assert.match(id, OPERATION_ID_PATTERN);
  for (const bad of [
    'op_deadbeef',
    'op_' + 'a'.repeat(31),
    'op_' + 'a'.repeat(33),
    'op_' + 'A'.repeat(32),
    'op_../../etc/passwd',
    '',
    null,
    undefined,
    123
  ]) {
    assert.equal(isValidOperationId(bad), false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test('generateOperationId produces distinct, path-safe ids', () => {
  const a = generateOperationId();
  const b = generateOperationId();
  assert.notEqual(a, b);
  assert.equal(a.includes('/'), false);
  assert.equal(a.includes('..'), false);
});

function validOperationRecord(overrides = {}) {
  return {
    schema_version: OPERATION_SCHEMA_VERSION,
    operation_id: generateOperationId(),
    operation_type: 'create_link',
    link_id: 'ul_' + 'a'.repeat(64),
    status: 'prepared',
    completed_steps: [],
    link_payload: { source_ref: 'tasks:task:task_email_seth' },
    created_at: '2026-09-11T00:00:00.000Z',
    updated_at: '2026-09-11T00:00:00.000Z',
    last_error_code: null,
    ...overrides
  };
}

test('validateOperationRecord accepts a well formed journal record and returns a copy', () => {
  const record = validOperationRecord();
  const validated = validateOperationRecord(record);
  assert.deepEqual(validated, record);
  assert.notEqual(validated, record);
});

test('validateOperationRecord rejects structurally malformed journal records without throwing', () => {
  assert.equal(validateOperationRecord(null), null);
  assert.equal(validateOperationRecord([]), null);
  assert.equal(validateOperationRecord(validOperationRecord({ schema_version: 2 })), null);
  assert.equal(validateOperationRecord(validOperationRecord({ operation_id: 'not-an-op-id' })), null);
  assert.equal(validateOperationRecord(validOperationRecord({ operation_type: 'made_up' })), null);
  assert.equal(validateOperationRecord(validOperationRecord({ link_id: 'not-a-link-id' })), null);
  assert.equal(validateOperationRecord(validOperationRecord({ status: 'unknown' })), null);
  assert.equal(validateOperationRecord(validOperationRecord({ completed_steps: ['not_a_step'] })), null);
  assert.equal(validateOperationRecord(validOperationRecord({ completed_steps: 'link' })), null);
  assert.equal(validateOperationRecord(validOperationRecord({ link_payload: [] })), null);
  assert.equal(validateOperationRecord(validOperationRecord({ link_payload: null })), null);
  assert.equal(validateOperationRecord(validOperationRecord({ last_error_code: 123 })), null);
});

test('OPERATION_STATUSES, OPERATION_TYPES, and OPERATION_STEPS are lower case and exactly the documented sets', () => {
  assert.deepEqual([...OPERATION_STATUSES].sort(), ['committed', 'prepared', 'repair_needed']);
  assert.deepEqual([...OPERATION_TYPES].sort(), ['create_link', 'delete_link', 'end_link', 'suppress_link']);
  assert.deepEqual(
    [...OPERATION_STEPS].sort(),
    ['link', 'source_membership', 'target_membership', 'type_membership']
  );
  for (const value of [...OPERATION_STATUSES, ...OPERATION_TYPES, ...OPERATION_STEPS]) {
    assert.equal(value, value.toLowerCase(), `${value} must be lower case`);
  }
});

test('isValidReasonCode accepts only bounded, machine-safe lower_snake_case codes', () => {
  assert.equal(isValidReasonCode('duplicate_contact'), true);
  assert.match('duplicate_contact', REASON_CODE_PATTERN);
  for (const bad of [
    'Duplicate Contact', // free text with spaces/case
    'Adam asked to remove Seth from the list', // free text sentence, could contain PII
    '', // empty
    '1_leading_digit',
    'a'.repeat(65), // too long
    null,
    undefined,
    123
  ]) {
    assert.equal(isValidReasonCode(bad), false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});
