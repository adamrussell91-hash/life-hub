import {
  listJSON,
  newId,
  setJSON,
  slugify,
  SUBJECT_PREFIX,
  subjectKey
} from './_shared/teaching-blobs.mjs';
import { createTeachingCollectionHandler, teachingWriteError } from './_shared/teaching-create.mjs';

export const config = { path: '/api/subjects' };

export async function createSubjectRecord(store, body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) throw teachingWriteError(400, 'validation_error', 'title is required');

  const existing = await listJSON(store, SUBJECT_PREFIX);
  if (existing.some(item => typeof item.title === 'string' && item.title.toLowerCase() === title.toLowerCase())) {
    throw teachingWriteError(409, 'conflict', 'A subject with this title already exists');
  }

  const timestamp = new Date().toISOString();
  const id = newId('subject');
  const record = {
    id,
    type: 'subject',
    title,
    display_title: title,
    slug: slugify(title),
    unit_ids: [],
    outcome_ids: [],
    class_ids: [],
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };
  await setJSON(store, subjectKey(id), record);
  return record;
}

export function createSubjectsHandler(deps = {}) {
  return createTeachingCollectionHandler({
    create: createSubjectRecord,
    listPrefix: SUBJECT_PREFIX,
    listKey: 'subjects'
  }, deps);
}

export default createSubjectsHandler();
