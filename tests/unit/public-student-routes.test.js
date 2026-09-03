import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';

test('published Teaching student APIs are public', () => {
  assert.equal(isPublicStudentApi('GET', '/api/published/lessons/week-1'), true);
  assert.equal(isPublicStudentApi('GET', '/api/published/units/unit-1'), true);
  assert.equal(isPublicStudentApi('GET', '/api/published/classes/11psycha'), true);
  assert.equal(isPublicStudentApi('GET', '/api/media/file-1/file'), true);
  assert.equal(isPublicStudentApi('POST', '/api/html-app-ai'), true);
});

test('operator APIs are not public student routes', () => {
  assert.equal(isPublicStudentApi('POST', '/api/auth'), false);
  assert.equal(isPublicStudentApi('GET', '/api/repo/manifest'), false);
  assert.equal(isPublicStudentApi('GET', '/api/curriculum'), false);
  assert.equal(isPublicStudentApi('GET', '/api/lessons/week-1'), false);
  assert.equal(isPublicStudentApi('GET', '/api/search'), false);
  assert.equal(isPublicStudentApi('POST', '/api/lessons/week-1/publish'), false);
  assert.equal(isPublicStudentApi('POST', '/api/media/upload'), false);
  assert.equal(isPublicStudentApi('POST', '/api/classes/class-1/schedule-unit'), false);
  assert.equal(isPublicStudentApi('POST', '/api/clare'), false);
});
