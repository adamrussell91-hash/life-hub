import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { TARGETS_CONFIG } from '../../netlify/functions/_shared/targets-config.mjs';

test('the server target-set mirror matches config/targets.yml exactly', () => {
  const configured = load(readFileSync(new URL('../../config/targets.yml', import.meta.url), 'utf8'));
  assert.deepEqual(TARGETS_CONFIG, configured);
});

test('resolveTargetsConfig reads private targets text and falls back to the neutral template', async () => {
  const { resolveTargetsConfig } = await import('../../netlify/functions/_shared/targets-config.mjs');
  const privateText = 'target_sets:\n  - valid_from: \'2020-01-01\'\n    calories: { movement: 1234 }\n';
  assert.equal(resolveTargetsConfig(privateText).target_sets[0].calories.movement, 1234);
  assert.equal(resolveTargetsConfig(null), TARGETS_CONFIG);
  assert.equal(resolveTargetsConfig('target_sets: [broken'), TARGETS_CONFIG);
  assert.equal(resolveTargetsConfig('target_sets: []\n'), TARGETS_CONFIG);
  const forecastOnly = resolveTargetsConfig('forecast:\n  body_composition: { weight_kg_min: 60 }\n', null, { forecastOnly: true });
  assert.equal(forecastOnly.forecast.body_composition.weight_kg_min, 60);
});
