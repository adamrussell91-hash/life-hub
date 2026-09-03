import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASKS_BLOBS_SITE_ID,
  TASKS_CONTENT_STORE,
  tasksStoreOptions
} from '../../netlify/functions/_shared/tasks-blobs.mjs';

test('Tasks store stays on this site until a Blobs token is present', () => {
  assert.equal(tasksStoreOptions({}), TASKS_CONTENT_STORE);
  assert.equal(tasksStoreOptions({ NETLIFY_BLOBS_TOKEN: '' }), TASKS_CONTENT_STORE);
});

test('Tasks store reads artasks-hub when a Blobs token is set', () => {
  assert.deepEqual(tasksStoreOptions({ NETLIFY_BLOBS_TOKEN: 'netlify-pat' }), {
    name: TASKS_CONTENT_STORE,
    siteID: TASKS_BLOBS_SITE_ID,
    token: 'netlify-pat'
  });
});
