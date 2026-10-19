// tests/unit/problem-solver-steps.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOK_STEP_IDS, stepPlan, planStep, firstStep, nextStepAfter, stepName, defaultToolFor } from '../../packages/problem-solver/steps.mjs';
import { MODELS } from '../../packages/problem-solver/models.mjs';

test('book steps follow the seven-step process, plus the TRIZ contradiction step', () => {
  assert.deepEqual(BOOK_STEP_IDS, ['define', 'analyse', 'devise', 'decide', 'implement', 'improve', 'document', 'contradiction']);
});

test('seven step plan is one plan step per book step, in order', () => {
  assert.deepEqual(stepPlan('seven_step').map((s) => [s.step, s.book, s.extra]), [
    ['define', ['define'], false], ['analyse', ['analyse'], false], ['devise', ['devise'], false], ['decide', ['decide'], false],
    ['implement', ['implement'], false], ['improve', ['improve'], false], ['document', ['document'], false]
  ]);
});

test('polya maps devise to devise then decide tools, evaluate to improve, document as an extra', () => {
  assert.deepEqual(stepPlan('polya').map((s) => [s.step, s.book, s.extra]), [
    ['identify', ['define'], false], ['devise', ['devise', 'decide'], false], ['implement', ['implement'], false],
    ['evaluate', ['improve'], false], ['document', ['document'], true]
  ]);
});

test('triz maps general problem to the contradiction step and offers three extras', () => {
  assert.deepEqual(stepPlan('triz').map((s) => [s.step, s.book, s.extra]), [
    ['specific_problem', ['define'], false], ['general_problem', ['contradiction'], false], ['general_solution', ['devise'], false],
    ['specific_solution', ['decide'], false], ['implement', ['implement'], true], ['improve', ['improve'], true], ['document', ['document'], true]
  ]);
});

test('every non-extra plan step is a step of its model', () => {
  for (const id of Object.keys(MODELS)) {
    const ids = MODELS[id].steps.map((s) => s.id);
    for (const s of stepPlan(id).filter((s) => !s.extra)) assert.ok(ids.includes(s.step), `${id}.${s.step}`);
  }
});

test('lookups', () => {
  assert.equal(firstStep('polya'), 'identify');
  assert.equal(nextStepAfter('seven_step', 'define'), 'analyse');
  assert.equal(nextStepAfter('seven_step', 'document'), null);
  assert.equal(nextStepAfter('triz', 'specific_solution'), 'implement');
  assert.equal(planStep('triz', 'general_problem').book[0], 'contradiction');
  assert.equal(planStep('seven_step', 'nope'), null);
  assert.equal(stepName('seven_step', 'analyse'), 'Analyse');
  assert.equal(stepName('polya', 'document'), 'Document');
  assert.equal(stepName('triz', 'general_problem'), 'General problem');
});

test('default tool is the first registered tool for the plan step', () => {
  assert.equal(defaultToolFor('seven_step', 'define'), 'five_whys');
  assert.equal(defaultToolFor('triz', 'general_problem'), 'contradiction');
});
