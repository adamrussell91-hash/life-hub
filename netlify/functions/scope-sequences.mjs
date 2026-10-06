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

/** Same shape the Teaching client reads (title + term_number), four equal terms. */
export function defaultScopeTerms(weekCount, academicYear) {
  const termWeeks = Math.floor(weekCount / 4);
  return [1, 2, 3, 4].map(term_number => ({
    id: `term${term_number}_${academicYear}`,
    title: `Term ${term_number}`,
    term_number,
    start_week: (term_number - 1) * termWeeks + 1,
    end_week: term_number === 4 ? weekCount : term_number * termWeeks
  }));
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
