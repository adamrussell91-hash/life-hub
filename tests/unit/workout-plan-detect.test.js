import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimedPlanLocked,
  coerceChatWorkoutProposal,
  isWorkoutLockIn,
  looksLikeWorkoutActualsReport,
  looksLikeWorkoutPlan,
  shouldForceChadwickPlanProposal,
  shouldNudgeUnsavedWorkoutPlan
} from '../../apps/life/js/core/workout-plan-detect.js';

const PLAN = [
  "Here's the plan:",
  '1. Bar Press — Set 1: 10 reps x 30kg (cable: constant force)',
  '2. Bar Row — Set 1: 10 reps x 27kg (cable: constant force)',
  '3. Bar Squat — Set 1: 10 reps x 25kg (cable: none)',
  '4. Seated Curl — Set 1: 12 reps x 8kg (cable: constant force)'
].join('\n');

test('isWorkoutLockIn matches the phrases Adam actually used', () => {
  assert.equal(isWorkoutLockIn('ok lets put it into action'), true);
  assert.equal(isWorkoutLockIn('lock it in'), true);
  assert.equal(isWorkoutLockIn('lock it onto Fitness'), true);
  assert.equal(isWorkoutLockIn('lock this onto Fitness'), true);
  assert.equal(isWorkoutLockIn('let\'s do it'), true);
  assert.equal(isWorkoutLockIn('make the workout'), true);
  assert.equal(isWorkoutLockIn('is it ready to go?'), true);
  assert.equal(isWorkoutLockIn('ready to go'), true);
  assert.equal(isWorkoutLockIn('start the workout'), true);
  assert.equal(isWorkoutLockIn('log'), true);
  assert.equal(isWorkoutLockIn('Log!'), true);
  assert.equal(isWorkoutLockIn('log this'), true);
  assert.equal(isWorkoutLockIn('save workout'), true);
  assert.equal(isWorkoutLockIn('save the workout'), true);
  assert.equal(isWorkoutLockIn('are the weights a little below my normal?'), false);
  assert.equal(isWorkoutLockIn('option b'), false);
});

test('looksLikeWorkoutPlan requires a numbered list plus loads', () => {
  assert.equal(looksLikeWorkoutPlan(PLAN), true);
  assert.equal(looksLikeWorkoutPlan(PLAN.replaceAll('\n', ' ')), true);
  assert.equal(looksLikeWorkoutPlan('Welcome back, you absolute legend.'), false);
  assert.equal(looksLikeWorkoutPlan('1. Breathe\n2. Walk\n3. Stretch'), false);
});

test('claimedPlanLocked catches Chadwick narrating a save he never made', () => {
  assert.equal(claimedPlanLocked('Alright king, LOCKED IN. Full 10-movement Option B.'), true);
  assert.equal(claimedPlanLocked('Logging this as your plan now — go crush it.'), true);
  assert.equal(claimedPlanLocked('Locking it in now.'), true);
  assert.equal(claimedPlanLocked('Locking this in now with cues loaded for mid-session:'), true);
  assert.equal(claimedPlanLocked('Locking this onto Fitness.'), true);
  assert.equal(claimedPlanLocked('Let me get this actually saved as the plan for today with the superset pairing baked in.'), true);
  assert.equal(claimedPlanLocked('Want me to lock this in as planned, or shuffle any exercises first?'), false);
});

test('isWorkoutLockIn catches missing-plan complaints', () => {
  assert.equal(isWorkoutLockIn("It's not there."), true);
  assert.equal(isWorkoutLockIn('not on fitness'), true);
  assert.equal(isWorkoutLockIn("didn't save"), true);
  assert.equal(isWorkoutLockIn('where is the workout'), true);
});

test('shouldForceChadwickPlanProposal fires on lock-in even when this turn has no list', () => {
  assert.equal(shouldForceChadwickPlanProposal({
    userMessage: 'ok lets put it into action',
    assistantText: 'Alright king, LOCKED IN.',
    sawLogEntry: false
  }), true);
  assert.equal(shouldForceChadwickPlanProposal({
    userMessage: 'ok lets put it into action',
    assistantText: PLAN,
    sawLogEntry: true
  }), false);
});

