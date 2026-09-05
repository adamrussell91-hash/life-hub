import test from 'node:test';
import assert from 'node:assert/strict';
import { loadChadwickProtocol } from '../../netlify/functions/_shared/load-chadwick-protocol.mjs';

test('loads the checked-in Chadwick protocol markdown', () => {
  const text = loadChadwickProtocol();
  assert.match(text, /Operating Manual|Logging protocol|Central Node/i);
});

test('Chadwick research is iterative with no search-use cap', () => {
  const text = loadChadwickProtocol();
  assert.match(text, /no search-use cap/);
  assert.match(text, /refine the query and search again/);
});

test('Chadwick protocol tells him how to answer last-session questions and to default to a new title', () => {
  const text = loadChadwickProtocol();
  assert.match(text, /get_last_workout|search_workout_records/);
  assert.match(text, /Recent sessions|last completed session/i);
  assert.match(text, /new uniquely titled|do not reuse the last completed title/i);
});

test('trims surrounding whitespace from the loaded file', () => {
  const text = loadChadwickProtocol({
    readFileSyncImpl: () => '\n\n  # Heading\n\nBody text.\n\n'
  });
  assert.equal(text, '# Heading\n\nBody text.');
});

test('returns an empty string when the file cannot be read', () => {
  const text = loadChadwickProtocol({
    readFileSyncImpl: () => {
      throw new Error('ENOENT');
    }
  });
  assert.equal(text, '');
});

test('returns an empty string when the loader returns a non-string value', () => {
  const text = loadChadwickProtocol({ readFileSyncImpl: () => Buffer.from('not a string') });
  assert.equal(text, '');
});
