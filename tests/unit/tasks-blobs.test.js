import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASKS_BLOBS_SITE_ID,
  TASKS_CONTENT_STORE,
  listJSON,
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

test('listJSON still returns a just-written task when store.list lags the index', async () => {
  const created = {
    id: 'task_new',
    title: 'Accreditation mentoring follow-up',
    parent_project_id: 'proj_accreditation'
  };
  const knownToList = new Set(['tasks/_index', 'tasks/task-1']);
  const map = new Map([
    ['tasks/_index', ['task-1', 'task_new']],
    ['tasks/task-1', { id: 'task-1', title: 'Existing' }],
    ['tasks/task_new', created]
  ]);
  const store = {
    async get(key, options = {}) {
      const value = map.get(key);
      if (value == null) return null;
      return options.type === 'json' ? value : value;
    },
    async list({ prefix }) {
      return {
        blobs: [...knownToList]
          .filter((key) => key.startsWith(prefix))
          .map((key) => ({ key }))
      };
    }
  };
  const listed = await listJSON(store, 'tasks/');
  assert.deepEqual(
    listed.map((item) => item.id).sort(),
    ['task-1', 'task_new']
  );
  assert.equal(
    listed.find((item) => item.id === 'task_new')?.parent_project_id,
    'proj_accreditation'
  );
});
