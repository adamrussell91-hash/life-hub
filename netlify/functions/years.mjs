import {
  newId,
  setJSON,
  slugify,
  YEAR_PREFIX,
  yearKey
} from './_shared/teaching-blobs.mjs';
import { createTeachingCollectionHandler, teachingWriteError } from './_shared/teaching-create.mjs';

export const config = { path: '/api/years' };

export async function createYearRecord(store, body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const year_level =
    typeof body.year_level === 'number' && Number.isInteger(body.year_level) && body.year_level > 0
      ? body.year_level
      : NaN;
  if (!title || !Number.isFinite(year_level)) {
    throw teachingWriteError(400, 'validation_error', 'title and a positive year_level are required');
  }

  const timestamp = new Date().toISOString();
  const id = newId('year');
  const record = {
    id,
    type: 'year',
    title,
    slug: slugify(title),
    year_level,
    subject_ids: [],
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };
  await setJSON(store, yearKey(id), record);
  return record;
}

export function createYearsHandler(deps = {}) {
  return createTeachingCollectionHandler({
    create: createYearRecord,
    listPrefix: YEAR_PREFIX,
    listKey: 'years'
  }, deps);
}

export default createYearsHandler();
