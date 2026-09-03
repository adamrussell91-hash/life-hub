import assert from 'node:assert/strict';
import test from 'node:test';
import { rankKnowledgePages } from '../../netlify/functions/_shared/knowledge-data.mjs';

const pages = [
  { id: 'a', title: 'Working memory notes', excerpt: 'Miller', tags: ['psych'], origins: [{ label: 'EDST5805' }] },
  { id: 'b', title: 'Florist moodboard', excerpt: 'peonies', tags: ['wedding'] }
];

test('rankKnowledgePages matches title, tags, origins, and prefers title hits', () => {
  const hits = rankKnowledgePages(pages, 'EDST');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'a');
  const titled = rankKnowledgePages(pages, 'notes');
  assert.equal(titled[0].id, 'a');
  assert.deepEqual(rankKnowledgePages(pages, ''), []);
});
