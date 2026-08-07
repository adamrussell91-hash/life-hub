import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrisketProtocol } from '../../netlify/functions/_shared/load-brisket-protocol.mjs';

test('loads the checked-in Brisket protocol markdown', () => {
  const text = loadBrisketProtocol();
  assert.match(text, /Operating Manual|flare-up|Food Library/i);
  assert.match(text, /Logging protocol|Central Node after meal/i);
  assert.match(text, /compact verdict|on track/i);
  assert.doesNotMatch(text, /If nothing notable, leave CN alone/);
});

test('returns an empty string when the seed file cannot be read', () => {
  const text = loadBrisketProtocol({
    readFileSyncImpl: () => {
      throw new Error('ENOENT');
    }
  });
  assert.equal(text, '');
});
