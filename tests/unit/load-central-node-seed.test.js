import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCentralNodeSeed } from '../../netlify/functions/_shared/load-central-node-seed.mjs';

test('loads the checked-in central-node.md seed', () => {
  const text = loadCentralNodeSeed();
  assert.match(text, /Today's Status/);
  assert.match(text, /Recent Agent Actions/);
  assert.match(text, /Writing Rules/);
});

test('seed Agent Directory no longer carries the vestigial Clare DeMind / Ann O\'Tation entries', () => {
  const text = loadCentralNodeSeed();
  const directorySection = text.slice(text.indexOf('## 🤖 Agent Directory'), text.indexOf('## 🔴 Current Constraints'));
  assert.doesNotMatch(directorySection, /Clare DeMind/);
  assert.doesNotMatch(directorySection, /Ann O'Tation/);
});

test('seed central node contains no Notion references or Notion URLs', () => {
  const text = loadCentralNodeSeed();
  assert.doesNotMatch(text, /notion/i);
  assert.doesNotMatch(text, /app\.notion\.com/i);
});

test('returns an empty string when the seed file cannot be read', () => {
  const text = loadCentralNodeSeed({
    readFileSyncImpl: () => {
      throw new Error('ENOENT');
    }
  });
  assert.equal(text, '');
});
