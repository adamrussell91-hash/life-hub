import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyEventsFromRow } from '../../scripts/import-notion-history.mjs';

function measurementsEvent(row) {
  const events = bodyEventsFromRow(row);
  return events.find(e => e.record.type === 'measurements');
}

test('bodyEventsFromRow keeps right arm flexed and relaxed separate', () => {
  const event = measurementsEvent({
    Date: '2026-01-27',
    'Right Arm Flexed (cm)': '42',
    'Right Arm Relaxed (cm)': '36'
  });
  assert.ok(event);
  assert.equal(event.record.right_arm_flexed, 42);
  assert.equal(event.record.right_arm_relaxed, 36);
  assert.equal(event.record.right_arm, undefined);
});

test('bodyEventsFromRow averages both calves when present', () => {
  const event = measurementsEvent({
    Date: '2026-01-27',
    'Right Calf (cm)': '39',
    'Left Calf (cm)': '38'
  });
  assert.ok(event);
  assert.equal(event.record.calves, 38.5);
});
