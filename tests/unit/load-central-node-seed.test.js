import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCentralNodeSeed } from '../../netlify/functions/_shared/load-central-node-seed.mjs';

test('loads the checked-in central-node.md seed', () => {
  const text = loadCentralNodeSeed();
  assert.match(text, /Today's Status/);
  assert.match(text, /Recent Agent Actions/);
  assert.match(text, /Writing Rules/);
});

test('seed Agent Directory lists live Clare and Ann, not Clementine', () => {
  const text = loadCentralNodeSeed();
  const directorySection = text.slice(text.indexOf('## 🤖 Agent Directory'), text.indexOf('## 🔴 Current Constraints'));
  assert.match(directorySection, /Clare DeMind \(Tasks Agent\)/);
  assert.match(directorySection, /Ann O'Tation \(Teaching Agent\)/);
  assert.doesNotMatch(directorySection, /Clementine/);
});

test('returns an empty string when the seed file cannot be read', () => {
  const text = loadCentralNodeSeed({
    readFileSyncImpl: () => {
      throw new Error('ENOENT');
    }
  });
  assert.equal(text, '');
});
