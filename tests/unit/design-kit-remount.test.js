import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const root = new URL('../../', import.meta.url);

test('repo-root design-kit/ is gone so the frozen copy cannot drift', async () => {
  await assert.rejects(
    () => access(new URL('design-kit', root), constants.F_OK),
    { code: 'ENOENT' }
  );
});

test('prepare-web copies the kit from packages/design-kit into dist/packages/design-kit', async () => {
  const source = await readFile(new URL('scripts/prepare-web.mjs', root), 'utf8');
  assert.match(source, /packages\/design-kit\//);
  assert.doesNotMatch(source, /new URL\('design-kit\//);
});

test('Home shell and app imports load the kit from packages/design-kit', async () => {
  const html = await readFile(new URL('apps/life/index.html', root), 'utf8');
  const hrefs = [...html.matchAll(/href="(packages\/design-kit\/[^"]+\.css)"/g)].map(match => match[1]);
  assert.ok(hrefs.length > 0, 'index.html must link packages/design-kit CSS');
  assert.doesNotMatch(html, /href="design-kit\//);

  const medical = await readFile(new URL('apps/life/js/app/render-medical.js', root), 'utf8');
  assert.match(medical, /from ['"]\.\.\/\.\.\/\.\.\/\.\.\/packages\/design-kit\/js\/hub-filter-menu\.js['"]/);

  const time = await readFile(new URL('apps/life/js/core/time.js', root), 'utf8');
  assert.match(time, /from ['"]\.\.\/\.\.\/\.\.\/\.\.\/packages\/design-kit\/js\/format-display-date\.js['"]/);
});
