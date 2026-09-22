import assert from 'node:assert/strict';
import test from 'node:test';
import { teachingEventsFromCurriculum } from '../../apps/life/js/shell/teaching-calendar.js';

test('curriculum scheduled lessons become calendar events with lesson titles', () => {
  const events = teachingEventsFromCurriculum({
    lessons: [{ id: 'lesson_1', title: 'Working memory' }],
    classes: [{ id: 'class_1', title: '12 English' }],
    scheduled_lessons: [
      { id: 'sched_1', lesson_id: 'lesson_1', class_id: 'class_1', date: '2026-08-12', start_time: '09:15', delivery_status: 'planned' },
      { id: 'sched_2', date: 'not-a-row' }
    ]
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].path, 'teaching:sched_1');
  assert.equal(events[0].record.type, 'scheduled_lesson');
  assert.equal(events[0].record.title, 'Working memory');
  assert.equal(events[0].record.class_title, '12 English');
  assert.equal(events[0].record.date, '2026-08-12');
  assert.equal(events[0].record.time, '09:15');
  assert.equal(events[0].record.duration_min, 60);
});
