import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { readFile } from 'node:fs/promises';
import { getDayTargets, resolveTargetSet } from '../../js/core/targets.js';

const config = load(await readFile(new URL('../../config/targets.yml', import.meta.url), 'utf8'));

test('resolves the greatest valid_from not after the date', () => {
  assert.equal(resolveTargetSet(config, '2026-07-31').valid_from, '2020-01-01');
  assert.throws(() => resolveTargetSet(config, '2019-12-31'), /No target set/);
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
