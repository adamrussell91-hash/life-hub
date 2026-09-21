export const WHITEBOARD_CONTENT_STORE = 'hub-whiteboards';
export const WHITEBOARD_PREFIX = 'documents/';

export function whiteboardKey(id) {
  return `${WHITEBOARD_PREFIX}${id}`;
}

export async function defaultGetWhiteboardStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore(WHITEBOARD_CONTENT_STORE);
}

export async function getWhiteboardJSON(store, key) {
  return store.get(key, { type: 'json' });
}

export async function setWhiteboardJSON(store, key, value) {
  if (typeof store.setJSON === 'function') return store.setJSON(key, value);
  if (typeof store.set === 'function') return store.set(key, JSON.stringify(value));
  throw new Error('Whiteboard content store cannot write.');
}
