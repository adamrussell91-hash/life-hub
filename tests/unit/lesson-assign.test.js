import test from 'node:test';
import assert from 'node:assert/strict';
import { hasStarted, isSideLesson, lessonsForStudent, routeRoleOf } from '../../netlify/functions/_shared/lesson-assign.mjs';

const lessons = [
  { id: 'core1', title: 'Core' },
  { id: 'ext1', title: 'Extension', route_role: 'extension' },
  { id: 'sup1', title: 'Support', route_role: 'support' },
  { id: 'opt1', title: 'Optional', route_role: 'optional' },
  { id: 'tut1', title: 'Tutorial', route_role: 'support', pedagogical_mode: 'tutorial', tutorial: { class_id: 'c1', groups: [{ students: ['st3'] }] } }
];
const view = { markbook: { took: { st1: ['ext1'] } }, quizzes: [{ lesson_id: 'sup1', started: ['st2'], scores: {} }], work: [{ lesson_id: 'opt1', students: { st4: {} } }] };
const ids = (student, done = {}, cls = 'c1') => lessonsForStudent(lessons, view, done, student, cls).map((l) => l.id);

test('a student with no ticks sees only core lessons', () => {
  assert.deepEqual(ids('st9'), ['core1']);
});

test('a tick puts a side lesson on that student\'s map and nobody else\'s', () => {
  assert.deepEqual(ids('st1'), ['core1', 'ext1']);
  assert.ok(!ids('st9').includes('ext1'));
});

test('a student who has started a side lesson keeps it, unticked', () => {
  assert.ok(ids('st2').includes('sup1'), 'quiz go');
  assert.ok(ids('st4').includes('opt1'), 'saved writing');
  assert.ok(ids('st5', { ext1: { at: 'x', via: 'tick' } }).includes('ext1'), 'done record');
});

test('tutorial group members see their tutorial, in that class only', () => {
  assert.ok(ids('st3').includes('tut1'));
  assert.ok(!ids('st3', {}, 'c2').includes('tut1'));
});

test('an older side lesson takes its role from the unit map stop; its own role wins', () => {
  const unit = { blocks: [{ block_type: 'curriculum_lines', content: { version: 2, rail_stops: [{ lesson_id: 'a', kind: 'extension' }, { lesson_id: 'b', kind: 'stop' }] } }] };
  assert.equal(routeRoleOf(unit, { id: 'a' }), 'extension');
  assert.equal(isSideLesson(unit, { id: 'a', route_role: 'core' }), false);
  assert.equal(isSideLesson(unit, { id: 'b' }), false);
  assert.equal(isSideLesson(null, { id: 'c', route_role: 'optional' }), true);
});

test('hasStarted is false with no evidence', () => {
  assert.equal(hasStarted('st1', 'x', { quizzes: [], work: [], done: undefined }), false);
});
