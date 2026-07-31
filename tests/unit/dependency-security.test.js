import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from 'js-yaml';

test('runtime YAML parser is pinned to the patched js-yaml release', async () => {
  const packageMetadata = JSON.parse(await readFile(
    new URL('../../node_modules/js-yaml/package.json', import.meta.url),
    'utf8'
  ));
  assert.equal(packageMetadata.version, '4.3.0');
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

test('hostile YAML merge chains hit the parser merge-work limit', () => {
  const lines = ['a0: &a0 { k0: 0 }'];
  for (let index = 1; index < 200; index += 1) {
    lines.push(`a${index}: &a${index} { <<: *a${index - 1}, k${index}: ${index} }`);
  }
  lines.push('result: *a199');

  assert.throws(
    () => load(`${lines.join('\n')}\n`),
    error => error.name === 'YAMLException' && /merge keys exceeded maxTotalMergeKeys/.test(error.message)
  );
});

test('repeated hostile merge aliases hit the work limit before quadratic traversal', () => {
  const count = 4_000;
  const keys = Array.from({ length: count }, (_, index) => `k${index}: ${index}`).join(', ');
  const aliases = Array.from({ length: count }, () => '*source').join(', ');
  const started = performance.now();

  assert.throws(
    () => load(`source: &source {${keys}}\ntarget: {<<: [${aliases}]}\n`),
    error => error.name === 'YAMLException' && /merge keys exceeded maxTotalMergeKeys/.test(error.message)
  );
  assert.ok(performance.now() - started < 500, 'duplicate aliases must be rejected before quadratic work');
});
