import test from 'node:test';
import assert from 'node:assert/strict';
import {
  spacedDuplicateCandidates,
  defaultTimeForRecord,
  shouldDemoteEmptyStrength,
  repairRecordFrontmatter
} from '../../scripts/lib/repair-notion-import.mjs';

test('spacedDuplicateCandidates maps Mac " 2" dupes to canonical siblings', () => {
  assert.deepEqual(
    spacedDuplicateCandidates('2026-02-11-breakfast 2.md'),
    ['2026-02-11-breakfast.md', '2026-02-11-breakfast-2.md']
  );
  assert.equal(spacedDuplicateCandidates('2026-02-11-breakfast.md'), null);
});

test('defaultTimeForRecord uses 12:00 for body and 07:00 for workouts', () => {
  assert.equal(defaultTimeForRecord({ type: 'measurements' }), '12:00');
  assert.equal(defaultTimeForRecord({ type: 'composition' }), '12:00');
  assert.equal(defaultTimeForRecord({ type: 'weight' }), '12:00');
  assert.equal(defaultTimeForRecord({ type: 'workout' }), '07:00');
});

test('shouldDemoteEmptyStrength only for completed strength-like with no usable sets', () => {
  assert.equal(shouldDemoteEmptyStrength({
    type: 'workout', status: 'completed', session_kind: 'strength', exercises: []
  }), true);
  assert.equal(shouldDemoteEmptyStrength({
    type: 'workout', status: 'completed', session_kind: 'strength',
    exercises: [{ name: 'Bench', sets: [] }]
  }), true);
  assert.equal(shouldDemoteEmptyStrength({
    type: 'workout', status: 'completed', session_kind: 'strength',
    exercises: [{ name: 'Bench', sets: [{ reps: 8, weight_kg: 40, cable_type: 'none' }] }]
  }), false);
  assert.equal(shouldDemoteEmptyStrength({
    type: 'workout', status: 'planned', session_kind: 'strength', exercises: []
  }), false);
  assert.equal(shouldDemoteEmptyStrength({
    type: 'workout', status: 'completed', session_kind: 'walk',
    exercises: [], duration_min: 30
  }), false);
});

test('repairRecordFrontmatter adds time, fixes stamps, and demotes empty strength', () => {
  const { record, changed } = repairRecordFrontmatter({
    schema_version: 1,
    id: 'notion-x',
    type: 'workout',
    date: '2026-03-29',
    created_at: '2026-03-29T12:00:00+10:00',
    updated_at: '2026-03-29T12:00:00+10:00',
    source: 'notion_import',
    title: 'Empty session',
    session_kind: 'strength',
    day_type: 'workout_30',
    status: 'completed',
    recovery_flag_next_day: false,
    exercises: [],
    pain_flags: []
  });
  assert.equal(changed, true);
  assert.equal(record.time, '07:00');
  assert.equal(record.created_at, '2026-03-29T07:00:00+11:00');
  assert.equal(record.updated_at, '2026-03-29T07:00:00+11:00');
  assert.equal(record.status, 'planned');
});

test('repairRecordFrontmatter is a no-op when already valid shape', () => {
  const input = {
    schema_version: 1,
    id: 'notion-y',
    type: 'measurements',
    date: '2026-04-08',
    time: '12:00',
    created_at: '2026-04-08T12:00:00+10:00',
    updated_at: '2026-04-08T12:00:00+10:00',
    source: 'notion_import',
    chest: 99
  };
  const { changed } = repairRecordFrontmatter(input);
  assert.equal(changed, false);
});
