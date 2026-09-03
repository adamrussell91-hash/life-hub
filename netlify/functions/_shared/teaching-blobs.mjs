export const TEACHING_CONTENT_STORE = 'teaching-hub-content';

export function yearKey(id) {
  return `years/${id}`;
}

export function outcomeKey(id) {
  return `outcomes/${id}`;
}

export function unitKey(id) {
  return `units/${id}`;
}

export function draftLessonKey(id) {
  return `lessons/${id}`;
}

export function publishedLessonKey(id) {
  return `published/lessons/${id}`;
}

export function classKey(id) {
  return `classes/${id}`;
}

export function mediaKey(id) {
  return `media/${id}`;
}

export function mediaFileKey(id) {
  return `media_files/${id}`;
}

export const PUBLISHED_LESSON_PREFIX = 'published/lessons/';
export const SCHEDULED_LESSON_PREFIX = 'scheduled_lessons/';

export async function defaultGetContentStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore(TEACHING_CONTENT_STORE);
}

export async function getJSON(store, key) {
  return store.get(key, { type: 'json' });
}

export function readPublishedId(request, context = {}) {
  const fromContext = context.params?.id;
  if (typeof fromContext === 'string' && fromContext) return fromContext;
  const url = new URL(request.url);
  const match = url.pathname.match(/\/(?:lessons|units|classes|media|published-lesson)\/([^/]+)(?:\/file)?$/);
  if (match?.[1]) return match[1];
  return url.searchParams.get('id');
}
