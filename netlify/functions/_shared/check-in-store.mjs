/**
 * Check-in records, sealed, in their own Netlify Blobs store (`professional-check-ins`).
 *
 *   records/<id>   sealed record
 *   index/v1       sealed list of summaries (id, meeting, person, times)
 *
 * Nothing about a check-in is written to the meeting record, so no meeting read, search, sync,
 * brief or agent ever sees one. Only this module, behind the teacher's session, can open them.
 */
import { checkInKey, open, seal } from './check-in-crypto.mjs';
import { CHECK_IN_ID_RE, CheckInRecordSchema, checkInSummary } from './check-in-schema.mjs';
import { QuizError } from './question-drop.mjs';

export const CHECK_IN_STORE = 'professional-check-ins';
const INDEX_KEY = 'index/v1';
const recordKey = (id) => `records/${id}`;
const STRONG = { type: 'json', consistency: 'strong' };

export async function defaultGetCheckInStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore(CHECK_IN_STORE);
}

function badId() {
  return new QuizError(400, 'bad_request', 'That check-in id isn’t valid.');
}

async function readIndex(store, key) {
  const sealed = await store.get(INDEX_KEY, STRONG);
  if (!sealed) return [];
  const list = open(sealed, key, INDEX_KEY);
  return Array.isArray(list) ? list : [];
}

async function writeIndex(store, key, list) {
  await store.setJSON(INDEX_KEY, seal(list, key, INDEX_KEY));
}

export async function getCheckIn(store, id, { env } = {}) {
  if (!CHECK_IN_ID_RE.test(String(id ?? ''))) throw badId();
  const key = checkInKey(env);
  const sealed = await store.get(recordKey(id), STRONG);
  if (!sealed) throw new QuizError(404, 'not_found', 'That check-in isn’t there.');
  return open(sealed, key, recordKey(id));
}

/** Summaries only, newest first, for one meeting or one person (by ref, or by name for a copied record). */
export async function listCheckIns(store, filter, { env } = {}) {
  const key = checkInKey(env);
  const list = await readIndex(store, key);
  const name = typeof filter.person_name === 'string' ? filter.person_name.trim().toLowerCase() : '';
  return list
    .filter((s) => (filter.meeting_id ? s.meeting_id === filter.meeting_id : true))
    .filter((s) => (filter.person_ref ? s.person_ref === filter.person_ref || (name !== '' && s.person_name.trim().toLowerCase() === name) : true))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export async function saveCheckIn(store, input, { env } = {}) {
  const key = checkInKey(env);
  const parsed = CheckInRecordSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new QuizError(400, 'invalid_check_in', `check_in.${issue?.path?.join('.') || 'record'}: ${issue?.message ?? 'invalid'}`);
  }
  const record = parsed.data;
  await store.setJSON(recordKey(record.id), seal(record, key, recordKey(record.id)));
  const list = (await readIndex(store, key)).filter((s) => s.id !== record.id);
  list.push(checkInSummary(record));
  await writeIndex(store, key, list);
  return checkInSummary(record);
}

export async function deleteCheckIn(store, id, { env } = {}) {
  if (!CHECK_IN_ID_RE.test(String(id ?? ''))) throw badId();
  const key = checkInKey(env);
  await store.delete(recordKey(id));
  const list = await readIndex(store, key);
  await writeIndex(store, key, list.filter((s) => s.id !== id));
}
