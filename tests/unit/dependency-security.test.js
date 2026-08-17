import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from 'js-yaml';
import { config as authConfig } from '../../netlify/functions/auth.mjs';

test('gitignore comments do not embed a GitHub owner/repo that secrets scanning would treat as GITHUB_REPOSITORY', async () => {
  const gitignore = await readFile(new URL('../../.gitignore', import.meta.url), 'utf8');
  for (const line of gitignore.split('\n')) {
    if (!line.trim().startsWith('#')) continue;
    assert.doesNotMatch(
      line,
      /[A-Za-z0-9][A-Za-z0-9.-]{0,38}\/[A-Za-z0-9_.-]{1,100}/,
      line
    );
  }
});

test('environment example contains names but no usable credentials', async () => {
  const example = await readFile(new URL('../../.env.example', import.meta.url), 'utf8');
  const values = new Map(example
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=', 2)));
  for (const name of [
    'LIFE_HUB_PASSPHRASE_HASH',
    'SESSION_SECRET',
    'GITHUB_REPOSITORY',
    'GITHUB_BRANCH',
    'GITHUB_TOKEN',
    'GITHUB_TOKEN_EXPIRES'
  ]) {
    assert.match(example, new RegExp(`^${name}=`, 'm'));
  }
  assert.equal(values.get('LIFE_HUB_PASSPHRASE_HASH'), 'replace-in-netlify');
  assert.equal(values.get('SESSION_SECRET'), 'replace-in-netlify');
  assert.equal(values.get('GITHUB_REPOSITORY'), 'owner/private-repository');
  assert.equal(values.get('GITHUB_BRANCH'), 'main');
  assert.equal(values.get('GITHUB_TOKEN'), 'replace-in-netlify');
  assert.equal(values.get('GITHUB_TOKEN_EXPIRES'), 'YYYY-MM-DD');
  assert.doesNotMatch(example, /github_pat_|ghp_|gho_|Bearer\s+[A-Za-z0-9]/);
});

test('authentication declares the reviewed Netlify rate limit', () => {
  assert.deepEqual(authConfig, {
    path: '/api/auth',
    rateLimit: {
      action: 'rate_limit',
      aggregateBy: ['ip', 'domain'],
      windowLimit: 5,
      windowSize: 60
    }
  });
});

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
