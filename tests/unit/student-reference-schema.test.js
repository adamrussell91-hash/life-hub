import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STUDENT_CONTEXT_TARGET_KIND,
  STUDENT_CONTEXT_TYPES,
  assertLifecycleTransitionAllowed,
  isStudentReferenceId,
  isValidDisplayCode,
  normalizeInitials,
  parseStudentReference,
  validateContextType,
  validatePermissionStatus
} from '../../netlify/functions/_shared/student-reference-schema.mjs';

test('isStudentReferenceId accepts only the exact student_ref_<uuid> shape', () => {
  assert.equal(isStudentReferenceId('student_ref_00000000-0000-4000-8000-000000000001'), true);
  assert.equal(isStudentReferenceId('student_ref_abc'), false);
  assert.equal(isStudentReferenceId('../../etc/passwd'), false);
  assert.equal(isStudentReferenceId(''), false);
  assert.equal(isStudentReferenceId(null), false);
});

test('normalizeInitials uppercases and rejects non-initials input', () => {
  assert.equal(normalizeInitials('ar'), 'AR');
  assert.equal(normalizeInitials('  Ar  '), 'AR');
  assert.throws(() => normalizeInitials('a1'), (e) => e.code === 'invalid_initials');
  assert.throws(() => normalizeInitials(''), (e) => e.code === 'invalid_initials');
  assert.throws(() => normalizeInitials('toolonginitials'), (e) => e.code === 'invalid_initials');
});

test('isValidDisplayCode permits bare initials and a neutral suffix starting at 2, never a bare 1', () => {
  assert.equal(isValidDisplayCode('AR'), true);
  assert.equal(isValidDisplayCode('AR2'), true);
  assert.equal(isValidDisplayCode('AR10'), true);
  assert.equal(isValidDisplayCode('AR1'), false);
  assert.equal(isValidDisplayCode('ar'), false);
  assert.equal(isValidDisplayCode('AR-2'), false);
});

test('parseStudentReference rejects unknown fields, bad ids, and bad lifecycle values', () => {
  const base = {
    schema_version: 1,
    id: 'student_ref_00000000-0000-4000-8000-000000000001',
    kind: 'student_reference',
    display_code: 'AR',
    lifecycle_status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  };
  assert.ok(parseStudentReference(base));
  assert.equal(parseStudentReference({ ...base, extra_field: 'x' }), null);
  assert.equal(parseStudentReference({ ...base, id: 'not_valid' }), null);
  assert.equal(parseStudentReference({ ...base, lifecycle_status: 'made_up' }), null);
  assert.equal(parseStudentReference({ ...base, display_code: 'lower' }), null);
  assert.equal(parseStudentReference(null), null);
  assert.equal(parseStudentReference('a string'), null);
});

test('assertLifecycleTransitionAllowed permits only active<->archived and archived->deleted', () => {
  assert.doesNotThrow(() => assertLifecycleTransitionAllowed('active', 'archived'));
  assert.doesNotThrow(() => assertLifecycleTransitionAllowed('archived', 'active'));
  assert.doesNotThrow(() => assertLifecycleTransitionAllowed('archived', 'deleted'));
  assert.throws(() => assertLifecycleTransitionAllowed('active', 'deleted'), (e) => e.status === 409);
  assert.throws(() => assertLifecycleTransitionAllowed('deleted', 'active'), (e) => e.status === 409);
});

test('STUDENT_CONTEXT_TARGET_KIND covers exactly class/program/excursion/coaching', () => {
  assert.deepEqual([...STUDENT_CONTEXT_TYPES].sort(), ['class', 'coaching', 'excursion', 'program']);
  assert.equal(STUDENT_CONTEXT_TARGET_KIND.class, 'teaching:class');
  assert.equal(STUDENT_CONTEXT_TARGET_KIND.program, 'tasks:program');
  assert.equal(STUDENT_CONTEXT_TARGET_KIND.excursion, 'tasks:project');
  assert.equal(STUDENT_CONTEXT_TARGET_KIND.coaching, 'tasks:program');
});

test('validateContextType and validatePermissionStatus reject unknown values', () => {
  assert.equal(validateContextType('class'), 'class');
  assert.throws(() => validateContextType('made_up'), (e) => e.code === 'invalid_context_type');
  assert.equal(validatePermissionStatus('approved'), 'approved');
  assert.equal(validatePermissionStatus(null), null);
  assert.throws(() => validatePermissionStatus('made_up'), (e) => e.code === 'invalid_permission_status');
});
