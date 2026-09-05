import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { load } from 'js-yaml';
import { parseEventDocument } from '../../apps/life/js/core/records.js';

const exec = promisify(execFile);

test('fixture validator reports the approved Home sample', async () => {
  const { stdout } = await exec(process.execPath, ['scripts/validate-fixtures.mjs']);
  const result = JSON.parse(stdout);
  assert.deepEqual(result, {
    files: 7, valid: 7, invalid: 0,
    home: { calories: 1130, protein_g: 80, fat_g: 27, day_type: 'workout_30', workout_streak: 1 }
  });
});

test('canonical breakfast fixture preserves the complete section 15.4 meal', async () => {
  const path = 'data/nutrition/2026/07/2026-07-30-breakfast.md';
  const text = await readFile(`tests/fixtures/valid/${path}`, 'utf8');
  const event = parseEventDocument(text, path, load);

  assert.deepEqual(event.record, {
    schema_version: 1,
    id: 'meal-1',
    type: 'meal',
    date: '2026-07-30',
    time: '07:45',
    created_at: '2026-07-30T07:45:00+10:00',
    updated_at: '2026-07-30T07:45:00+10:00',
    source: 'test_fixture',
    meal: 'breakfast',
    calories: 520,
    protein_g: 38,
    fat_g: 12,
    saturated_fat_g: 3,
    unsaturated_fat_g: 9,
    carbs_g: 48,
    sugar_g: 6,
    fibre_g: 5,
    sodium_mg: 420,
    calcium_mg: 380,
    polyphenol_score: 6,
    omega3: 'medium'
  });
  assert.equal(event.body, 'Protein smoothie + flaxseed oil + berries + high protein yoghurt.');
});

test('fixture validator rejects duplicate IDs across the recursive corpus', async t => {
  const root = await mkdtemp(join(tmpdir(), 'life-hub-fixtures-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp('tests/fixtures/valid', root, { recursive: true });
  await copyFile(
    join(root, 'data/nutrition/2026/07/2026-07-30-lunch.md'),
    join(root, 'data/nutrition/2026/07/2026-07-30-lunch-copy.md')
  );

  await assert.rejects(
    exec(process.execPath, ['scripts/validate-fixtures.mjs', root]),
    error => error.code === 1 && /duplicate id "meal-2" appears 2 times/.test(error.stderr)
  );
});
