import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTITY_SCHEMA_VERSION,
  ORGANISATION_LIFECYCLE_STATUSES,
  PERSON_LIFECYCLE_STATUSES,
  TOMBSTONE_LABEL,
  buildIdentityIndexRecord,
  displayLabelFor,
  generateEventId,
  generateOrganisationId,
  generatePersonId,
  isValidEventId,
  isValidOrganisationId,
  isValidPersonId,
  parseIdentityIndexRecord,
  parseOrganisationRecord,
  parsePersonRecord,
  redactIdentityRecord,
  validateOrganisationCreateInput,
  validateOrganisationFieldUpdate,
  validatePersonCreateInput,
  validatePersonFieldUpdate
} from '../../netlify/functions/_shared/identity-schema.mjs';

function personRecord(overrides = {}) {
  return {
    schema_version: IDENTITY_SCHEMA_VERSION,
    id: generatePersonId(),
    kind: 'person',
    display_name: 'Seth Example',
    sort_name: 'Example, Seth',
    aliases: ['Sethy'],
    lifecycle_status: 'active',
    is_self: false,
    retention_reason: null,
    retention_review_at: null,
    created_at: '2026-09-11T00:00:00.000Z',
    updated_at: '2026-09-11T00:00:00.000Z',
    ...overrides
  };
}

function organisationRecord(overrides = {}) {
  return {
    schema_version: IDENTITY_SCHEMA_VERSION,
    id: generateOrganisationId(),
    kind: 'organisation',
    display_name: 'Example University',
    legal_name: 'Example University Ltd',
    aliases: ['ExU'],
    lifecycle_status: 'active',
    retention_reason: null,
    retention_review_at: null,
    created_at: '2026-09-11T00:00:00.000Z',
    updated_at: '2026-09-11T00:00:00.000Z',
    ...overrides
  };
}

test('generatePersonId/generateOrganisationId produce ids matching their own validators', () => {
  const personId = generatePersonId();
  const organisationId = generateOrganisationId();
  assert.equal(isValidPersonId(personId), true);
  assert.equal(isValidOrganisationId(organisationId), true);
  assert.equal(isValidPersonId(organisationId), false);
  assert.equal(isValidOrganisationId(personId), false);
});

test('isValidPersonId/isValidOrganisationId reject malformed and path-like ids', () => {
  for (const bad of ['person_seth', 'not_a_person_id', '../../etc/passwd', '', null, undefined, 123]) {
    assert.equal(isValidPersonId(bad), false, `expected ${JSON.stringify(bad)} rejected`);
  }
  for (const bad of ['organisation_unsw', 'not_an_organisation_id', '../../etc/passwd', '']) {
    assert.equal(isValidOrganisationId(bad), false, `expected ${JSON.stringify(bad)} rejected`);
  }
});

test('parsePersonRecord accepts a well formed record and returns a copy', () => {
  const record = personRecord();
  const parsed = parsePersonRecord(record);
  assert.deepEqual(parsed, record);
  assert.notEqual(parsed, record);
});

test('parsePersonRecord rejects structurally malformed records', () => {
  assert.equal(parsePersonRecord(null), null);
  assert.equal(parsePersonRecord([]), null);
  assert.equal(parsePersonRecord(personRecord({ schema_version: 2 })), null);
  assert.equal(parsePersonRecord(personRecord({ id: 'not-prefixed' })), null);
  assert.equal(parsePersonRecord(personRecord({ kind: 'organisation' })), null);
  assert.equal(parsePersonRecord(personRecord({ display_name: '' })), null);
  assert.equal(parsePersonRecord(personRecord({ aliases: 'not-an-array' })), null);
  assert.equal(parsePersonRecord(personRecord({ lifecycle_status: 'made_up' })), null);
  assert.equal(parsePersonRecord(personRecord({ is_self: 'yes' })), null);
});

test('parseOrganisationRecord accepts a well formed record and rejects malformed ones', () => {
  const record = organisationRecord();
  assert.deepEqual(parseOrganisationRecord(record), record);
  assert.equal(parseOrganisationRecord(organisationRecord({ lifecycle_status: 'deidentified' })), null, 'organisation has no deidentified status');
  assert.equal(parseOrganisationRecord(organisationRecord({ display_name: '' })), null);
});

test('validatePersonCreateInput requires display_name and defaults optional fields', () => {
  assert.throws(() => validatePersonCreateInput({}), error => error.code === 'display_name_required');
  assert.throws(() => validatePersonCreateInput({ display_name: '   ' }), error => error.code === 'display_name_required');
  const result = validatePersonCreateInput({ display_name: 'Seth Example' });
  assert.deepEqual(result, { display_name: 'Seth Example', sort_name: null, aliases: [], is_self: false });
});

