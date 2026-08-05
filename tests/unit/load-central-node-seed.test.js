import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCentralNodeSeed } from '../../netlify/functions/_shared/load-central-node-seed.mjs';

test('loads the checked-in central-node.md seed', () => {
  const text = loadCentralNodeSeed();
  assert.match(text, /Today's Status/);
  assert.match(text, /Recent Agent Actions/);
  assert.match(text, /Writing Rules/);
});

test('returns an empty string when the seed file cannot be read', () => {
  const text = loadCentralNodeSeed({
    readFileSyncImpl: () => {
      throw new Error('ENOENT');
    }
  });
  assert.equal(text, '');
});
