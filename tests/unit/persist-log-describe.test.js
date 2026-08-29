import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRecordForLog } from '../../netlify/functions/_shared/persist-log.mjs';

test('describeRecordForLog names a medical visit by title', () => {
  assert.equal(
    describeRecordForLog({ type: 'medical', title: 'GP review' }),
    'Logged medical visit: GP review.'
  );
});

test('describeRecordForLog includes move count, duration, focus, and notes for workouts', () => {
  assert.equal(
    describeRecordForLog(
      {
        type: 'workout',
        day_type: 'workout_30',
        title: 'Biceps and Boobs, 20 mins',
        duration_min: 20,
        focus: ['chest', 'arms', 'mobility'],
        exercises: [{ name: 'a' }, { name: 'b' }, { name: 'c' }]
      },
      'Biceps and Boobs — AC clear, matched last loads'
    ),
    'Logged Biceps and Boobs, 20 mins (3 moves, 20 min, chest/arms/mobility) — Biceps and Boobs — AC clear, matched last loads.'
  );
  assert.equal(
    describeRecordForLog({ type: 'workout', day_type: 'workout_45_60', duration_min: 50 }),
    'Logged a 45–60 min Workout session (50 min).'
  );
});
