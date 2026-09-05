import test from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateForLog,
  inferMealSlot,
  isWritableCalendarType,
  slugForLog
} from '../../apps/life/js/app/calendar-write.js';

test('slugForLog uses meal slot or type plus time', () => {
  assert.equal(slugForLog('meal', { meal: 'lunch' }), 'lunch');
  assert.equal(slugForLog('diary', { time: '09:15' }), 'diary-0915');
  assert.equal(slugForLog('workout', { time: '18:00' }), 'workout-1800');
});

test('inferMealSlot reads title or clock', () => {
  assert.equal(inferMealSlot('Breakfast', '21:00'), 'breakfast');
  assert.equal(inferMealSlot('Eggs', '08:00'), 'breakfast');
  assert.equal(inferMealSlot('Eggs', '13:00'), 'lunch');
  assert.equal(inferMealSlot('Eggs', '19:00'), 'dinner');
});

test('candidateForLog builds diary, workout, and meal payloads', () => {
  const diary = candidateForLog({ type: 'diary', title: 'Walked the dog', date: '2026-09-05', time: '07:30' });
  assert.equal(diary.type, 'diary');
  assert.equal(diary.notes, 'Walked the dog');
  assert.equal(diary.fields.source_agent, 'import');

  const workout = candidateForLog({ type: 'workout', title: 'Push', date: '2026-09-05', time: '09:00' });
  assert.equal(workout.fields.title, 'Push');
  assert.equal(workout.fields.status, 'planned');
  assert.deepEqual(workout.fields.exercises, []);

  const meal = candidateForLog({ type: 'meal', title: 'lunch', date: '2026-09-05', time: '12:30' });
  assert.equal(meal.fields.meal, 'lunch');
  assert.equal(meal.fields.calories, 0);
});

test('only life log types are writable from the calendar', () => {
  assert.equal(isWritableCalendarType('diary'), true);
  assert.equal(isWritableCalendarType('scheduled_lesson'), false);
});
