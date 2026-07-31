import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('fixture validator reports the approved Home sample', async () => {
  const { stdout } = await exec(process.execPath, ['scripts/validate-fixtures.mjs']);
  const result = JSON.parse(stdout);
  assert.deepEqual(result, {
    files: 4, valid: 4, invalid: 0,
    home: { calories: 1130, protein_g: 80, fat_g: 27, day_type: 'workout_30', workout_streak: 1 }
  });
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
