import assert from 'node:assert/strict';
import test from 'node:test';
import { searchTeachingRecords } from '../../netlify/functions/_shared/teaching-search.mjs';

test('teaching search matches titles and ignores short queries', () => {
  const records = [
    { id: 'lesson_1', type: 'lesson', title: 'Working memory' },
    { id: 'lesson_2', type: 'lesson', title: 'Attachment' },
    { id: '_index', titles: ['not a record'] }
  ];

  assert.deepEqual(searchTeachingRecords('w', records, 'lesson'), []);
  assert.deepEqual(searchTeachingRecords('memory', records, 'lesson'), [
    { type: 'lesson', id: 'lesson_1', title: 'Working memory', snippet: 'Working memory' }
  ]);
});
