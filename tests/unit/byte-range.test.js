import test from 'node:test';
import assert from 'node:assert/strict';
import { parseByteRange } from '../../netlify/functions/_shared/byte-range.mjs';
import { parseByteRange as viaMediaFile } from '../../netlify/functions/media-file.mjs';

test('byte ranges: start-end, open end and suffix', () => {
  assert.deepEqual(parseByteRange('bytes=0-1', 10), { start: 0, end: 1 });
  assert.deepEqual(parseByteRange('bytes=4-', 10), { start: 4, end: 9 });
  assert.deepEqual(parseByteRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(parseByteRange('bytes=2-99', 10), { start: 2, end: 9 });
});

test('byte ranges: none, unsupported and past the end', () => {
  assert.equal(parseByteRange(null, 10), null);
  assert.equal(parseByteRange('bytes=0-1,4-5', 10), null);
  assert.equal(parseByteRange('bytes=10-', 10), 'unsatisfiable');
  assert.equal(parseByteRange('bytes=-0', 10), 'unsatisfiable');
});

test('the teaching media route still exports the same helper', () => {
  assert.equal(viaMediaFile, parseByteRange);
});
