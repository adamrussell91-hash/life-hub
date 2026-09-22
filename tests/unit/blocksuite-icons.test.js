import assert from 'node:assert/strict';
import test from 'node:test';

test('BlockSuite 0.19 still receives the misspelled checkbox icon export Vite bundles', async () => {
  const icons = await import('@blocksuite/icons/lit');
  assert.equal(typeof icons.CheckBoxCkeckSolidIcon, 'function');
});
