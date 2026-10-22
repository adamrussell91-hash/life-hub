import {
  getJSON,
  newId,
  OUTCOME_PREFIX,
  outcomeKey,
  setJSON,
  slugify,
  subjectKey
} from './_shared/teaching-blobs.mjs';
import { createTeachingCollectionHandler, teachingWriteError } from './_shared/teaching-create.mjs';
import { assertCodeFree } from './_shared/outcome-manage.mjs';

export const config = { path: '/api/outcomes' };

export async function createOutcomeRecord(store, body) {
  const subject_id = typeof body.subject_id === 'string' ? body.subject_id.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const group = typeof body.group === 'string' && body.group.trim() ? body.group.trim() : 'Custom';

  if (!subject_id || !code || !title || !description) {
    throw teachingWriteError(400, 'validation_error', 'subject_id, code, title, and description are required');
  }

  const subject = await getJSON(store, subjectKey(subject_id), { consistency: 'strong' });
  if (!subject || typeof subject !== 'object' || Array.isArray(subject)) {
    throw teachingWriteError(404, 'not_found', 'Subject not found');
  }

  await assertCodeFree(store, subject_id, code);

  const timestamp = new Date().toISOString();
  const id = newId('outcome');
  const record = {
    id,
    type: 'curriculum_outcome',
    source: 'custom',
    title,
    slug: slugify(code),
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1,
    code,
    description,
    group,
    subject_id
  };

  const outcome_ids = Array.isArray(subject.outcome_ids) ? subject.outcome_ids : [];
  await setJSON(store, outcomeKey(id), record);
  await setJSON(store, subjectKey(subject_id), {
    ...subject,
    outcome_ids: [...outcome_ids, id],
    updated_at: timestamp
  });
  return record;
}

export function createOutcomesHandler(deps = {}) {
  return createTeachingCollectionHandler({
    create: createOutcomeRecord,
    listPrefix: OUTCOME_PREFIX,
    listKey: 'outcomes'
  }, deps);
}

export default createOutcomesHandler();
