import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  getJSON,
  newId,
  scopeSequenceKey,
  setJSON,
  slugify,
  subjectKey
} from './_shared/teaching-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/scope-sequences' };

export function defaultScopeTerms(weekCount, academicYear) {
  return [
    { id: `term1_${academicYear}`, label: 'Term 1', start_week: 1, end_week: 10 },
    { id: `term2_${academicYear}`, label: 'Term 2', start_week: 11, end_week: 20 },
    { id: `term3_${academicYear}`, label: 'Term 3', start_week: 21, end_week: 30 },
    { id: `term4_${academicYear}`, label: 'Term 4', start_week: 31, end_week: weekCount }
  ];
}

export async function createScopeSequenceRecord(store, body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const subject_id = typeof body.subject_id === 'string' ? body.subject_id : '';
  const academic_year = typeof body.academic_year === 'number' && Number.isInteger(body.academic_year)
    ? body.academic_year
    : NaN;
  if (!title || !subject_id || !Number.isFinite(academic_year)) {
    const error = new Error('title, subject_id, and academic_year are required');
    error.status = 400;
    error.code = 'validation_error';
    throw error;
  }
  const subject = await getJSON(store, subjectKey(subject_id));
  if (!subject) {
    const error = new Error('Subject not found');
    error.status = 404;
    error.code = 'not_found';
    throw error;
  }
  const week_count = 40;
  const timestamp = new Date().toISOString();
  const id = newId('scope');
  const record = {
    id,
    type: 'scope_sequence',
    title,
    slug: slugify(title),
    subject_id,
    academic_year,
    week_count,
    terms: defaultScopeTerms(week_count, academic_year),
    timeline_items: [],
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };
  await setJSON(store, scopeSequenceKey(id), record);
  await setJSON(store, subjectKey(subject_id), {
    ...subject,
    scope_id: id,
    updated_at: timestamp
  });
  return record;
}

export function createScopeSequencesHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    try {
      const record = await createScopeSequenceRecord(store, parsed.value);
      return withCors(okResponse(201, record), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 503;
      return withCors(
        errorResponse(
          status,
          error?.code ?? 'blobs_unbound',
          error?.status ? error.message : 'Teaching content store is not bound.',
          status >= 500
        ),
        request,
        env
      );
    }
  }, deps);
}

export default createScopeSequencesHandler();
