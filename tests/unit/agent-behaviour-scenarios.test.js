import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluateConstraintBehaviour } from '../../apps/life/js/core/context-integrity.js';

const here = dirname(fileURLToPath(import.meta.url));
const scenariosDir = join(here, '../fixtures/agent-scenarios');

function turnTexts(scenario) {
  assert.ok(scenario.turns?.length >= 1, 'scenario needs turns');
  return scenario.turns.map((turn, index) => {
    const event = turn.stream.find((entry) => entry.type === 'text');
    assert.ok(event, `scenario turn ${index} needs a text stream event`);
    return event.text;
  });
}

function hasStreamTheatre(scenario) {
  return scenario.turns.some((turn) => turn.stream.some((entry) => entry.type === 'status'));
}

async function loadScenarios() {
  const files = (await readdir(scenariosDir)).filter((name) => name.endsWith('.json'));
  assert.ok(files.length >= 3, 'expected mined scenario fixtures');
  const scenarios = [];
  for (const file of files) {
    scenarios.push(JSON.parse(await readFile(join(scenariosDir, file), 'utf8')));
  }
  return scenarios;
}

test('AI scenarios: constraint-present good replies pass behaviour fixtures', async () => {
  for (const scenario of await loadScenarios()) {
    assert.ok(scenario.turns.length >= 2, `${scenario.id} needs a multi-turn pushback`);
    assert.ok(hasStreamTheatre(scenario), `${scenario.id} needs stream theatre status`);
    for (const [index, text] of turnTexts(scenario).entries()) {
      const result = evaluateConstraintBehaviour({
        constraintPresent: true,
        recommendation: text,
        mustNotPatterns: scenario.behaviour.mustNotPatterns.map((pattern) => new RegExp(pattern, 'i'))
      });
      assert.equal(result.ok, true, `${scenario.id} turn ${index}`);
    }
  }
});

test('AI scenarios: unconstrained replies fail when the constraint is present', async () => {
  const badByAgent = {
    chadwick: 'Great — here is a heavy overhead press session with barbell military press.',
    vera: 'Tonight: garlic prawns and crab salad for a high-protein shellfish dinner.',
    brisket: 'All-out intervals — go hard today with max-effort repeats.'
  };
  for (const scenario of await loadScenarios()) {
    const bad = badByAgent[scenario.agent];
    assert.ok(bad, `missing unconstrained reply for ${scenario.agent}`);
    const result = evaluateConstraintBehaviour({
      constraintPresent: true,
      recommendation: bad,
      mustNotPatterns: scenario.behaviour.mustNotPatterns.map((pattern) => new RegExp(pattern, 'i'))
    });
    assert.equal(result.ok, false, scenario.id);
    assert.ok(result.violations.some((v) => v.type === 'must-not'), scenario.id);
  }
});

test('AI scenarios negative control: without constraint, unconstrained replies are allowed', async () => {
  const badByAgent = {
    chadwick: 'Great — here is a heavy overhead press session with barbell military press.',
    vera: 'Tonight: garlic prawns and crab salad for a high-protein shellfish dinner.',
    brisket: 'All-out intervals — go hard today with max-effort repeats.'
  };
  for (const scenario of await loadScenarios()) {
    assert.equal(scenario.negativeControl.context.constraintPresent, false, scenario.id);
    const result = evaluateConstraintBehaviour({
      constraintPresent: false,
      recommendation: badByAgent[scenario.agent],
      mustNotPatterns: scenario.behaviour.mustNotPatterns.map((pattern) => new RegExp(pattern, 'i'))
    });
    assert.equal(result.ok, true, scenario.id);
  }
});
