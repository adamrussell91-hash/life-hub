import assert from 'node:assert/strict';
import { lstatSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

test('remounted apps symlink design-kit to packages/design-kit', () => {
  const canonical = realpathSync(new URL('./packages/design-kit', root));
  for (const app of ['teaching', 'knowledge', 'tasks']) {
    const dest = new URL(`./apps/${app}/design-kit`, root);
    assert.ok(lstatSync(dest).isSymbolicLink(), `${app} design-kit must be a symlink`);
    assert.equal(realpathSync(dest), canonical);
  }
});

test('Tasks loads kit CSS from the flat packages/design-kit files', async () => {
  const main = await readFile(new URL('./apps/tasks/src/app/main.ts', root), 'utf8');
  assert.match(main, /design-kit\/tokens\.css/);
  assert.doesNotMatch(main, /design-kit\/css\//);
});
