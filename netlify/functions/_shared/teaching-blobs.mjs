export const TEACHING_CONTENT_STORE = 'teaching-hub-content';
export const TEACHING_BLOBS_SITE_ID = '899b0fd3-53b3-45a0-bbfb-0238264d9246';
export const UMBRELLA_BLOBS_SITE_ID = '5771ee5c-0cb2-4858-b03d-2637f092050e';
export const TEACHING_BLOBS_SITE_ID_ENV = 'TEACHING_BLOBS_SITE_ID';
export const TEACHING_BLOBS_TOKEN_ENV = 'NETLIFY_BLOBS_TOKEN';

export function isUmbrellaBlobsHome(siteID) {
  const id = typeof siteID === 'string' ? siteID.trim() : '';
  return id === 'local' || id === UMBRELLA_BLOBS_SITE_ID;
}

export function teachingStoreOptions(env = process.env) {
  const configured = typeof env?.[TEACHING_BLOBS_SITE_ID_ENV] === 'string'
    ? env[TEACHING_BLOBS_SITE_ID_ENV].trim()
    : '';
  const siteID = configured || TEACHING_BLOBS_SITE_ID;
  const token = typeof env?.[TEACHING_BLOBS_TOKEN_ENV] === 'string' ? env[TEACHING_BLOBS_TOKEN_ENV] : '';
  if (isUmbrellaBlobsHome(configured)) return TEACHING_CONTENT_STORE;
  if (token) return { name: TEACHING_CONTENT_STORE, siteID, token };
  return TEACHING_CONTENT_STORE;
}

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

export function scheduledLessonKey(id) {
  return `scheduled_lessons/${id}`;
}

export function subjectKey(id) {
  return `subjects/${id}`;
}

export function mediaKey(id) {
  return `media/${id}`;
}

export function mediaFileKey(id) {
  return `media_files/${id}`;
}

export const PUBLISHED_LESSON_PREFIX = 'published/lessons/';
export const SCHEDULED_LESSON_PREFIX = 'scheduled_lessons/';
export const YEAR_PREFIX = 'years/';
export const SUBJECT_PREFIX = 'subjects/';
export const UNIT_PREFIX = 'units/';
export const DRAFT_LESSON_PREFIX = 'lessons/';
export const CLASS_PREFIX = 'classes/';
export const SCOPE_SEQUENCE_PREFIX = 'scope_sequences/';
export const MEDIA_PREFIX = 'media/';
export const OUTCOME_PREFIX = 'outcomes/';
export const COMPOSITION_PREFIX = 'templates/compositions/';
export const DEFAULT_SCHEDULE_ANCHOR_DATE = '2026-08-12';

export function scheduleAnchorKey() {
  return 'meta/schedule_anchor_date';
}

export async function defaultGetContentStore(env = process.env) {
  const { getStore } = await import('@netlify/blobs');
  return getStore(teachingStoreOptions(env));
}

export async function getJSON(store, key) {
  return store.get(key, { type: 'json' });
}

export async function setJSON(store, key, value) {
  if (typeof store.setJSON === 'function') return store.setJSON(key, value);
  if (typeof store.set === 'function') return store.set(key, JSON.stringify(value));
  throw new Error('Teaching content store cannot write.');
}

export async function deleteKey(store, key) {
  if (typeof store.delete !== 'function') {
    throw new Error('Teaching content store cannot delete.');
  }
  return store.delete(key);
}

export function slugify(title) {
  return (
    String(title ?? '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'item'
  );
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listJSON(store, prefix) {
  const { blobs } = await store.list({ prefix });
  const entries = await Promise.all(blobs.map(blob => getJSON(store, blob.key)));
  return entries.filter(entry => entry && typeof entry === 'object');
}

export function readPublishedId(request, context = {}) {
  const fromContext = context.params?.id;
  if (typeof fromContext === 'string' && fromContext) return fromContext;
  const url = new URL(request.url);
  const match = url.pathname.match(/\/(?:lessons|units|classes|media|published-lesson|scheduled-lessons|years|subjects)\/([^/]+)(?:\/file)?$/);
  if (match?.[1]) return match[1];
  return url.searchParams.get('id');
}
