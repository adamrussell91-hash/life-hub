import {
  deleteKey,
  DRAFT_LESSON_PREFIX,
  getJSON,
  listJSON,
  OUTCOME_PREFIX,
  outcomeKey,
  PUBLISHED_LESSON_PREFIX,
  SCOPE_SEQUENCE_PREFIX,
  setJSON,
  slugify,
  subjectKey,
  UNIT_PREFIX
} from './teaching-blobs.mjs';
import { teachingWriteError } from './teaching-create.mjs';
import { isIndexKey, listBlobKeys } from './blobs-list.mjs';

const STRONG = { consistency: 'strong' };

/** Prefixes whose records carry outcome_ids; merge repoints every one. */
const REFERENCE_PREFIXES = [
  { prefix: DRAFT_LESSON_PREFIX, kind: 'lesson' },
  { prefix: PUBLISHED_LESSON_PREFIX, kind: 'published_lesson' },
  { prefix: UNIT_PREFIX, kind: 'unit' },
  { prefix: SCOPE_SEQUENCE_PREFIX, kind: 'scope_sequence' }
];

const FIELD_LIMITS = { code: 32, title: 200, description: 2000, group: 80 };

export function normaliseCode(code) {
  return String(code ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Every outcome in a subject. The blob listing can lag a fresh write by
 * seconds, so the subject's own outcome_ids are read strongly as well: that
 * lag is how the same code was saved twice.
 */
export async function subjectOutcomes(store, subjectId) {
  const subject = await getJSON(store, subjectKey(subjectId), STRONG);
  const byId = new Map();
  const ids = Array.isArray(subject?.outcome_ids) ? subject.outcome_ids : [];
  const strong = await Promise.all(ids.map(id => getJSON(store, outcomeKey(id), STRONG)));
  for (const row of strong) if (row?.id) byId.set(row.id, row);
  for (const row of await listJSON(store, OUTCOME_PREFIX)) {
    if (row?.subject_id === subjectId && row.id && !byId.has(row.id)) byId.set(row.id, row);
  }
  return { subject, outcomes: [...byId.values()].filter(row => row.status !== 'trashed') };
}

export async function assertCodeFree(store, subjectId, code, exceptId) {
  const { outcomes } = await subjectOutcomes(store, subjectId);
  const wanted = normaliseCode(code);
  if (outcomes.some(row => row.id !== exceptId && normaliseCode(row.code) === wanted)) {
    throw teachingWriteError(409, 'conflict', 'An outcome with this code already exists for the subject');
  }
}

export function cleanOutcomePatch(body) {
  const patch = {};
  for (const [field, max] of Object.entries(FIELD_LIMITS)) {
    if (!(field in body)) continue;
    const value = typeof body[field] === 'string' ? body[field].trim() : '';
    if (!value) throw teachingWriteError(400, 'validation_error', `${field} cannot be empty`);
    if (value.length > max) throw teachingWriteError(400, 'validation_error', `${field} is too long`);
    patch[field] = value;
  }
  if (Object.keys(patch).length === 0) {
    throw teachingWriteError(400, 'validation_error', 'Provide code, title, description or group');
  }
  return patch;
}

export async function patchOutcome(store, id, body) {
  const record = await getJSON(store, outcomeKey(id), STRONG);
  if (!record) throw teachingWriteError(404, 'not_found', 'Outcome not found');
  const patch = cleanOutcomePatch(body);
  if (patch.code && normaliseCode(patch.code) !== normaliseCode(record.code)) {
    await assertCodeFree(store, record.subject_id, patch.code, id);
  }
  const next = {
    ...record,
    ...patch,
    ...(patch.code ? { slug: slugify(patch.code) } : {}),
    updated_at: new Date().toISOString()
  };
  await setJSON(store, outcomeKey(id), next);
  return next;
}

/** Lessons, units and scope sequences that carry this outcome. */
export async function outcomeUsage(store, id) {
  const usage = [];
  for (const { prefix, kind } of REFERENCE_PREFIXES) {
    for (const row of await listJSON(store, prefix)) {
      if (Array.isArray(row?.outcome_ids) && row.outcome_ids.includes(id) && row.status !== 'trashed') {
        usage.push({ kind, id: row.id, title: row.title ?? '' });
      }
    }
  }
  return usage;
}

async function dropFromSubject(store, subjectId, id) {
  const subject = await getJSON(store, subjectKey(subjectId), STRONG);
  if (!subject || !Array.isArray(subject.outcome_ids)) return;
  await setJSON(store, subjectKey(subjectId), {
    ...subject,
    outcome_ids: subject.outcome_ids.filter(row => row !== id),
    updated_at: new Date().toISOString()
  });
}

export async function deleteOutcome(store, id) {
  const record = await getJSON(store, outcomeKey(id), STRONG);
  if (!record) throw teachingWriteError(404, 'not_found', 'Outcome not found');
  const usage = (await outcomeUsage(store, id)).filter(row => row.kind !== 'published_lesson');
  if (usage.length > 0) {
    throw Object.assign(
      teachingWriteError(409, 'in_use', 'This outcome is tagged on lessons or units. Merge it into another outcome instead.'),
      { data: { usage } }
    );
  }
  await deleteKey(store, outcomeKey(id));
  await dropFromSubject(store, record.subject_id, id);
  return { id, deleted: true };
}

/**
 * Folds `id` into `intoId`: every lesson, published lesson, unit and scope
 * sequence tagged with the duplicate is retagged with the kept outcome, then
 * the duplicate is removed from the subject and deleted.
 */
export async function mergeOutcome(store, id, intoId) {
  if (typeof intoId !== 'string' || !intoId) {
    throw teachingWriteError(400, 'validation_error', 'into is required');
  }
  if (intoId === id) throw teachingWriteError(400, 'validation_error', 'Cannot merge an outcome into itself');
  const [from, into] = await Promise.all([
    getJSON(store, outcomeKey(id), STRONG),
    getJSON(store, outcomeKey(intoId), STRONG)
  ]);
  if (!from || !into) throw teachingWriteError(404, 'not_found', 'Outcome not found');
  if (from.subject_id !== into.subject_id) {
    throw teachingWriteError(400, 'validation_error', 'Outcomes belong to different subjects');
  }

  let retagged = 0;
  const timestamp = new Date().toISOString();
  for (const { prefix, kind } of REFERENCE_PREFIXES) {
    const keys = (await listBlobKeys(store, prefix)).filter(key => !isIndexKey(key));
    for (const key of keys) {
      const row = await getJSON(store, key, STRONG);
      if (!Array.isArray(row?.outcome_ids) || !row.outcome_ids.includes(id)) continue;
      const outcome_ids = [...new Set(row.outcome_ids.map(value => (value === id ? intoId : value)))];
      // A published snapshot keeps its timestamp so it does not read as a new publish.
      const stamp = kind === 'published_lesson' ? {} : { updated_at: timestamp };
      await setJSON(store, key, { ...row, outcome_ids, ...stamp });
      retagged += 1;
    }
  }
  await deleteKey(store, outcomeKey(id));
  await dropFromSubject(store, from.subject_id, id);
  return { id, merged_into: intoId, retagged };
}
