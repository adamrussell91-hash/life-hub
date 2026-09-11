import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTITY_REF_KINDS,
  formatEntityRef,
  isEntityRef,
  isRegisteredEntityRefKind,
  newEntityId,
  parseEntityRef
} from '../../netlify/functions/_shared/entity-ref.mjs';

test('parses every registered namespace:kind pair and round-trips through format', () => {
  const cases = [
    ['shared:person:person_abc123', { namespace: 'shared', kind: 'person', id: 'person_abc123' }],
    ['shared:organisation:organisation_abc123', { namespace: 'shared', kind: 'organisation', id: 'organisation_abc123' }],
    ['professional:communication:communication_abc123', { namespace: 'professional', kind: 'communication', id: 'communication_abc123' }],
    ['tasks:task:task_abc123', { namespace: 'tasks', kind: 'task', id: 'task_abc123' }],
    ['tasks:project:proj_abc123', { namespace: 'tasks', kind: 'project', id: 'proj_abc123' }]
  ];
  for (const [raw, expected] of cases) {
    assert.deepEqual(parseEntityRef(raw), expected);
    assert.equal(formatEntityRef(expected), raw);
    assert.equal(isEntityRef(raw), true);
  }
});

test('rejects unknown namespace, unknown kind, and malformed ids', () => {
  assert.equal(parseEntityRef('teaching:student_reference:student_ref_abc'), null, 'unregistered kind for a known namespace');
  assert.equal(parseEntityRef('unknown_namespace:person:person_abc'), null, 'unregistered namespace');
  assert.equal(parseEntityRef('shared:person:'), null, 'empty id');
  assert.equal(parseEntityRef('shared:person'), null, 'wrong segment count');
  assert.equal(parseEntityRef('shared:person:person:extra'), null, 'too many segments');
  assert.equal(parseEntityRef('shared:person:../etc/passwd'), null, 'path traversal characters');
  assert.equal(parseEntityRef(''), null);
  assert.equal(parseEntityRef(null), null);
  assert.equal(isEntityRef('unknown_namespace:person:person_abc'), false);
});

test('formatEntityRef refuses to format an unregistered or malformed ref', () => {
  assert.equal(formatEntityRef({ namespace: 'shared', kind: 'student_reference', id: 'x' }), '');
  assert.equal(formatEntityRef({ namespace: 'shared', kind: 'person', id: '' }), '');
  assert.equal(formatEntityRef(null), '');
});

test('format then parse round trips exactly for every registered kind', () => {
  for (const [namespace, kinds] of Object.entries(ENTITY_REF_KINDS)) {
    for (const kind of kinds) {
      const ref = { namespace, kind, id: `${kind}_seed01` };
      const formatted = formatEntityRef(ref);
      assert.equal(isRegisteredEntityRefKind(namespace, kind), true);
      assert.deepEqual(parseEntityRef(formatted), ref);
    }
  }
});

test('newEntityId prefixes a random UUID and rejects a bad prefix', () => {
  const id = newEntityId('person');
  assert.match(id, /^person_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notEqual(newEntityId('person'), id, 'two calls generate different ids');
  assert.throws(() => newEntityId('Person'), error => error.code === 'validation_error');
  assert.throws(() => newEntityId(''), error => error.code === 'validation_error');
  assert.throws(() => newEntityId('person name'), error => error.code === 'validation_error');
});

test('newEntityId never embeds the prefix content beyond a closed vocabulary word', () => {
  // Guards the "never embed a name, email, or identifier" rule by construction:
  // the id is always `<prefix>_<uuid>`, so no caller-supplied free text can
  // reach the id even if a resolver mistakenly passed one as the prefix.
  const id = newEntityId('organisation');
  const [prefix, ...rest] = id.split('_');
  assert.equal(prefix, 'organisation');
  assert.equal(rest.join('_').length, 36);
});
