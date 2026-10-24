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

test('lessons dated with no period join the class period that day, or the all-day row; repeats show once', async () => {
  const { buildTidelineModel } = await import('../../apps/life/js/app/tideline-model.js');
  const events = teachingEventsFromCurriculum({
    lessons: [
      { id: 'finn', title: 'Finn' },
      { id: 'viva', title: 'Viva practice' },
      { id: 'pretest', title: 'Techniques pre-test' },
      { id: 'drafting', title: 'Drafting' }
    ],
    classes: [{ id: 'y12', title: 'Year 12' }, { id: 'y9', title: 'Year 9' }],
    scheduled_lessons: [
      { id: 'p2', lesson_id: 'finn', class_id: 'y12', date: '2026-10-23', start_time: '09:23', end_time: '10:16', period: '2' },
      { id: 'a', lesson_id: 'viva', class_id: 'y12', date: '2026-10-23' },
      { id: 'b', lesson_id: 'pretest', class_id: 'y12', date: '2026-10-23' },
      { id: 'b2', lesson_id: 'pretest', class_id: 'y12', date: '2026-10-23' },
      { id: 'c', lesson_id: 'drafting', class_id: 'y9', date: '2026-10-23' },
      { id: 'c2', lesson_id: 'drafting', class_id: 'y9', date: '2026-10-23' }
    ]
  });
  assert.deepEqual(events.map(event => event.record.id), ['p2', 'c']);
  const [slot, untimed] = events.map(event => event.record);
  assert.deepEqual(slot.also_lessons.map(lesson => lesson.title), ['Viva practice', 'Techniques pre-test']);
  assert.equal(untimed.all_day, true);
  assert.equal(untimed.time, undefined);
  assert.equal(untimed.session_count, undefined, 'a repeat save is not a second part');

  const day = buildTidelineModel({ events, week: ['2026-10-23'], today: '2026-10-23', nowHour: 9 }).days[0];
  assert.deepEqual(day.chips.filter(chip => chip.isClass).map(chip => chip.title), ['Finn']);
  assert.match(day.chips.find(chip => chip.title === 'Finn').meta, /P2 · .*also Viva practice, Techniques pre-test/);
  const row = day.due.find(due => due.title === 'Drafting');
  assert.equal(row.kind, 'allday');
  assert.equal(row.filterKey, 'classes');
});
