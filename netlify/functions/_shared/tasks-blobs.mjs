export const TASKS_CONTENT_STORE = 'tasks-hub-content';
export const TASK_PREFIX = 'tasks/';

export async function defaultGetTasksStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore(TASKS_CONTENT_STORE);
}

export async function getJSON(store, key) {
  return store.get(key, { type: 'json' });
}

export async function listJSON(store, prefix) {
  const { blobs } = await store.list({ prefix });
  const entries = await Promise.all(blobs.map(blob => getJSON(store, blob.key)));
  return entries.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry));
}

export function summarizeTask(item) {
  const id = typeof item.id === 'string' ? item.id : '';
  const title = typeof item.title === 'string' ? item.title : '';
  if (!id && !title) return null;
  return {
    id,
    title,
    status: typeof item.status === 'string' ? item.status : undefined,
    project_id: typeof item.project_id === 'string' ? item.project_id : undefined
  };
}
