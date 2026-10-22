// tests/unit/get-things-done-steps.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultToolFor, firstStep, nextStepAfter, stepName, stepPlan, stepServes, toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';
import { MODEL_IDS } from '../../packages/problem-solver/models.mjs';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { GEAR_SHIFTER_MODEL } from '../../packages/get-things-done/model.mjs';
import { CATALOGUE } from '../../packages/get-things-done/catalogue.mjs';

test('gear_shifter plans Explore, Commit and an extra Review', () => {
  assert.deepEqual(stepPlan('gear_shifter').map((s) => [s.step, s.extra]), [['explore', false], ['commit', false], ['review', true]]);
  assert.equal(firstStep('gear_shifter'), 'explore');
  assert.equal(nextStepAfter('gear_shifter', 'explore'), 'commit');
  assert.equal(stepName('gear_shifter', 'commit'), 'Commit');
  assert.ok(stepServes('gear_shifter', 'commit', 'implement'));
  assert.ok(stepServes('gear_shifter', 'review', 'improve'));
});

test('Explore offers only registered catalogue entries, in catalogue order, with no default', () => {
  const tools = toolsForPlanStep('gear_shifter', 'explore');
  assert.deepEqual(tools, CATALOGUE.map((e) => e.id).filter((id) => TOOLS[id]));
  assert.ok(tools.every((id) => id.startsWith('gt_')));
  assert.equal(defaultToolFor('gear_shifter', 'explore'), null);
});

test('Commit never offers another book’s settle tool', () => {
  assert.ok(toolsForPlanStep('gear_shifter', 'commit').every((id) => id.startsWith('gt_')));
});

test('Problem Solver never sees gear_shifter as a model it can choose', () => {
  assert.ok(!MODEL_IDS.includes('gear_shifter'));
  assert.equal(GEAR_SHIFTER_MODEL.id, 'gear_shifter');
});
