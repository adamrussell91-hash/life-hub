import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAllowedRepositoryPath,
  isClientFileInRange,
  parseDateRange,
  selectManifestEntries
} from '../../netlify/functions/_shared/repo-policy.mjs';

const blob = (path, sha, size, type = 'blob') => ({ path, sha, size, type });

test('manifest policy returns sorted config and in-range canonical events', () => {
  const [MEAL, OLD, TARGETS, AGENTS, CENTRAL_NODE, SECRET] = ['a', 'b', 'c', 'd', 'e', 'f'].map(value => value.repeat(40));
  const tree = [
    blob('data/nutrition/2026/08/2026-08-01-breakfast.md', MEAL, 120),
    blob('data/nutrition/2026/07/2026-07-01-old.md', OLD, 100),
    blob('config/targets.yml', TARGETS, 90),
    blob('config/agents.yml', AGENTS, 80),
    blob('central-node.md', CENTRAL_NODE, 60),
    blob('private/secret.md', SECRET, 20)
  ];

  assert.deepEqual(selectManifestEntries(tree, { from: '2026-07-02', to: '2026-08-01' }), [
    { path: 'central-node.md', sha: CENTRAL_NODE, size: 60 },
    { path: 'config/agents.yml', sha: AGENTS, size: 80 },
    { path: 'config/targets.yml', sha: TARGETS, size: 90 },
    { path: 'data/nutrition/2026/08/2026-08-01-breakfast.md', sha: MEAL, size: 120 }
  ]);
});

test('repository path policy rejects noncanonical and nonallowlisted paths', () => {
  const rejected = [
    '../data/x.md',
    'https://evil/x.md',
    'data\\nutrition\\x.md',
    'data//nutrition/2026/08/2026-08-01-x.md',
    'data/./nutrition/2026/08/2026-08-01-x.md',
    'data/nutrition/2026/02/2026-02-30-x.md',
    'data/nutrition/2026/08/2026-07-31-x.md',
    'data/sleep/2026/08/2026-08-01-x.md',
    'data/mind/2026/08/2026-08-01-x.yml',
    'config/other.yml',
    'config/vera-intake.md',
    'data/mind/2026/08/2026-08-01-x\u0000.md',
    'data/fitness/templates/../x.md'
  ];

  for (const path of rejected) assert.equal(isAllowedRepositoryPath(path), false, path);
  for (const path of [
    'config/agents.yml',
    'config/targets.yml',
    'central-node.md',
    'data/nutrition/2026/08/2026-08-01-breakfast.md',
    'data/fitness/2026/08/2026-08-01-workout.md',
    'data/body/2026/08/2026-08-01-weight.md',
    'data/mind/2026/08/2026-08-01-diary.md',
    'data/skincare/2026/08/2026-08-01-morning.md',
    'data/fitness/templates/chest-and-curls.md'
  ]) assert.equal(isAllowedRepositoryPath(path), true, path);
});

test('manifest policy excludes workout templates from the dated event window', () => {
  const [MEAL, TEMPLATE] = ['a', 'b'].map(value => value.repeat(40));
  const tree = [
    blob('data/nutrition/2026/08/2026-08-01-breakfast.md', MEAL, 120),
    blob('data/fitness/templates/chest-and-curls.md', TEMPLATE, 90)
  ];

  assert.deepEqual(selectManifestEntries(tree, { from: '2026-07-02', to: '2026-08-01' }), [
    { path: 'data/nutrition/2026/08/2026-08-01-breakfast.md', sha: MEAL, size: 120 }
  ]);
});

test('manifest policy accepts only canonical bounded blob metadata', () => {
  const valid = blob('config/targets.yml', 'a'.repeat(40), 256 * 1024);
  const invalid = [
    { ...valid, type: 'tree' },
    { ...valid, sha: 'A'.repeat(40) },
    { ...valid, sha: 'a'.repeat(39) },
    { ...valid, size: -1 },
    { ...valid, size: 1.5 },
    { ...valid, size: 256 * 1024 + 1 }
  ];

  assert.deepEqual(selectManifestEntries([valid, ...invalid], { from: '2026-08-01', to: '2026-08-01' }), [
    { path: valid.path, sha: valid.sha, size: valid.size }
  ]);
});

test('client file range allows config and in-range events, not templates or out-of-range events', () => {
  const range = { from: '2026-07-02', to: '2026-08-01' };
  assert.equal(isClientFileInRange('config/targets.yml', range), true);
  assert.equal(isClientFileInRange('config/agents.yml', range), true);
  assert.equal(isClientFileInRange('central-node.md', range), true);
  assert.equal(isClientFileInRange('data/nutrition/2026/08/2026-08-01-breakfast.md', range), true);
  assert.equal(isClientFileInRange('data/nutrition/2026/07/2026-07-01-old.md', range), false);
  assert.equal(isClientFileInRange('data/fitness/templates/chest-and-curls.md', range), false);
  assert.equal(isClientFileInRange('private/secret.md', range), false);
});

test('date ranges require one canonical ordered date pair no longer than 366 days', () => {
  assert.deepEqual(
    parseDateRange(new URL('https://life.test/api/repo/manifest?from=2025-08-02&to=2026-08-02')),
    { from: '2025-08-02', to: '2026-08-02' }
  );

  for (const query of [
    '',
    '?from=2026-08-01',
    '?from=2026-02-30&to=2026-08-01',
    '?from=2026-08-02&to=2026-08-01',
    '?from=2025-08-01&to=2026-08-02',
    '?from=2026-08-01&from=2026-08-02&to=2026-08-03',
    '?from=2026-08-01&to=2026-08-01&extra=yes'
  ]) {
    assert.throws(() => parseDateRange(new URL(`https://life.test/api/repo/manifest${query}`)), TypeError, query);
  }
});