test('shouldForceChadwickPlanProposal fires when he claims saved without a numbered list in the same turn', () => {
  assert.equal(shouldForceChadwickPlanProposal({
    userMessage: 'sounds good',
    assistantText: 'Locking this in now with cues loaded for mid-session:',
    sawLogEntry: false
  }), true);
});

test('shouldForceChadwickPlanProposal fires when he dumps a superset plan without claiming saved', () => {
  const pairing = [
    '1&2 superset: Bar Press / Cable Bar Wide Grip Curl',
    '3&4 superset: Reverse Grip Incline Bench Press / One Handle Arm Triceps'
  ].join('\n');
  assert.equal(shouldForceChadwickPlanProposal({
    userMessage: 'sounds good',
    assistantText: pairing,
    sawLogEntry: false
  }), true);
});

test('shouldForceChadwickPlanProposal also fires when he claims locked and dumps a plan', () => {
  assert.equal(shouldForceChadwickPlanProposal({
    userMessage: 'you changed it from 8 to 6',
    assistantText: `LOCKED IN\n${PLAN}`,
    sawLogEntry: false
  }), true);
});

test('shouldNudgeUnsavedWorkoutPlan is Chadwick-only and skips once a Confirm card arrived', () => {
  assert.equal(shouldNudgeUnsavedWorkoutPlan({
    agentSlug: 'chadwick',
    assistantText: PLAN,
    sawRecordProposal: false
  }), true);
  assert.equal(shouldNudgeUnsavedWorkoutPlan({
    agentSlug: 'chadwick',
    assistantText: 'Locking this in now with cues loaded for mid-session:',
    sawRecordProposal: false
  }), true);
  assert.equal(shouldNudgeUnsavedWorkoutPlan({
    agentSlug: 'chadwick',
    assistantText: PLAN,
    sawRecordProposal: true
  }), false);
  assert.equal(shouldNudgeUnsavedWorkoutPlan({
    agentSlug: 'brisket',
    assistantText: PLAN,
    sawRecordProposal: false,
    sawExerciseLibrarySaved: true
  }), false);
  assert.equal(shouldNudgeUnsavedWorkoutPlan({
    agentSlug: 'chadwick',
    assistantText: 'Checking the library.',
    sawRecordProposal: false,
    sawExerciseLibrarySaved: true
  }), true);
});

function workoutValidation(status) {
  return {
    valid: true,
    notes: '',
    record: {
      type: 'workout',
      title: 'The Full Send',
      status,
      date: '2026-09-05',
      exercises: [{ name: 'Bar Squat', sets: [{ reps: 10, weight_kg: 30 }] }]
    }
  };
}

test('looksLikeWorkoutActualsReport is only for a session Adam already finished', () => {
  assert.equal(looksLikeWorkoutActualsReport('I just finished the session'), true);
  assert.equal(looksLikeWorkoutActualsReport('here is what I actually lifted'), true);
  assert.equal(looksLikeWorkoutActualsReport('log actuals'), true);
  assert.equal(looksLikeWorkoutActualsReport('log'), false);
  assert.equal(looksLikeWorkoutActualsReport('save workout'), false);
  assert.equal(looksLikeWorkoutActualsReport('Logging protocol — status completed'), false);
});

test('coerceChatWorkoutProposal forces designed sessions to planned unless Adam reported actuals', () => {
  const designed = coerceChatWorkoutProposal(workoutValidation('completed'), { userMessage: 'save workout' });
  assert.equal(designed.record.status, 'planned');

  const logged = coerceChatWorkoutProposal(workoutValidation('completed'), { userMessage: 'Log' });
  assert.equal(logged.record.status, 'planned');

  const alreadyPlanned = coerceChatWorkoutProposal(workoutValidation('planned'), { userMessage: 'lock it in' });
  assert.equal(alreadyPlanned.record.status, 'planned');

  const actuals = coerceChatWorkoutProposal(workoutValidation('completed'), {
    userMessage: 'I just finished — here is what I actually lifted'
  });
  assert.equal(actuals.record.status, 'completed');

  const skipped = coerceChatWorkoutProposal({
    valid: true,
    record: { type: 'workout', status: 'skipped', date: '2026-09-05' }
  }, { userMessage: 'skipped today' });
  assert.equal(skipped.record.status, 'skipped');
});
