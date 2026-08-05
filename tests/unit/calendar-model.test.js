import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCalendarModel,
  eventDetailTitle,
  eventsForDate,
  monthGridRange,
  shiftYearMonth,
  yearMonthFromDate
} from '../../js/app/calendar-model.js';

test('yearMonth and shift helpers', () => {
  assert.equal(yearMonthFromDate('2026-08-05'), '2026-08');
  assert.equal(shiftYearMonth('2026-08', -1), '2026-07');
  assert.equal(shiftYearMonth('2026-01', -1), '2025-12');
});

test('monthGridRange pads to full Monday-Sunday weeks', () => {
  const range = monthGridRange('2026-08');
  assert.equal(range.first, '2026-08-01');
  assert.equal(range.last, '2026-08-31');
  assert.ok(range.start <= '2026-08-01');
  assert.ok(range.end >= '2026-08-31');
});

test('buildCalendarModel marks week/month and lists day events', () => {
  const events = [
    { record: { type: 'meal', date: '2026-08-05', meal: 'breakfast' }, body: 'Eggs', path: 'a' },
    { record: { type: 'workout', date: '2026-08-05', title: 'Chest' }, body: '', path: 'b' },
    { record: { type: 'skincare', date: '2026-08-04', routine: 'am' }, body: '', path: 'c' }
  ];
  const model = buildCalendarModel({
    events,
    date: '2026-08-05',
    selectedDate: '2026-08-05',
    viewMonth: '2026-08'
  });
  assert.equal(model.monthLabel.includes('2026'), true);
  assert.equal(model.weekDays.length, 7);
  assert.ok(model.monthDays.length >= 28);
  const selected = model.monthDays.find(day => day.date === '2026-08-05');
  assert.deepEqual(selected.categories.sort(), ['fitness', 'nutrition']);
  assert.equal(model.dayEvents.length, 2);
  assert.equal(model.dayEvents[0].title === 'breakfast' || model.dayEvents[1].title === 'breakfast', true);
});

test('eventDetailTitle covers core types', () => {
  assert.equal(eventDetailTitle({ type: 'meal', meal: 'lunch' }), 'lunch');
  assert.equal(eventDetailTitle({ type: 'workout', title: 'Pump' }), 'Pump');
  assert.equal(eventDetailTitle({ type: 'skincare', routine: 'pm' }), 'Skincare · PM');
  assert.equal(eventDetailTitle({ type: 'skincare', routine: 'pm' }, 'Procedure: Laser.'), 'Laser');
});

test('eventsForDate returns empty for quiet days', () => {
  assert.deepEqual(eventsForDate([], '2026-08-05'), []);
});
