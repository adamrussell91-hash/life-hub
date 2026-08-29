import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRecordForLog } from '../../netlify/functions/_shared/persist-log.mjs';

test('describeRecordForLog names a medical visit by title', () => {
  assert.equal(
    describeRecordForLog({ type: 'medical', title: 'GP review' }),
    'Logged medical visit: GP review.'
  );
});

test('describeRecordForLog uses a human day-type label for workouts, not raw workout_30', () => {
  assert.equal(
    describeRecordForLog({
      type: 'workout',
      day_type: 'workout_30',
      title: 'Biceps and Boobs, 20 mins',
      duration_min: 20
    }),
    'Logged a 30-min Workout session (Biceps and Boobs, 20 mins).'
  );
  assert.equal(
    describeRecordForLog({ type: 'workout', day_type: 'workout_45_60', duration_min: 50 }),
    'Logged a 45–60 min Workout session (50 mins).'
  );
});
