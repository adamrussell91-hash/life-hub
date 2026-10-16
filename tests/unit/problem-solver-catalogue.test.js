// tests/unit/problem-solver-catalogue.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { SKILLS, SKILL_IDS, isSkillId } from '../../packages/problem-solver/skills.mjs';
import { MODELS, MODEL_IDS, defineStepOf } from '../../packages/problem-solver/models.mjs';

test('twelve skills, each with a glyph file', async () => {
  assert.equal(SKILLS.length, 12);
  const files = (await readdir(new URL('../../packages/problem-solver/glyphs/skills/', import.meta.url)))
    .map((f) => f.replace(/\.svg$/, ''))
    .sort();
  assert.deepEqual([...SKILL_IDS].sort(), files);
  assert.ok(isSkillId('metacognition'));
  assert.ok(!isSkillId('vibes'));
});

test('three models, each with a define step', () => {
  assert.deepEqual(MODEL_IDS, ['seven_step', 'polya', 'triz']);
  assert.equal(MODELS.seven_step.steps.length, 7);
  assert.equal(defineStepOf('seven_step'), 'define');
  assert.equal(defineStepOf('polya'), 'identify');
  assert.equal(defineStepOf('triz'), 'specific_problem');
});
