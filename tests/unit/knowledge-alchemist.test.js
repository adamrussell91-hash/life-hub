import assert from 'node:assert/strict';
import test from 'node:test';
import { lexicalRetrieve, parseConnectionsJson } from '../../netlify/functions/_shared/knowledge-alchemist.mjs';

test('lexicalRetrieve ranks title hits over excerpt hits', () => {
  const hits = lexicalRetrieve([
    { id: 'a', title: 'Working memory notes', excerpt: 'peonies', tags: [] },
    { id: 'b', title: 'Florist moodboard', excerpt: 'working memory miller', tags: [] }
  ], 'working memory', 8);
  assert.equal(hits[0].id, 'a');
});

test('parseConnectionsJson reads a fenced array and drops junk', () => {
  const connections = parseConnectionsJson(`\`\`\`json
[{"sourcePageId":"note-1","summary":"Load","icon":"Rules"}]
\`\`\``);
  assert.equal(connections[0].sourcePageId, 'note-1');
  assert.deepEqual(parseConnectionsJson('not json'), []);
});
