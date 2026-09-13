import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createAccessContext, isVisibilityAllowed } from './_shared/entity-access.mjs';
import { createStudentReferenceRepository } from './_shared/student-reference-repository.mjs';

export const config = {
  path: '/api/teaching/student-references/search',
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 60, windowSize: 60 }
};

const ALLOWED_KEYS = new Set(['context_type', 'context_id', 'query']);

export function createStudentReferenceSearchHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    try {
      const access = createAccessContext({ workflow: 'teaching', allowedEntityKinds: ['student_reference'] });
      if (!isVisibilityAllowed(access, 'teaching_protected')) {
        return withCors(errorResponse(403, 'teaching_scope_required', 'Student reference request failed.', false), request, env);
      }
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      if (Object.keys(parsed.value).some(key => !ALLOWED_KEYS.has(key))) {
        return withCors(errorResponse(400, 'field_not_permitted', 'Student reference request failed.', false), request, env);
      }
      const repo = createStudentReferenceRepository({ store });
      const results = await repo.search(parsed.value);
      return withCors(okResponse(200, { results }), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 503;
      const code = typeof error?.code === 'string' ? error.code : 'student_reference_unavailable';
      return withCors(errorResponse(status, code, 'Student reference request failed.', status >= 500), request, env);
    }
  }, deps);
}

export default createStudentReferenceSearchHandler();
