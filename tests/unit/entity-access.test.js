import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccessContext,
  endpointNotFoundError,
  isEntityKindAllowed,
  isVisibilityAllowed
} from '../../netlify/functions/_shared/entity-access.mjs';

test('createAccessContext derives allowed_visibility from workflow, not from caller input', () => {
  const tasksContext = createAccessContext({ workflow: 'tasks' });
  assert.equal(tasksContext.actor, 'operator');
  assert.deepEqual(tasksContext.allowed_visibility, ['operator']);

  const teachingContext = createAccessContext({ workflow: 'teaching' });
  assert.deepEqual(teachingContext.allowed_visibility, ['operator', 'teaching_protected']);

  const administrationContext = createAccessContext({ workflow: 'administration' });
  assert.deepEqual(administrationContext.allowed_visibility, ['operator', 'teaching_protected']);
});

test('createAccessContext ignores unexpected input fields rather than trusting them', () => {
  // A handler must never forward client-supplied `actor`, `workflow`, or
  // `allowed_visibility` straight into the context (implementation
  // programme, "Authorisation model" rule #2). Passing them here proves
  // the function only reads `workflow` and `allowedEntityKinds`.
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

test('isEntityKindAllowed treats an empty allow-list as unrestricted, a populated one as a filter', () => {
  const open = createAccessContext({ workflow: 'tasks' });
  assert.equal(isEntityKindAllowed(open, 'person'), true);

  const restricted = createAccessContext({ workflow: 'tasks', allowedEntityKinds: ['task'] });
  assert.equal(isEntityKindAllowed(restricted, 'task'), true);
  assert.equal(isEntityKindAllowed(restricted, 'person'), false);
});

test('endpointNotFoundError is a stable 404 shape with no protected detail', () => {
  const error = endpointNotFoundError();
  assert.equal(error.status, 404);
  assert.equal(error.code, 'endpoint_not_found');
  assert.doesNotMatch(error.message, /person|organisation|student/i);
});
