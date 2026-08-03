import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBlob } from '../../netlify/functions/_shared/decode-blob.mjs';

test('decodes a well-formed base64 blob', () => {
  const content = Buffer.from('hello world', 'utf8').toString('base64');
  assert.equal(decodeBlob({ encoding: 'base64', content }), 'hello world');
});

test('tolerates embedded newlines in the base64 content, as GitHub returns it', () => {
  const content = Buffer.from('hello world', 'utf8').toString('base64');
  const withNewlines = content.match(/.{1,4}/g).join('\n');
  assert.equal(decodeBlob({ encoding: 'base64', content: withNewlines }), 'hello world');
});

test('returns null for a non-base64 encoding, malformed content, or a missing blob', () => {
  assert.equal(decodeBlob(null), null);
  assert.equal(decodeBlob({ encoding: 'utf-8', content: 'plain text' }), null);
  assert.equal(decodeBlob({ encoding: 'base64', content: 'not valid base64!!' }), null);
  assert.equal(decodeBlob({ encoding: 'base64', content: 42 }), null);
});
