import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCalendarModel,
  eventBrief,
  eventDetailTitle,
  eventsForDate,
  monthGridRange,
  resolveCalendarDayClick,
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

test('eventBrief summarises each domain in one line', () => {
  assert.equal(
    eventBrief({ record: { type: 'meal', protein_g: 32, calories: 450 } }),
    '32g protein · 450 kcal'
  );
  assert.equal(
    eventBrief({ record: { type: 'workout', duration_min: 45, status: 'completed' } }),
    '45 min · completed'
  );
  assert.equal(
    eventBrief({ record: { type: 'skincare', routine: 'am' } }),
    'AM routine'
  );
  assert.equal(
    eventBrief({ record: { type: 'skincare', routine: 'pm' }, body: 'Procedure: Laser.' }),
    'Procedure'
  );
  assert.equal(
    eventBrief({ record: { type: 'weight', weight_kg: 82.4 } }),
    '82.4 kg'
  );
  assert.equal(
    eventBrief({ record: { type: 'composition', weight_kg: 82, body_fat_pct: 18.5 } }),
    '82 kg · 18.5% BF'
  );
  assert.equal(
    eventBrief({ record: { type: 'measurements', waist: 84, chest: 102 } }),
    'waist 84 · chest 102'
  );
  assert.equal(
    eventBrief({ record: { type: 'diary', mood: 'good', energy: 'medium', mood_score: 7 } }),
    'good · medium energy · score 7'
  );
  assert.equal(
    eventBrief({ record: { type: 'sleep', duration_h: 7.5 } }),
    '7.5 h sleep'
  );
});

test('eventsForDate includes brief and category affordance', () => {
  const rows = eventsForDate([
    { record: { type: 'meal', date: '2026-08-05', meal: 'lunch', protein_g: 40, calories: 520 }, body: '', path: 'a' }
  ], '2026-08-05');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].brief, '40g protein · 520 kcal');
  assert.deepEqual(rows[0].categories, ['nutrition']);
});

test('resolveCalendarDayClick toggles same day and expands other days', () => {
  assert.deepEqual(resolveCalendarDayClick(null, '2026-08-05'), {
    selectedDate: '2026-08-05',
    expandedDate: '2026-08-05'
  });
  assert.deepEqual(resolveCalendarDayClick('2026-08-05', '2026-08-05'), {
    selectedDate: '2026-08-05',
    expandedDate: null
  });
  assert.deepEqual(resolveCalendarDayClick('2026-08-05', '2026-08-06'), {
    selectedDate: '2026-08-06',
    expandedDate: '2026-08-06'
  });
});
