import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hoursToDueTime,
  layoutTimedBlocks,
  parseGoToDate,
  parseTimeHours,
  snapHours,
  splitDayItems
} from '../../packages/design-kit/js/time-grid.js';

test('parseTimeHours and snap', () => {
  assert.equal(parseTimeHours('09:30'), 9.5);
  assert.equal(parseTimeHours('all day'), null);
  assert.equal(hoursToDueTime(9.25), '09:15');
  assert.equal(snapHours(9.2), 9.25);
});

test('splitDayItems keeps untimed in all day', () => {
  const { timed, allDay } = splitDayItems([
    { title: 'Breakfast', time: '08:00' },
    { title: 'Note', time: null }
  ]);
  assert.equal(timed.length, 1);
  assert.equal(allDay.length, 1);
});

test('layoutTimedBlocks assigns overlap lanes', () => {
  const blocks = layoutTimedBlocks([
    { title: 'A', time: '09:00', durationMin: 60 },
    { title: 'B', time: '09:30', durationMin: 60 }
  ]);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].lanes, 2);
  assert.notEqual(blocks[0].lane, blocks[1].lane);
});

test('parseGoToDate accepts ISO, AU, and today', () => {
  const today = new Date(2026, 8, 5);
  assert.equal(parseGoToDate('2026-09-05', today)?.getDate(), 5);
  assert.equal(parseGoToDate('05/09/26', today)?.getMonth(), 8);
  assert.equal(parseGoToDate('today', today)?.getDate(), 5);
});
