import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeRecords, isIndexKey, listBlobKeys } from '../../netlify/functions/_shared/blobs-list.mjs';

test('listBlobKeys walks next_cursor pages', async () => {
  const store = {
    async list({ cursor } = {}) {
      if (!cursor) {
        return { blobs: [{ key: 'tasks/a' }], next_cursor: 'page-2' };
      }
      return { blobs: [{ key: 'tasks/b' }] };
    }
  };
  assert.deepEqual(await listBlobKeys(store, 'tasks/'), ['tasks/a', 'tasks/b']);
});

test('index keys and duplicate ids are dropped', () => {
  assert.equal(isIndexKey('tasks/_index'), true);
  assert.deepEqual(
    dedupeRecords([
      { id: 'task-1', title: 'One' },
      { id: 'task-1', title: 'One again' },
      ['task-1'],
      { title: 'No id' }
    ]),
    [
      { id: 'task-1', title: 'One' },
      { title: 'No id' }
    ]
  );
});
