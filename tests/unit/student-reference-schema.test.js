import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeInitials,
  parseStudentContextInput,
  parseStudentReference
} from '../../netlify/functions/_shared/student-reference-schema.mjs';

const record = {
  schema_version: 1,
  id: 'student_ref_00000000-0000-4000-8000-000000000001',
  kind: 'student_reference',
  display_code: 'SA1',
  lifecycle_status: 'active',
  created_at: '2026-09-13T00:00:00.000Z',
  updated_at: '2026-09-13T00:00:00.000Z'
};

test('accepts the reserved StudentReference shape and rejects extra identity shapes', () => {
  assert.deepEqual(parseStudentReference(record), record);
  assert.equal(parseStudentReference({ ...record, display_code: 'Student Name' }), null);
  assert.equal(parseStudentReference({ ...record, full_name: 'Synthetic Student' }), null);
  assert.equal(parseStudentReference({ ...record, lifecycle_status: 'retained' }), null);
});

test('normalises initials and refuses identifiers or contextual codes', () => {
  assert.equal(normalizeInitials(' ar '), 'AR');
  for (const value of ['AR-10A', '2026AR', '12345', 'AR@example.com', 'A R']) {
    assert.throws(() => normalizeInitials(value), error => error.code === 'invalid_display_code');
  }
});

test('permits only the approved Teaching contexts and status-only permission values', () => {
  assert.deepEqual(parseStudentContextInput({
    context_type: 'excursion',
    context_id: 'excursion_synthetic_1',
    permission_status: 'approved',
    valid_from: '2026-09-13'
  }), {
    context_type: 'excursion',
    context_id: 'excursion_synthetic_1',
    permission_status: 'approved',
    valid_from: '2026-09-13T00:00:00.000Z',
    valid_to: null
  });
  assert.throws(
    () => parseStudentContextInput({ context_type: 'lesson', context_id: 'lesson_1' }),
    error => error.code === 'invalid_context'
  );
  assert.throws(
    () => parseStudentContextInput({ context_type: 'class', context_id: 'class_1', permission_status: 'form.pdf' }),
    error => error.code === 'invalid_permission_status'
  );
});
