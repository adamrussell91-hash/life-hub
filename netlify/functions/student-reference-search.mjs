import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createAccessContext } from './_shared/entity-access.mjs';
import { createStudentReferenceRepository } from './_shared/student-reference-repository.mjs';
import { defaultGetContentStore } from './_shared/teaching-blobs.mjs';

// Separate, POST-only Teaching-scoped search route — Teaching protected
// search uses its own handler and server-supplied Teaching workflow
// context, distinct from student-references.mjs. It must never be
// reachable from, or confused with, `/api/entities/search`
// (entity-search.mjs never lists `student_reference` in SUPPORTED_KINDS).
// POST rather than GET keeps a student code search query out of server
// access logs and browser history. Every response carries
// `cache-control: no-store`. `rateLimit` is the Netlify platform's own
// declarative limiter (same primitive as `auth.mjs`), not custom logic —
// this route adds no privacy or authorisation system beyond the existing
// single-operator session plus the server-derived `teaching` workflow.
export const config = {
  path: '/api/student-references/search',
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 60, windowSize: 60 }
};

const SEARCH_FIELDS = new Set(['context_type', 'context_ref', 'query']);

function fieldError(message) {
  return Object.assign(new Error(message), { status: 400, code: 'invalid_field' });
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw fieldError(`${field} is required and must be a non-empty string.`);
  }
  return value;
}

function optionalString(value, field) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw fieldError(`${field} must be a string.`);
  }
  return value;
}

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  return errorResponse(status, code, message, false);
}

function noStore(response) {
  response.headers.set('cache-control', 'no-store');
  return response;
}

export function createStudentReferenceSearchHandler(deps = {}) {
  const createRepository = deps.createRepository ?? createStudentReferenceRepository;

  const handler = createOperatorHandler(async (request, context) => {
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
    const body = parsed.value;

    try {
      for (const key of Object.keys(body)) {
        if (!SEARCH_FIELDS.has(key)) throw fieldError(`Field "${key}" is not accepted.`);
      }
      const results = await repo.search({
        contextType: requiredString(body.context_type, 'context_type'),
        contextRef: requiredString(body.context_ref, 'context_ref'),
        query: optionalString(body.query, 'query')
      });
      return withCors(okResponse(200, { results }), request, env);
    } catch (error) {
      return withCors(toErrorResponse(error), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'teaching_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Teaching content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetContentStore
  });

  return async (request, context) => noStore(await handler(request, context));
}

export default createStudentReferenceSearchHandler();
