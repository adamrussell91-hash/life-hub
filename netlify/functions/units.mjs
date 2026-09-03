import {
  getJSON,
  newId,
  setJSON,
  slugify,
  subjectKey,
  unitKey,
  yearKey
} from './_shared/teaching-blobs.mjs';
import { createTeachingCollectionHandler, teachingWriteError } from './_shared/teaching-create.mjs';

export const config = { path: '/api/units' };

export async function createUnitRecord(store, body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const year_id = typeof body.year_id === 'string' ? body.year_id : '';
  const subject_id = typeof body.subject_id === 'string' ? body.subject_id : '';
  const description = typeof body.description === 'string' ? body.description : undefined;

  if (!title || !year_id || !subject_id) {
    throw teachingWriteError(400, 'validation_error', 'title, year_id, and subject_id are required');
  }

  if (!(await getJSON(store, yearKey(year_id)))) {
    throw teachingWriteError(404, 'not_found', 'Year not found');
  }
  const subject = await getJSON(store, subjectKey(subject_id));
  if (!subject) throw teachingWriteError(404, 'not_found', 'Subject not found');

  const timestamp = new Date().toISOString();
  const id = newId('unit');
  const record = {
    id,
    type: 'unit',
    title,
    slug: slugify(title),
    year_id,
    subject_id,
    lesson_ids: [],
    ...(description === undefined ? {} : { description }),
    blocks: Array.isArray(body.blocks) ? body.blocks : [],
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };

  const unitIds = Array.isArray(subject.unit_ids) ? subject.unit_ids : [];
  await setJSON(store, unitKey(id), record);
  await setJSON(store, subjectKey(subject_id), {
    ...subject,
    unit_ids: [...unitIds, id],
    updated_at: timestamp
  });
  return record;
}

export function createUnitsHandler(deps = {}) {
  return createTeachingCollectionHandler({ create: createUnitRecord }, deps);
}

export default createUnitsHandler();
