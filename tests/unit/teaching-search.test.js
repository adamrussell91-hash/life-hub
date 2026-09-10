import assert from 'node:assert/strict';
import test from 'node:test';
import { runContentSearch, searchTeachingRecords } from '../../netlify/functions/_shared/teaching-search.mjs';

test('teaching search matches titles and ignores short queries', () => {
  const records = [
    { id: 'lesson_1', type: 'lesson', title: 'Working memory' },
    { id: 'lesson_2', type: 'lesson', title: 'Attachment' },
    { id: '_index', titles: ['not a record'] }
  ];

  assert.deepEqual(searchTeachingRecords('w', records, 'lesson'), []);
  assert.deepEqual(searchTeachingRecords('memory', records, 'lesson'), [
    { type: 'lesson', id: 'lesson_1', title: 'Working memory', snippet: 'Working memory', match: 'title' }
  ]);
});

test('content search scans lesson blocks and composition roots', () => {
  const hits = runContentSearch('encoding', {
    lessons: [{
      id: 'lesson_1',
      title: 'Working memory',
      blocks: [{ block_type: 'rich_text', content: { html: '<p>Encoding into working memory</p>' } }]
    }],
    units: [],
    compositions: [{
      id: 'comp_1',
      title: 'Starter',
      status: 'active',
      root: { block_type: 'heading', content: { text: 'Encoding drill' } }
    }]
  });
  assert.equal(hits.some(hit => hit.type === 'lesson' && hit.match === 'body'), true);
  assert.equal(hits.some(hit => hit.type === 'composition'), true);
});
