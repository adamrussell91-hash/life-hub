import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const root = new URL('../../', import.meta.url);

test('Teaching, Knowledge, and Tasks SPAs live under apps/', async () => {
  for (const path of [
    'apps/teaching/index.html',
    'apps/teaching/src/app/main.ts',
    'apps/teaching/src/app/router.ts',
    'apps/knowledge/index.html',
    'apps/knowledge/src/main.ts',
    'apps/tasks/index.html',
    'apps/tasks/src/app/main.ts'
  ]) {
    await access(new URL(path, root), constants.F_OK);
  }
});

test('umbrella Pages build uses subpath bases for the three SPAs', async () => {
  const teaching = await readFile(new URL('apps/teaching/vite.config.ts', root), 'utf8');
  const knowledge = await readFile(new URL('apps/knowledge/vite.config.ts', root), 'utf8');
  const tasks = await readFile(new URL('apps/tasks/vite.config.ts', root), 'utf8');
  assert.match(teaching, /UMBRELLA_SPA === ['"]1['"] \? ['"]\/teaching\/['"]/);
  assert.match(knowledge, /UMBRELLA_SPA === ['"]1['"] \? ['"]\/knowledge\/['"]/);
  assert.match(tasks, /UMBRELLA_SPA === ['"]1['"] \? ['"]\/tasks\/['"]/);
});

test('prepare-web publishes built SPAs and a Pages 404 dispatcher', async () => {
  const source = await readFile(new URL('scripts/prepare-web.mjs', root), 'utf8');
  assert.match(source, /spaApps = \['teaching', 'knowledge', 'tasks'\]/);
  assert.match(source, /copyBuiltSpa/);
  assert.match(source, /pages-spa-fallback\.html/);
  const fallback = await readFile(new URL('scripts/pages-spa-fallback.html', root), 'utf8');
  assert.match(fallback, /life-hub-spa-redirect/);
  assert.match(fallback, /\/teaching/);
  assert.match(fallback, /\/knowledge/);
  assert.match(fallback, /\/tasks/);
});

test('Teaching router strips the umbrella /teaching base', async () => {
  const router = await readFile(new URL('apps/teaching/src/app/router.ts', root), 'utf8');
  const base = await readFile(new URL('apps/teaching/src/app/base-path.ts', root), 'utf8');
  assert.match(router, /stripAppBase/);
  assert.match(router, /withAppBase/);
  assert.match(base, /export function stripAppBase/);
  assert.match(base, /export function withAppBase/);
});

test('Functions stay at repo-root netlify/functions, not under apps', async () => {
  const toml = await readFile(new URL('netlify.toml', root), 'utf8');
  assert.match(toml, /directory = "netlify\/functions"/);
  assert.doesNotMatch(toml, /apps\/teaching\/netlify/);
  assert.doesNotMatch(toml, /apps\/knowledge\/netlify/);
  assert.doesNotMatch(toml, /apps\/tasks\/netlify/);
});
