import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkoutTemplateProposal,
  saveWorkoutTemplateSchema
} from '../../netlify/functions/_shared/workout-template-agent.mjs';
import {
  classifyWriteTarget,
  validateProposeActionInput
} from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import {
  buildAgentTools,
  isPathAllowedForAgent,
  resetCapabilityCaches
} from '../../netlify/functions/_shared/capabilities/registry.mjs';
import { templatePathForTitle } from '../../netlify/functions/_shared/workout-templates.mjs';

test('save_workout_template is offered to Chadwick and allowlisted under templates', () => {
  resetCapabilityCaches();
  const names = buildAgentTools({ slug: 'chadwick', needsExerciseLibrary: true }).map(t => t.name);
  assert.ok(names.includes('save_workout_template'));
  assert.equal(saveWorkoutTemplateSchema().name, 'save_workout_template');
  const path = templatePathForTitle('Chest and Curls');
  assert.equal(isPathAllowedForAgent('chadwick', path, { mode: 'write' }), true);
  assert.equal(classifyWriteTarget(path).store, 'github');
});

test('buildWorkoutTemplateProposal writes template markdown for Confirm', () => {
  const built = buildWorkoutTemplateProposal({
    summary: 'Save chest template',
    title: 'Chest and Curls',
    source_session_date: '2026-07-30',
    session_kind: 'strength',
    exercises: [{
      name: 'Cable press',
      sets: [{ reps: 10, weight_kg: 40, cable_type: 'constant_force' }]
    }]
  });
  assert.equal(built.ok, true);
  assert.equal(built.path, 'data/fitness/templates/chest-and-curls.md');
  assert.match(built.proposal.writes[0].content, /workout_template/);
  assert.match(built.proposal.writes[0].content, /Cable press/);
  const validated = validateProposeActionInput(built.proposal, { agentSlug: 'chadwick' });
  assert.equal(validated.ok, true, validated.error);
});

test('buildWorkoutTemplateProposal resolves from_session and rejects empty exercises', () => {
  const built = buildWorkoutTemplateProposal({
    summary: 'Save from last',
    title: 'Pull Day',
    from_session: { date: '2026-07-28', title: 'Pull' }
  }, {
    workoutRecords: [{
      status: 'completed',
      date: '2026-07-28',
      title: 'Pull Pump',
      session_kind: 'strength',
      exercises: [{ name: 'Row', sets: [{ reps: 8, weight_kg: 50, cable_type: 'constant_force' }] }]
    }]
  });
  assert.equal(built.ok, true);
  assert.match(built.proposal.writes[0].content, /Row/);

  assert.equal(buildWorkoutTemplateProposal({
    summary: 'Nope',
    title: 'Empty'
  }).error, 'exercises_required');
});
