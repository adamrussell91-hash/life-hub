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
  assert.match(main, /design-kit\/filters\.css/);
  assert.doesNotMatch(main, /design-kit\/css\//);
});

test('Teaching and Knowledge load kit filters for sliding pills', async () => {
  const teaching = await readFile(new URL('./apps/teaching/src/design/tokens.css', root), 'utf8');
  const knowledge = await readFile(new URL('./apps/knowledge/src/tokens.css', root), 'utf8');
  assert.match(teaching, /design-kit\/filters\.css/);
  assert.match(knowledge, /design-kit\/filters\.css/);
});

test('every hub loads the shared hub-compose stylesheet', async () => {
  const chrome = await readFile(new URL('./packages/design-kit/chrome.css', root), 'utf8');
  const life = await readFile(new URL('./apps/life/index.html', root), 'utf8');
  const teaching = await readFile(new URL('./apps/teaching/src/design/tokens.css', root), 'utf8');
  const knowledge = await readFile(new URL('./apps/knowledge/src/tokens.css', root), 'utf8');
  const tasks = await readFile(new URL('./apps/tasks/src/app/main.ts', root), 'utf8');
  assert.match(chrome, /hub-compose\.css/);
  assert.match(life, /hub-compose\.css/);
  assert.match(teaching, /hub-compose\.css/);
  assert.match(knowledge, /hub-compose\.css/);
  assert.match(tasks, /design-kit\/chrome\.css/);
});

test('every hub loads the shared hub-interactions stylesheet', async () => {
  const chrome = await readFile(new URL('./packages/design-kit/chrome.css', root), 'utf8');
  const life = await readFile(new URL('./apps/life/index.html', root), 'utf8');
  const teaching = await readFile(new URL('./apps/teaching/src/design/tokens.css', root), 'utf8');
  const knowledge = await readFile(new URL('./apps/knowledge/src/tokens.css', root), 'utf8');
  const tasks = await readFile(new URL('./apps/tasks/src/app/main.ts', root), 'utf8');
  const motion = await readFile(new URL('./packages/design-kit/js/hub-motion.js', root), 'utf8');
  assert.match(chrome, /hub-interactions\.css/);
  assert.match(life, /hub-interactions\.css/);
  assert.match(teaching, /hub-interactions\.css/);
  assert.match(knowledge, /hub-interactions\.css/);
  assert.match(tasks, /design-kit\/chrome\.css/);
  assert.match(motion, /mountContextualAiBars/);
  assert.match(motion, /mountHubSurfaces/);
});

test('every hub loads the shared adaptive slider stylesheet', async () => {
  const teaching = await readFile(new URL('./apps/teaching/src/design/tokens.css', root), 'utf8');
  const knowledge = await readFile(new URL('./apps/knowledge/src/tokens.css', root), 'utf8');
  const tasks = await readFile(new URL('./apps/tasks/src/app/main.ts', root), 'utf8');
  const life = await readFile(new URL('./apps/life/index.html', root), 'utf8');
  const chrome = await readFile(new URL('./packages/design-kit/chrome.css', root), 'utf8');
  const motion = await readFile(new URL('./packages/design-kit/js/hub-motion.js', root), 'utf8');

  assert.match(teaching, /design-kit\/adaptive-slider\.css/);
  assert.match(knowledge, /design-kit\/adaptive-slider\.css/);
  assert.match(tasks, /design-kit\/chrome\.css/);
  assert.match(chrome, /adaptive-slider\.css/);
  assert.match(life, /packages\/design-kit\/adaptive-slider\.css/);
  assert.match(motion, /mountAdaptiveSliders/);
});