test('validatePersonCreateInput rejects invalid optional field shapes', () => {
  assert.throws(() => validatePersonCreateInput({ display_name: 'Seth', sort_name: 123 }), error => error.code === 'invalid_sort_name');
  assert.throws(() => validatePersonCreateInput({ display_name: 'Seth', aliases: 'not-an-array' }), error => error.code === 'invalid_aliases');
  assert.throws(() => validatePersonCreateInput({ display_name: 'Seth', is_self: 'yes' }), error => error.code === 'invalid_is_self');
});

test('validatePersonFieldUpdate never accepts is_self, id, kind, lifecycle_status, or timestamps', () => {
  const patch = validatePersonFieldUpdate({
    display_name: 'New Name',
    is_self: true,
    id: 'person_hacked',
    kind: 'organisation',
    lifecycle_status: 'archived',
    created_at: 'x',
    updated_at: 'x'
  });
  assert.deepEqual(patch, { display_name: 'New Name' });
});

test('validateOrganisationCreateInput requires display_name', () => {
  assert.throws(() => validateOrganisationCreateInput({}), error => error.code === 'display_name_required');
  const result = validateOrganisationCreateInput({ display_name: 'Example University' });
  assert.deepEqual(result, { display_name: 'Example University', legal_name: null, aliases: [] });
});

test('validateOrganisationFieldUpdate accepts only display_name/legal_name/aliases', () => {
  const patch = validateOrganisationFieldUpdate({ legal_name: 'Example University Ltd', lifecycle_status: 'archived' });
  assert.deepEqual(patch, { legal_name: 'Example University Ltd' });
});

test('redactIdentityRecord hides display_name/sort_name/legal_name/aliases only for deleted or deidentified records', () => {
  const active = personRecord();
  assert.deepEqual(redactIdentityRecord(active), active);

  const deleted = personRecord({ lifecycle_status: 'deleted' });
  const redactedDeleted = redactIdentityRecord(deleted);
  assert.equal(redactedDeleted.display_name, TOMBSTONE_LABEL);
  assert.deepEqual(redactedDeleted.aliases, []);
  assert.equal(redactedDeleted.sort_name, null);

  const deidentified = personRecord({ lifecycle_status: 'deidentified' });
  assert.equal(redactIdentityRecord(deidentified).display_name, TOMBSTONE_LABEL);

  const orgDeleted = organisationRecord({ lifecycle_status: 'deleted' });
  const redactedOrg = redactIdentityRecord(orgDeleted);
  assert.equal(redactedOrg.display_name, TOMBSTONE_LABEL);
  assert.equal(redactedOrg.legal_name, null);
});

test('displayLabelFor mirrors redactIdentityRecord\'s tombstone rule', () => {
  assert.equal(displayLabelFor(personRecord()), 'Seth Example');
  assert.equal(displayLabelFor(personRecord({ lifecycle_status: 'deleted' })), TOMBSTONE_LABEL);
  assert.equal(displayLabelFor(personRecord({ lifecycle_status: 'deidentified' })), TOMBSTONE_LABEL);
});

test('generateEventId/isValidEventId are path-safe and distinct', () => {
  const a = generateEventId();
  const b = generateEventId();
  assert.equal(isValidEventId(a), true);
  assert.notEqual(a, b);
  for (const bad of ['event_deadbeef', '../../etc/passwd', '']) {
    assert.equal(isValidEventId(bad), false);
  }
});

test('buildIdentityIndexRecord/parseIdentityIndexRecord round trip and reject malformed input', () => {
  const record = buildIdentityIndexRecord({
    id: generatePersonId(),
    kind: 'person',
    displayLabel: 'Seth Example',
    sortName: 'Example, Seth',
    lifecycleStatus: 'active',
    isSelf: false,
    updatedAt: '2026-09-11T00:00:00.000Z'
  });
  assert.deepEqual(parseIdentityIndexRecord(record), record);
  assert.equal(parseIdentityIndexRecord({ ...record, kind: 'task' }), null);
  assert.equal(parseIdentityIndexRecord({ ...record, lifecycle_status: 'made_up' }), null);
  assert.equal(parseIdentityIndexRecord(null), null);
});

test('PERSON_LIFECYCLE_STATUSES includes deidentified; ORGANISATION_LIFECYCLE_STATUSES does not', () => {
  assert.equal(PERSON_LIFECYCLE_STATUSES.has('deidentified'), true);
  assert.equal(ORGANISATION_LIFECYCLE_STATUSES.has('deidentified'), false);
});
