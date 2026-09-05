import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlannedCandidateFromTemplate } from '../../apps/life/js/app/template-to-planned.js';

test('buildPlannedCandidateFromTemplate copies prescription into a planned workout', () => {
  const built = buildPlannedCandidateFromTemplate({
    title: 'Chest and Curls',
    session_kind: 'strength',
    day_type: 'workout_45_60',
    focus: ['chest', 'arms'],
    exercises: [
      {
        name: 'Cable Fly',
        sets: [{ reps: 10, weight_kg: 20, cable_type: 'constant_force' }]
      }
    ]
  }, { date: '2026-08-07', time: '07:30' });

  assert.equal(built.candidate.type, 'workout');
  assert.equal(built.candidate.date, '2026-08-07');
  assert.equal(built.candidate.fields.status, 'planned');
  assert.equal(built.candidate.fields.title, 'Chest and Curls');
  assert.equal(built.candidate.fields.session_kind, 'strength');
  assert.equal(built.candidate.fields.day_type, 'workout_45_60');
  assert.deepEqual(built.candidate.fields.focus, ['chest', 'arms']);
  assert.equal(built.candidate.fields.exercises[0].name, 'Cable Fly');
  assert.equal(built.candidate.fields.exercises[0].sets[0].cable_type, 'constant_force');
  assert.equal(built.slug, 'workout-planned');
});

test('buildPlannedCandidateFromTemplate coerces none cable_type to constant force', () => {
  const built = buildPlannedCandidateFromTemplate({
    title: 'Pull',
    exercises: [{ name: 'Pull Up', sets: [{ reps: 8, weight_kg: 0, cable_type: 'none' }] }]
  }, { date: '2026-08-07' });
  assert.equal(built.candidate.fields.exercises[0].sets[0].cable_type, 'constant_force');
});
