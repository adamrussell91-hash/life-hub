import test from 'node:test';
import assert from 'node:assert/strict';
import { nextLessonFromCurriculum, todaysLessonsFromCurriculum } from '../../apps/life/js/shell/teaching-today.js';

const CURRICULUM = {
  classes: [
    { id: 'class_1', title: 'Year 10 English', code: '10ENG' },
    { id: 'class_2', title: 'Year 8 Maths', code: '8MAT' }
  ],
  lessons: [
    { id: 'lesson_1', title: 'Analysing belonging' },
    { id: 'lesson_2', title: 'Fractions review' }
  ],
  scheduled_lessons: [
    { id: 'sched_1', class_id: 'class_2', lesson_id: 'lesson_2', date: '2026-09-15', start_time: '08:45', schedule_order: 1, delivery_status: 'planned' },
    { id: 'sched_2', class_id: 'class_1', lesson_id: 'lesson_1', date: '2026-09-15', start_time: '09:40', schedule_order: 2, delivery_status: 'planned' },
    { id: 'sched_3', class_id: 'class_1', lesson_id: 'lesson_1', date: '2026-09-15', schedule_order: 3, delivery_status: 'planned' },
    { id: 'sched_cancelled', class_id: 'class_1', lesson_id: 'lesson_1', date: '2026-09-15', start_time: '13:00', schedule_order: 4, delivery_status: 'cancelled' },
    { id: 'sched_other_day', class_id: 'class_1', lesson_id: 'lesson_1', date: '2026-09-16', start_time: '09:00', schedule_order: 1, delivery_status: 'planned' }
  ]
};

test('filters to the given date, drops cancelled/skipped, and orders timed lessons before untimed ones', () => {
  const lessons = todaysLessonsFromCurriculum(CURRICULUM, { date: '2026-09-15', nowMinutes: 0 });
  assert.deepEqual(lessons.map(item => item.id), ['sched_1', 'sched_2', 'sched_3']);
});

test('resolves class title and lesson title from the curriculum payload', () => {
  const [first] = todaysLessonsFromCurriculum(CURRICULUM, { date: '2026-09-15', nowMinutes: 0 });
  assert.equal(first.classTitle, 'Year 8 Maths');
  assert.equal(first.lessonTitle, 'Fractions review');
  assert.equal(first.startTime, '08:45');
});

test('marks lessons before now as past and the first remaining one as next', () => {
  const lessons = todaysLessonsFromCurriculum(CURRICULUM, { date: '2026-09-15', nowMinutes: 9 * 60 });
  const byId = Object.fromEntries(lessons.map(item => [item.id, item]));
  assert.equal(byId.sched_1.isPast, true);
  assert.equal(byId.sched_1.isNext, false);
  assert.equal(byId.sched_2.isPast, false);
  assert.equal(byId.sched_2.isNext, true);
  assert.equal(byId.sched_3.isNext, false);
});

test('an untimed lesson can be next when every timed lesson has already passed', () => {
  const lessons = todaysLessonsFromCurriculum(CURRICULUM, { date: '2026-09-15', nowMinutes: 23 * 60 });
  const untimed = lessons.find(item => item.id === 'sched_3');
  assert.equal(untimed.isNext, true);
});

test('an empty day returns an empty list, not an error', () => {
  assert.deepEqual(todaysLessonsFromCurriculum(CURRICULUM, { date: '2026-01-01', nowMinutes: 0 }), []);
  assert.deepEqual(todaysLessonsFromCurriculum(null, { date: '2026-01-01' }), []);
});

test('nextLessonFromCurriculum returns the single next lesson or null', () => {
  const next = nextLessonFromCurriculum(CURRICULUM, { date: '2026-09-15', nowMinutes: 9 * 60 });
  assert.equal(next.id, 'sched_2');
  assert.equal(nextLessonFromCurriculum(CURRICULUM, { date: '2026-01-01' }), null);
});
