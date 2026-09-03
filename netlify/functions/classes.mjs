import {
  classKey,
  getJSON,
  newId,
  setJSON,
  slugify,
  subjectKey,
  yearKey
} from './_shared/teaching-blobs.mjs';
import { createTeachingCollectionHandler, teachingWriteError } from './_shared/teaching-create.mjs';

export const config = { path: '/api/classes' };

export async function createClassRecord(store, body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const year_id = typeof body.year_id === 'string' ? body.year_id : '';
  const subject_id = typeof body.subject_id === 'string' ? body.subject_id : '';
  const academic_year =
    typeof body.academic_year === 'number' && Number.isInteger(body.academic_year)
      ? body.academic_year
      : NaN;

  if (!title || !code || !year_id || !subject_id || !Number.isFinite(academic_year)) {
    throw teachingWriteError(
      400,
      'validation_error',
      'title, code, academic_year, year_id, and subject_id are required'
    );
  }

  const year = await getJSON(store, yearKey(year_id));
  if (!year) throw teachingWriteError(404, 'not_found', 'Year not found');
  const subject = await getJSON(store, subjectKey(subject_id));
  if (!subject) throw teachingWriteError(404, 'not_found', 'Subject not found');

  const timestamp = new Date().toISOString();
  const id = newId('class');
  const record = {
    id,
    type: 'class',
    title,
    slug: slugify(title),
    code,
    academic_year,
    year_id,
    subject_id,
    active_unit_ids: [],
    homepage: { announcements: [], resources: [], custom: [] },
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };

  const classIds = Array.isArray(subject.class_ids) ? subject.class_ids : [];
  if (!classIds.includes(id)) {
    await setJSON(store, subjectKey(subject_id), {
      ...subject,
      class_ids: [...classIds, id],
      updated_at: timestamp
    });
  }
  const subjectIds = Array.isArray(year.subject_ids) ? year.subject_ids : [];
  if (!subjectIds.includes(subject_id)) {
    await setJSON(store, yearKey(year_id), {
      ...year,
      subject_ids: [...subjectIds, subject_id],
      updated_at: timestamp
    });
  }
  await setJSON(store, classKey(id), record);
  return record;
}

export function createClassesHandler(deps = {}) {
  return createTeachingCollectionHandler({ create: createClassRecord }, deps);
}

export default createClassesHandler();
