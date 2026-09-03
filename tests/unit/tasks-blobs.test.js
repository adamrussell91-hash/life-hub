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

test('Tasks store still reads artasks-hub when only the token is set', () => {
  assert.deepEqual(tasksStoreOptions({ NETLIFY_BLOBS_TOKEN: 'netlify-pat' }), {
    name: TASKS_CONTENT_STORE,
    siteID: TASKS_BLOBS_SITE_ID,
    token: 'netlify-pat'
  });
});

test('Tasks store remounts onto life-hub2 when the site id is local or umbrella', () => {
  assert.equal(tasksStoreOptions({
    NETLIFY_BLOBS_TOKEN: 'netlify-pat',
    TASKS_BLOBS_SITE_ID: 'local'
  }), TASKS_CONTENT_STORE);
});
