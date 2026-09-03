import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  CLASS_PREFIX,
  COMPOSITION_PREFIX,
  DRAFT_LESSON_PREFIX,
  OUTCOME_PREFIX,
  SUBJECT_PREFIX,
  UNIT_PREFIX,
  YEAR_PREFIX,
  listJSON
} from './_shared/teaching-blobs.mjs';
import {
  mergeSearchHits,
  runContentSearch,
  searchTeachingRecords
} from './_shared/teaching-search.mjs';

export const config = { path: '/api/search' };

const TITLE_CORPUS = [
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
    const [lessons, units, compositions, ...titleGroups] = await Promise.all([
      listJSON(store, DRAFT_LESSON_PREFIX),
      listJSON(store, UNIT_PREFIX),
      listJSON(store, COMPOSITION_PREFIX),
      ...TITLE_CORPUS.map(({ prefix, type }) =>
        listJSON(store, prefix).then(records => searchTeachingRecords(q, records, type))
      )
    ]);

    const titleHits = titleGroups.flat();
    const activeCompositions = compositions.filter(item => item.status === 'active' || !item.status);
    const bodyHits = runContentSearch(q, {
      lessons,
      units,
      compositions: activeCompositions
    });
    return withCors(okResponse(200, { hits: mergeSearchHits(titleHits, bodyHits) }), request, env);
  }, deps);
}

export default createSearchHandler();
