import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertEntityKindAllowed,
  createAccessContext,
  endpointNotFoundError,
  isVisibilityAllowed,
  strictestVisibility
} from '../../netlify/functions/_shared/entity-access.mjs';

test('createAccessContext derives actor and allowed_visibility from workflow, not from caller input', () => {
  const tasksContext = createAccessContext({ workflow: 'tasks' });
  assert.equal(tasksContext.actor, 'operator');
  assert.deepEqual(tasksContext.allowed_visibility, ['operator']);
});

test('no workflow grants teaching_protected in this slice, including teaching and administration', () => {
  // The College approval gate (Slice 8) has not been recorded. Nothing may
  // read or write teaching_protected data before then, so no workflow may
  // even be granted the visibility label yet.
  for (const workflow of ['professional', 'tasks', 'teaching', 'knowledge', 'life', 'administration']) {
    const context = createAccessContext({ workflow });
    assert.deepEqual(context.allowed_visibility, ['operator'], `${workflow} must not grant teaching_protected`);
  }
});

test('createAccessContext ignores unexpected input fields rather than trusting them', () => {
  const context = createAccessContext({
    workflow: 'tasks',
    actor: 'attacker',
    allowed_visibility: ['operator', 'teaching_protected']
  });
  assert.equal(context.actor, 'operator');
  assert.deepEqual(context.allowed_visibility, ['operator']);
});

test('createAccessContext rejects an unknown workflow', () => {
  assert.throws(() => createAccessContext({ workflow: 'made_up' }), error => error.code === 'invalid_workflow');
  assert.throws(() => createAccessContext({}), error => error.code === 'invalid_workflow');
});

test('createAccessContext returned objects and arrays are frozen', () => {
  const context = createAccessContext({ workflow: 'tasks' });
  assert.throws(() => { context.actor = 'someone_else'; }, TypeError);
  assert.throws(() => { context.allowed_visibility.push('teaching_protected'); }, TypeError);
});

test('isVisibilityAllowed checks membership in the derived allowed set', () => {
  const tasksContext = createAccessContext({ workflow: 'tasks' });
  assert.equal(isVisibilityAllowed(tasksContext, 'operator'), true);
  assert.equal(isVisibilityAllowed(tasksContext, 'teaching_protected'), false);
  assert.equal(isVisibilityAllowed(tasksContext, 'anything_unknown'), false);
  assert.equal(isVisibilityAllowed(null, 'operator'), false);
});

test('strictestVisibility returns the most restrictive known label', () => {
  assert.equal(strictestVisibility('operator'), 'operator');
  assert.equal(strictestVisibility('operator', 'teaching_protected'), 'teaching_protected');
  assert.equal(strictestVisibility('teaching_protected', 'operator'), 'teaching_protected');
});

test('strictestVisibility ignores unknown values and throws when nothing known was given', () => {
  assert.equal(strictestVisibility('operator', 'made_up'), 'operator');
  assert.throws(() => strictestVisibility('made_up'), error => error.code === 'invalid_visibility');
  assert.throws(() => strictestVisibility(), error => error.code === 'invalid_visibility');
});

test('assertEntityKindAllowed treats an empty allow-list as unrestricted', () => {
  const open = createAccessContext({ workflow: 'tasks' });
  assert.doesNotThrow(() => assertEntityKindAllowed(open, 'person'));
});

test('assertEntityKindAllowed rejects a kind outside a populated allow-list with the non-disclosure shape', () => {
  const restricted = createAccessContext({ workflow: 'tasks', allowedEntityKinds: ['task'] });
  assert.doesNotThrow(() => assertEntityKindAllowed(restricted, 'task'));
  assert.throws(
    () => assertEntityKindAllowed(restricted, 'person'),
    error => error.status === 404 && error.code === 'endpoint_not_found'
  );
});

test('endpointNotFoundError is a stable 404 shape with no protected detail', () => {
  const error = endpointNotFoundError();
  assert.equal(error.status, 404);
  assert.equal(error.code, 'endpoint_not_found');
  assert.doesNotMatch(error.message, /person|organisation|student/i);
});
