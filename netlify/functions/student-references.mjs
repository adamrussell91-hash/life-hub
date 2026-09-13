import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createAccessContext, isVisibilityAllowed } from './_shared/entity-access.mjs';
import { createStudentReferenceRepository } from './_shared/student-reference-repository.mjs';

export const config = {
  path: '/api/teaching/student-references',
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 30, windowSize: 60 }
};

const ACTION_KEYS = Object.freeze({
  create: new Set(['action', 'initials']),
  assign: new Set(['action', 'student_ref_id', 'context_type', 'context_id', 'permission_status', 'valid_from', 'valid_to']),
  set_permission: new Set(['action', 'student_ref_id', 'context_type', 'context_id', 'permission_status']),
  archive: new Set(['action', 'student_ref_id']),
  delete: new Set(['action', 'student_ref_id'])
});

function requestError(code = 'invalid_student_reference_request', status = 400) {
  return Object.assign(new Error('Student reference request is invalid.'), { status, code });
}

function validateBody(body) {
  const allowed = ACTION_KEYS[body.action];
  if (!allowed) throw requestError('invalid_action');
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw requestError('field_not_permitted');
  }
}

function safeError(error) {
  const status = Number.isInteger(error?.status) ? error.status : 503;
  const code = typeof error?.code === 'string' ? error.code : 'student_reference_unavailable';
  return errorResponse(status, code, 'Student reference request failed.', status >= 500);
}

export function createStudentReferencesHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }
    try {
      const access = createAccessContext({ workflow: 'teaching', allowedEntityKinds: ['student_reference'] });
      if (!isVisibilityAllowed(access, 'teaching_protected')) throw requestError('teaching_scope_required', 403);
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      validateBody(parsed.value);
      const repo = createStudentReferenceRepository({
        store,
        ...(deps.repositoryNow ? { now: deps.repositoryNow } : {}),
        ...(deps.generateStudentReferenceId ? { generateId: deps.generateStudentReferenceId } : {})
      });
      const body = parsed.value;
      let data;
      if (body.action === 'create') data = await repo.create(body.initials);
      if (body.action === 'assign') data = await repo.assign(body.student_ref_id, body);
      if (body.action === 'set_permission') data = await repo.setPermission(body.student_ref_id, body);
      if (body.action === 'archive') data = await repo.archive(body.student_ref_id);
      if (body.action === 'delete') data = await repo.delete(body.student_ref_id);
      return withCors(okResponse(body.action === 'create' ? 201 : 200, data), request, env);
    } catch (error) {
      return withCors(safeError(error), request, env);
    }
  }, deps);
}

export default createStudentReferencesHandler();
