/**
 * Classroom observation records in their own Netlify Blobs store.
 *   records/<id>   the observation (plain JSON)
 *   index/v1       summaries (see observationSummary)
 */
import { OBSERVATION_ID_RE, ObservationSchema, observationSummary } from './classroom-observation-schema.mjs';
import { QuizError } from './question-drop.mjs';

export const CLASSROOM_OBSERVATION_STORE = 'professional-classroom-observations';
const INDEX_KEY = 'index/v1';
const recordKey = (id) => `records/${id}`;
const STRONG = { type: 'json', consistency: 'strong' };

export async function defaultGetClassroomObservationStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore(CLASSROOM_OBSERVATION_STORE);
}

const badId = () => new QuizError(400, 'bad_request', 'That observation id isn’t valid.');

async function readIndex(store) {
  const list = await store.get(INDEX_KEY, STRONG);
  return Array.isArray(list) ? list : [];
}

export async function getObservation(store, id) {
  if (!OBSERVATION_ID_RE.test(String(id ?? ''))) throw badId();
  const record = await store.get(recordKey(id), STRONG);
  if (!record) throw new QuizError(404, 'not_found', 'That observation isn’t there.');
  return record;
}

/** Summaries, newest first. Filters: person_ref, open (status 'open'). */
export async function listObservations(store, filter = {}) {
  const list = await readIndex(store);
  return list
    .filter((s) => (filter.person_ref ? s.person_ref === filter.person_ref : true))
    .filter((s) => (filter.open ? s.status === 'open' : true))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

/** Create or replace. Sets updated_at, upserts the index, returns the saved record. */
export async function saveObservation(store, input, { now = () => new Date() } = {}) {
  const parsed = ObservationSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new QuizError(400, 'invalid_observation', `observation.${issue?.path?.join('.') || 'record'}: ${issue?.message ?? 'invalid'}`);
  }
  const record = { ...parsed.data, updated_at: now().toISOString() };
  await store.setJSON(recordKey(record.id), record);
  const list = (await readIndex(store)).filter((s) => s.id !== record.id);
  list.push(observationSummary(record));
  await store.setJSON(INDEX_KEY, list);
  return record;
}

export async function deleteObservation(store, id) {
  if (!OBSERVATION_ID_RE.test(String(id ?? ''))) throw badId();
  await store.delete(recordKey(id));
  const list = await readIndex(store);
  await store.setJSON(INDEX_KEY, list.filter((s) => s.id !== id));
}
