import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHyaluronicaProtocol } from '../../netlify/functions/_shared/load-hyaluronica-protocol.mjs';

test('loads the checked-in Hyaluronica protocol markdown', () => {
  const text = loadHyaluronicaProtocol();
  assert.match(text, /Skincare tab|Operating Manual/i);
  assert.match(text, /Before advising or logging|Central Node after skincare/i);
});

test('returns an empty string when the seed file cannot be read', () => {
  const text = loadHyaluronicaProtocol({
    readFileSyncImpl: () => {
      throw new Error('ENOENT');
    }
  });
  assert.equal(text, '');
});
