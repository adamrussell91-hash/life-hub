import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const root = new URL('../../', import.meta.url);

test('Life shell source lives under apps/life/', async () => {
  for (const path of [
    'apps/life/index.html',
    'apps/life/js/app/main.js',
    'apps/life/css/app.css',
    'apps/life/manifest.webmanifest',
    'apps/life/service-worker.js'
  ]) {
    await access(new URL(path, root), constants.F_OK);
  }
  await assert.rejects(
    () => access(new URL('index.html', root), constants.F_OK),
    { code: 'ENOENT' }
  );
});

test('prepare-web copies the Life shell from apps/life into the same dist URLs', async () => {
  const source = await readFile(new URL('scripts/prepare-web.mjs', root), 'utf8');
  assert.match(source, /apps\/life\//);
  assert.match(source, /publishedFiles = \['index.html'/);
  assert.match(source, /rewritePublishedKitImports/);
});

test('Netlify still hosts functions from repo-root netlify/functions', async () => {
  const toml = await readFile(new URL('netlify.toml', root), 'utf8');
  assert.match(toml, /directory = "netlify\/functions"/);
  assert.match(toml, /"config\/chadwick-protocol.md"/);
  assert.doesNotMatch(toml, /apps\/life\/netlify/);
});
