export const TASKS_CONTENT_STORE = 'tasks-hub-content';
export const TASKS_BLOBS_SITE_ID = 'c6696619-f478-4ac1-b0cd-1e4cfd3101df';
export const TASKS_BLOBS_SITE_ID_ENV = 'TASKS_BLOBS_SITE_ID';
export const TASKS_BLOBS_TOKEN_ENV = 'NETLIFY_BLOBS_TOKEN';
export const TASK_PREFIX = 'tasks/';
export const TASKS_INDEX_KEY = 'tasks/_index';

export function tasksStoreOptions(env = process.env) {
  const siteID = typeof env?.[TASKS_BLOBS_SITE_ID_ENV] === 'string' && env[TASKS_BLOBS_SITE_ID_ENV].trim()
    ? env[TASKS_BLOBS_SITE_ID_ENV].trim()
    : TASKS_BLOBS_SITE_ID;
  const token = typeof env?.[TASKS_BLOBS_TOKEN_ENV] === 'string' ? env[TASKS_BLOBS_TOKEN_ENV] : '';
  if (token) return { name: TASKS_CONTENT_STORE, siteID, token };
  return TASKS_CONTENT_STORE;
}

export async function defaultGetTasksStore(env = process.env) {
  const { getStore } = await import('@netlify/blobs');
  return getStore(tasksStoreOptions(env));
}

export async function getJSON(store, key) {
  return store.get(key, { type: 'json' });
}

export async function setJSON(store, key, value) {
  if (typeof store.setJSON === 'function') return store.setJSON(key, value);
  if (typeof store.set === 'function') return store.set(key, JSON.stringify(value));
  throw new Error('Tasks content store cannot write.');
}

export async function deleteKey(store, key) {
  if (typeof store.delete !== 'function') {
    throw new Error('Tasks content store cannot delete.');
  }
  return store.delete(key);
}

export async function listJSON(store, prefix) {
  const { blobs } = await store.list({ prefix });
  const entries = await Promise.all(blobs.map(blob => getJSON(store, blob.key)));
  return entries.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry));
}

export function taskKey(id) {
  return `${TASK_PREFIX}${id}`;
}

export function newTaskId() {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function summarizeTask(item) {
  const id = typeof item.id === 'string' ? item.id : '';
  const title = typeof item.title === 'string' ? item.title : '';
  if (!id && !title) return null;
  return {
    id,
    title,
    status: typeof item.status === 'string' ? item.status : undefined,
    project_id: typeof item.project_id === 'string'
      ? item.project_id
      : typeof item.parent_project_id === 'string' ? item.parent_project_id : undefined
  };
}

export async function readTaskIndex(store) {
  const index = await getJSON(store, TASKS_INDEX_KEY);
  return Array.isArray(index) ? index.filter(id => typeof id === 'string') : [];
}

export async function writeTaskIndex(store, ids) {
  await setJSON(store, TASKS_INDEX_KEY, [...new Set(ids)]);
}
