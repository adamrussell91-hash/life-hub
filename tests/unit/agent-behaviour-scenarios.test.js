import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluateConstraintBehaviour } from '../../apps/life/js/core/context-integrity.js';

const here = dirname(fileURLToPath(import.meta.url));
const scenarioPath = join(here, '../fixtures/agent-scenarios/chadwick-pain-overhead.json');

function replyText(scenario) {
  const event = scenario.turns[0].stream.find((entry) => entry.type === 'text');
  assert.ok(event, 'scenario needs a text stream event');
  return event.text;
}

test('AI scenario: constraint present → good reply passes behaviour fixture', async () => {
  const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'));
  const result = evaluateConstraintBehaviour({
    constraintPresent: true,
    recommendation: replyText(scenario),
    mustNotPatterns: scenario.behaviour.mustNotPatterns.map((pattern) => new RegExp(pattern, 'i'))
  });
  assert.equal(result.ok, true);
});

test('AI scenario: constraint present → unconstrained overhead press fails', async () => {
  const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'));
  const bad = evaluateConstraintBehaviour({
    constraintPresent: true,
    recommendation: 'Great — here is a heavy overhead press session with barbell military press.',
    mustNotPatterns: scenario.behaviour.mustNotPatterns.map((pattern) => new RegExp(pattern, 'i'))
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.violations.some((v) => v.type === 'must-not'));
});

test('AI scenario negative control: without constraint, overhead press is allowed', async () => {
  const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'));
  assert.equal(scenario.negativeControl.context.constraintPresent, false);
  const result = evaluateConstraintBehaviour({
    constraintPresent: false,
    recommendation: 'Great — here is a heavy overhead press session with barbell military press.',
    mustNotPatterns: scenario.behaviour.mustNotPatterns.map((pattern) => new RegExp(pattern, 'i'))
  });
  assert.equal(result.ok, true);
});
