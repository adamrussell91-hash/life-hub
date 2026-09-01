import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { readFile } from 'node:fs/promises';
import { getDayTargets, resolveTargetSet } from '../../apps/life/js/core/targets.js';

const config = load(await readFile(new URL('../../config/targets.yml', import.meta.url), 'utf8'));

test('resolves the greatest valid_from not after the date', () => {
  const unsorted = {
    target_sets: [
      { valid_from: '2025-06-01', marker: 'middle' },
      { valid_from: '2030-01-01', marker: 'latest' },
      { valid_from: '2020-01-01', marker: 'earliest' }
    ]
  };
  const before = structuredClone(unsorted);

  assert.equal(resolveTargetSet(unsorted, '2020-01-01').marker, 'earliest');
  assert.equal(resolveTargetSet(unsorted, '2025-05-31').marker, 'earliest');
  assert.equal(resolveTargetSet(unsorted, '2025-06-01').marker, 'middle');
  assert.equal(resolveTargetSet(unsorted, '2029-12-31').marker, 'middle');
  assert.equal(resolveTargetSet(unsorted, '2030-01-01').marker, 'latest');
  assert.throws(() => resolveTargetSet(unsorted, '2019-12-31'), /No target set/);
  assert.deepEqual(unsorted, before);
});

test('applies recovery to the following day targets without changing day type', () => {
  assert.deepEqual(getDayTargets(config, '2026-07-31', 'workout_45_60', true), {
    calories: 2400,
    protein_g: 140,
    fat_ceiling_g: 50,
    sodium_ceiling_mg: 2000,
    calcium_target_mg: 1000,
    polyphenol_daily_aim: 10,
    meal_protein_g: { breakfast: 30, lunch: 30, dinner: 40, snack: 20, minimum: 25 }
  });
});

test('rejects an unknown day type with a typed error before calculating calories', () => {
  assert.throws(
    () => getDayTargets(config, '2026-07-31', 'ultra_marathon', true),
    error => error instanceof TypeError && /day type/i.test(error.message)
  );
});
