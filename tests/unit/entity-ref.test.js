import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTITY_REF_KINDS,
  assertRegisteredEntityRef,
  formatEntityRef,
  hashEntityRef,
  isEntityRef,
  isRegisteredEntityRefKind,
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

test('assertRegisteredEntityRef accepts a valid string or object ref and returns the parsed form', () => {
  assert.deepEqual(assertRegisteredEntityRef('tasks:task:task_seth'), {
    namespace: 'tasks',
    kind: 'task',
    id: 'task_seth'
  });
  const ref = { namespace: 'shared', kind: 'person', id: 'person_seth' };
  assert.deepEqual(assertRegisteredEntityRef(ref), ref);
});

test('assertRegisteredEntityRef throws a 400 validation error, not a 404, for a malformed or unregistered ref', () => {
  for (const bad of ['not a ref', 'unknown:kind:id', 'teaching:student_reference:x', '', null, { namespace: 'shared', kind: 'person', id: '' }]) {
    assert.throws(
      () => assertRegisteredEntityRef(bad),
      error => error.status === 400 && error.code === 'invalid_entity_ref'
    );
  }
});

test('hashEntityRef is deterministic, differs per ref, and accepts a string or object', () => {
  const a = hashEntityRef('shared:person:person_seth');
  const b = hashEntityRef({ namespace: 'shared', kind: 'person', id: 'person_seth' });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, hashEntityRef('shared:person:person_other'));
});

test('hashEntityRef rejects an unformattable ref rather than hashing garbage', () => {
  assert.throws(
    () => hashEntityRef({ namespace: 'shared', kind: 'student_reference', id: 'x' }),
    error => error.status === 400 && error.code === 'invalid_entity_ref'
  );
});
