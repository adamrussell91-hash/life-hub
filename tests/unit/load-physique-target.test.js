import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPhysiqueTarget } from '../../netlify/functions/_shared/load-physique-target.mjs';

test('loads the checked-in physique target config', () => {
  const target = loadPhysiqueTarget();
  assert.equal(typeof target.shoulder_waist_ratio, 'number');
  assert.equal(typeof target.body_fat_pct, 'number');
  assert.ok(target.shoulder_waist_ratio > 1);
});

test('parses shoulder_waist_ratio and body_fat_pct from YAML', () => {
  const target = loadPhysiqueTarget({
    readFileSyncImpl: () => 'shoulder_waist_ratio: 1.65\nbody_fat_pct: 9\n'
  });
  assert.equal(target.shoulder_waist_ratio, 1.65);
  assert.equal(target.body_fat_pct, 9);
});

test('falls back to safe defaults when the file cannot be read', () => {
  const target = loadPhysiqueTarget({
    readFileSyncImpl: () => { throw new Error('ENOENT'); }
  });
  assert.equal(target.shoulder_waist_ratio, 1.6);
  assert.equal(target.body_fat_pct, 8);
});

test('falls back to safe defaults when the YAML is malformed or values are non-numeric', () => {
  const target = loadPhysiqueTarget({ readFileSyncImpl: () => 'shoulder_waist_ratio: [broken' });
  assert.equal(target.shoulder_waist_ratio, 1.6);
  assert.equal(target.body_fat_pct, 8);

  const target2 = loadPhysiqueTarget({ readFileSyncImpl: () => 'shoulder_waist_ratio: not-a-number\nbody_fat_pct: 9' });
  assert.equal(target2.shoulder_waist_ratio, 1.6);
  assert.equal(target2.body_fat_pct, 9);
});
