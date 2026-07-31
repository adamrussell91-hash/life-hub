import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from 'js-yaml';

test('runtime YAML parser is pinned to the patched js-yaml release', async () => {
  const packageMetadata = JSON.parse(await readFile(
    new URL('../../node_modules/js-yaml/package.json', import.meta.url),
    'utf8'
  ));
  assert.equal(packageMetadata.version, '4.1.1');
});

test('hostile YAML merge keys cannot alter result prototypes or inherited properties', () => {
  const parsed = load(`
source: &source
  __proto__:
    polluted: inherited
target:
  <<: *source
  safe: true
`);

  assert.equal(Object.getPrototypeOf(parsed.target), Object.prototype);
  assert.equal(Object.hasOwn(parsed.target, '__proto__'), true);
  assert.equal(Object.hasOwn(parsed.target, 'polluted'), false);
  assert.equal(parsed.target.polluted, undefined);
  assert.equal(({}).polluted, undefined);
});
