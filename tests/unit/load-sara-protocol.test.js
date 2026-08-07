import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSaraProtocol } from '../../netlify/functions/_shared/load-sara-protocol.mjs';

test('loads the checked-in Sara protocol markdown', () => {
  const text = loadSaraProtocol();
  assert.match(text, /Operating Manual|Weekly health scan|Boundaries/i);
  assert.match(text, /Before advising or logging|Central Node after body log/i);
});

test('returns an empty string when the seed file cannot be read', () => {
  const text = loadSaraProtocol({
    readFileSyncImpl: () => {
      throw new Error('ENOENT');
    }
  });
  assert.equal(text, '');
});
