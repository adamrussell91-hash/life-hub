import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  CLASS_PREFIX,
  DRAFT_LESSON_PREFIX,
  OUTCOME_PREFIX,
  SUBJECT_PREFIX,
  UNIT_PREFIX,
  YEAR_PREFIX,
  listJSON
} from './_shared/teaching-blobs.mjs';
import { searchTeachingRecords } from './_shared/teaching-search.mjs';

export const config = { path: '/api/search' };

const CORPUS = [
  { prefix: DRAFT_LESSON_PREFIX, type: 'lesson' },
  { prefix: UNIT_PREFIX, type: 'unit' },
  { prefix: CLASS_PREFIX, type: 'class' },
  { prefix: YEAR_PREFIX, type: 'year' },
  { prefix: SUBJECT_PREFIX, type: 'subject' },
  { prefix: OUTCOME_PREFIX, type: 'outcome' }
];

export function createSearchHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }

    const q = new URL(request.url).searchParams.get('q') ?? '';
    const groups = await Promise.all(
      CORPUS.map(async ({ prefix, type }) => searchTeachingRecords(q, await listJSON(store, prefix), type))
    );
    return withCors(okResponse(200, { hits: groups.flat() }), request, env);
  }, deps);
}

export default createSearchHandler();
