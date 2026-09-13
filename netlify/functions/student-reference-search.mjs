import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createAccessContext } from './_shared/entity-access.mjs';
import { createStudentReferenceRepository } from './_shared/student-reference-repository.mjs';
import { defaultGetContentStore } from './_shared/teaching-blobs.mjs';

// Separate, POST-only Teaching-scoped search route (implementation
// programme, "StudentReference privacy gate": "Teaching protected search
// uses a separate handler and server supplied Teaching workflow context").
// Deliberately its own file rather than a GET query param on
// student-references.mjs: it must never be reachable from, or confused
// with, `/api/entities/search` (entity-search.mjs never lists
// `student_reference` in SUPPORTED_KINDS). POST rather than GET keeps a
// student code search query out of server access logs and browser history.
export const config = { path: '/api/student-references/search' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  return errorResponse(status, code, message, false);
}

export function createStudentReferenceSearchHandler(deps = {}) {
  const createRepository = deps.createRepository ?? createStudentReferenceRepository;

  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }

    const accessContext = createAccessContext({ workflow: 'teaching' });
    let repo;
    try {
      repo = createRepository({
        teachingStore: store,
        accessContext,
        ...(deps.getUniversalLinkStore ? { getUniversalLinkStore: deps.getUniversalLinkStore } : {}),
        ...(deps.baseResolveEntity ? { baseResolveEntity: deps.baseResolveEntity } : {}),
        ...(deps.repositoryNow ? { now: deps.repositoryNow } : {})
      });
    } catch (error) {
      return withCors(toErrorResponse(error), request, env);
    }

    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);

    try {
      const results = await repo.search({
        contextType: parsed.value.context_type,
        contextRef: parsed.value.context_ref,
        query: parsed.value.query
      });
      return withCors(okResponse(200, { results }, { 'cache-control': 'no-store' }), request, env);
    } catch (error) {
      return withCors(toErrorResponse(error), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'teaching_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Teaching content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetContentStore
  });
}

export default createStudentReferenceSearchHandler();
