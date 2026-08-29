import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimedPlanLocked,
  isWorkoutLockIn,
  looksLikeWorkoutPlan,
  shouldForceChadwickPlanProposal,
  shouldNudgeUnsavedWorkoutPlan
} from '../../js/core/workout-plan-detect.js';

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
  assert.equal(isWorkoutLockIn('let\'s do it'), true);
  assert.equal(isWorkoutLockIn('are the weights a little below my normal?'), false);
  assert.equal(isWorkoutLockIn('option b'), false);
});

test('looksLikeWorkoutPlan requires a numbered list plus loads', () => {
  assert.equal(looksLikeWorkoutPlan(PLAN), true);
  assert.equal(looksLikeWorkoutPlan('Welcome back, you absolute legend.'), false);
  assert.equal(looksLikeWorkoutPlan('1. Breathe\n2. Walk\n3. Stretch'), false);
});

test('claimedPlanLocked catches Chadwick narrating a save he never made', () => {
  assert.equal(claimedPlanLocked('Alright king, LOCKED IN. Full 10-movement Option B.'), true);
  assert.equal(claimedPlanLocked('Logging this as your plan now — go crush it.'), true);
  assert.equal(claimedPlanLocked('Want me to lock this in as planned, or shuffle any exercises first?'), false);
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
