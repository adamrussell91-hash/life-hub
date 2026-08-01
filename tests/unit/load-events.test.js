import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { loadEventManifest } from '../../js/app/load-events.js';

const responses = new Map([
  ['/fixtures/manifest.json', {
    files: [
      {
        path: 'data/nutrition/2026/07/2026-07-30-breakfast.md',
        url: '/breakfast.md'
      },
      {
        path: 'data/nutrition/2026/07/2026-07-30-lunch.md',
        url: '/missing.md'
      }
    ]
  }],
  ['/breakfast.md', `---
schema_version: 1
id: meal-1
type: meal
date: '2026-07-30'
time: '07:45'
created_at: '2026-07-30T07:45:00+10:00'
updated_at: '2026-07-30T07:45:00+10:00'
source: test_fixture
meal: breakfast
calories: 520
protein_g: 38
fat_g: 12
---
Breakfast`]
]);

const fetchImpl = async url => {
  if (!responses.has(url)) {
    return { ok: false, status: 404, text: async () => '' };
  }
  const value = responses.get(url);
  return {
    ok: true,
    json: async () => value,
    text: async () => value
  };
};

test('loads valid events and reports unavailable files without discarding good data', async () => {
  const result = await loadEventManifest({
    fetchImpl,
    manifestUrl: '/fixtures/manifest.json',
    loadYaml: load
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].record.id, 'meal-1');
  assert.deepEqual(result.warnings, [{
    path: 'data/nutrition/2026/07/2026-07-30-lunch.md',
    code: 'unavailable'
  }]);
});

test('rejects a manifest that cannot be loaded', async () => {
  await assert.rejects(
    loadEventManifest({ fetchImpl, manifestUrl: '/absent.json', loadYaml: load }),
    /fixture manifest/i
  );
});
