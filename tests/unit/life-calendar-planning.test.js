import assert from 'node:assert/strict';
import test from 'node:test';
import {
  tasksEventsFromTasks,
  tasksEventsFromWorkBlocks,
  protectedBackgroundFromWindows
} from '../../apps/life/js/shell/tasks-calendar.js';
import { buildCalendarModel, eventBrief, eventDetailTitle } from '../../apps/life/js/app/calendar-model.js';

test('tasksEventsFromWorkBlocks emits timed work_block events', () => {
  const events = tasksEventsFromWorkBlocks([
    {
      id: 'wb1',
      title: 'Deep marking',
      date: '2026-09-08',
      start_time: '09:00',
      duration_minutes: 90,
      status: 'confirmed',
      depth: 'deep'
    },
    {
      id: 'wb2',
      title: 'Cancelled',
      date: '2026-09-08',
      start_time: '11:00',
      duration_minutes: 30,
      status: 'cancelled'
    }
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].record.type, 'work_block');
  assert.equal(events[0].record.time, '09:00');
  assert.equal(events[0].record.duration_min, 90);
});

test('protected backgrounds stay as spans not chips', () => {
  const spans = protectedBackgroundFromWindows('2026-09-08', [
    { start: '12:00', end: '13:00', label: 'Lunch' }
  ]);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].kind, 'protected');
  assert.equal(spans[0].start, '12:00');
});

test('calendar model keeps protected backgrounds and work_block briefs', () => {
  const taskEvents = tasksEventsFromTasks([
    { id: 't1', title: 'Deadline', due_date: '2026-09-08', status: 'open' }
  ]);
  const workEvents = tasksEventsFromWorkBlocks([
    {
      id: 'wb1',
      title: 'Ghost plan',
      date: '2026-09-08',
      start_time: '14:00',
      duration_minutes: 60,
      status: 'proposed',
      ghost: true,
      depth: 'shallow'
    }
  ]);
  const model = buildCalendarModel({
    events: [...taskEvents, ...workEvents],
    date: '2026-09-08',
    selectedDate: '2026-09-08',
    planningLens: true,
    mission: { outcomes: 'Not set', capacity: 'Not set' },
    protectedWindows: [{ date: '2026-09-08', start: '12:00', end: '13:00', label: 'Lunch' }]
  });
  assert.equal(model.planningLens, true);
  assert.equal(model.mission.outcomes, 'Not set');
  assert.equal(model.weekDays.find((d) => d.date === '2026-09-08')?.protected?.length, 1);
  const work = model.dayEvents.find((e) => e.type === 'work_block');
  assert.ok(work);
  assert.equal(work.ghost, true);
  assert.match(eventBrief({ record: workEvents[0].record, body: '' }), /Work block/);
  assert.equal(eventDetailTitle(workEvents[0].record), 'Ghost plan');
});
