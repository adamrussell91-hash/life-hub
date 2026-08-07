import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHammondProtocol } from '../../netlify/functions/_shared/load-hammond-protocol.mjs';

test('loads the checked-in Hammond protocol markdown', () => {
  const text = loadHammondProtocol();
  assert.match(text, /Operating Manual|Session Triage|Decision Priority/i);
  assert.match(text, /Central Node rules|read Central Node first/i);
});

test('returns an empty string when the seed file cannot be read', () => {
  const text = loadHammondProtocol({
    readFileSyncImpl: () => {
      throw new Error('ENOENT');
    }
  });
  assert.equal(text, '');
});
