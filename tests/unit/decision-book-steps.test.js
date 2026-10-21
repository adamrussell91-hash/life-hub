// tests/unit/decision-book-steps.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultToolFor, firstStep, nextStepAfter, stepName, stepPlan, toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';
import { MODEL_IDS } from '../../packages/problem-solver/models.mjs';
import { DECISION_MODEL } from '../../packages/decision-book/model.mjs';
import { CATALOGUE_IDS } from '../../packages/decision-book/catalogue.mjs';

test('decision_book plans Explore, Decide and an extra Review', () => {
  assert.deepEqual(stepPlan('decision_book').map((s) => [s.step, s.extra]), [['explore', false], ['decide', false], ['review', true]]);
  assert.equal(firstStep('decision_book'), 'explore');
  assert.equal(nextStepAfter('decision_book', 'explore'), 'decide');
  assert.equal(stepName('decision_book', 'explore'), 'Explore');
  assert.equal(stepName('decision_book', 'review'), 'Review');
});

test('Explore offers every catalogue model in catalogue order, with no default', () => {
  assert.deepEqual(toolsForPlanStep('decision_book', 'explore'), [...CATALOGUE_IDS]);
  assert.equal(defaultToolFor('decision_book', 'explore'), null);
});

test('Problem Solver never sees decision_book as a model it can choose', () => {
  assert.ok(!MODEL_IDS.includes('decision_book'));
  assert.equal(DECISION_MODEL.id, 'decision_book');
});
