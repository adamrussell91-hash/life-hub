import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createAccessContext } from './_shared/entity-access.mjs';
import { createStudentReferenceRepository } from './_shared/student-reference-repository.mjs';
import { defaultGetContentStore } from './_shared/teaching-blobs.mjs';

// Teaching-scoped, protected StudentReference API. Deliberately POST-only
// for every mutation — the server derives the `teaching` workflow itself;
// nothing here accepts a client-supplied workflow, actor, or visibility
// (implementation programme, "Authorisation model"). There is no PATCH/
// DELETE HTTP verb: archive, unarchive, delete, assign, end_membership,
// and set_permission_status are all POST actions — this route is never
// reachable through `/api/universal-links` or `/api/entities`, and every
// response (success or error) carries `cache-control: no-store`.
//
// This module intentionally does not add a second privacy/authorisation
// system: the only gate is the existing single-operator session
// (`createOperatorHandler`) plus the server-derived `teaching` workflow.
// `rateLimit` below is the Netlify platform's own declarative rate limiter
// (the same primitive `auth.mjs`/`knowledge-auth-login.mjs` already use),
// not custom application logic.
export const config = {
  path: '/api/student-references',
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 30, windowSize: 60 }
};

// Strict per-action field whitelists — a request carrying any field this
// action does not declare is rejected outright, before any repository
// call. `action` itself is always allowed.
const ACTION_FIELDS = {
  create: new Set(['initials']),
  repair_create: new Set(['operation_id']),
  archive: new Set(['id']),
  unarchive: new Set(['id']),
  delete: new Set(['id', 'reason']),
  assign: new Set(['student_id', 'context_type', 'context_ref', 'valid_from', 'permission_status']),
  end_membership: new Set(['student_id', 'context_type', 'context_ref', 'valid_to']),
  set_permission_status: new Set(['student_id', 'context_type', 'context_ref', 'status']),
  repair_set_permission_status: new Set(['operation_id'])
};

function validationError(code, message) {
  return errorResponse(400, code, message, false);
}

function fieldError(message) {
  return Object.assign(new Error(message), { status: 400, code: 'invalid_field' });
}

function assertStrictFields(body, action) {
  const allowed = ACTION_FIELDS[action];
  for (const key of Object.keys(body)) {
    if (key === 'action') continue;
    if (!allowed.has(key)) {
      throw fieldError(`Field "${key}" is not accepted for action "${action}".`);
    }
  }
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
  const retryable = Boolean(error?.retryable) || status === 503;
  const data = error?.operation_id
    ? { operation_id: error.operation_id, student_id: error.student_id ?? null }
    : undefined;
  return errorResponse(status, code, message, retryable, {}, data);
}

// Every response from this route — success or error — carries
// `cache-control: no-store`. Applied once, at the very end of
// `createStudentReferencesHandler` below (wrapping both this callback's
// responses and the operator gate's own early exits), so no code path —
// including one added later — can forget it.
function noStore(response) {
  response.headers.set('cache-control', 'no-store');
  return response;
}

function respond(response, request, env) {
  return withCors(response, request, env);
}

export function createStudentReferencesHandler(deps = {}) {
  const createRepository = deps.createRepository ?? createStudentReferenceRepository;

  const handler = createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const accessContext = createAccessContext({ workflow: 'teaching' });
    let repo;
    try {
      repo = createRepository({
        teachingStore: store,
        accessContext,
        ...(deps.getUniversalLinkStore ? { getUniversalLinkStore: deps.getUniversalLinkStore } : {}),
        ...(deps.baseResolveEntity ? { baseResolveEntity: deps.baseResolveEntity } : {}),
        ...(deps.repositoryNow ? { now: deps.repositoryNow } : {}),
        ...(deps.generateId ? { generateId: deps.generateId } : {}),
        ...(deps.generateOperationId ? { generateOperationId: deps.generateOperationId } : {})
      });
    } catch (error) {
      return respond(toErrorResponse(error), request, env);
    }

    try {
      if (request.method === 'GET') {
        const url = new URL(request.url);
        const id = url.searchParams.get('id') ?? '';
        if (!id) return respond(validationError('missing_id', 'id query param required.'), request, env);
        const student = await repo.get(id);
        return respond(okResponse(200, { student }), request, env);
      }

      if (request.method === 'POST') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return respond(parsed.error, request, env);
        const body = parsed.value;
        const action = body.action;
        if (!Object.prototype.hasOwnProperty.call(ACTION_FIELDS, action)) {
          return respond(
            validationError('invalid_action', `action must be one of: ${Object.keys(ACTION_FIELDS).join(', ')}.`),
            request,
            env
          );
        }
        assertStrictFields(body, action);

        if (action === 'create') {
          const result = await repo.create(requiredString(body.initials, 'initials'));
          return respond(okResponse(201, result), request, env);
        }
        if (action === 'repair_create') {
          const result = await repo.repairCreate(requiredString(body.operation_id, 'operation_id'));
          return respond(okResponse(200, result), request, env);
        }
        if (action === 'archive') {
          const student = await repo.archive(requiredString(body.id, 'id'));
          return respond(okResponse(200, { student }), request, env);
        }
        if (action === 'unarchive') {
          const student = await repo.unarchive(requiredString(body.id, 'id'));
          return respond(okResponse(200, { student }), request, env);
        }
        if (action === 'delete') {
          const result = await repo.delete(requiredString(body.id, 'id'), requiredString(body.reason, 'reason'));
          return respond(okResponse(200, result), request, env);
        }
        if (action === 'assign') {
          const result = await repo.assign({
            studentId: requiredString(body.student_id, 'student_id'),
            contextType: requiredString(body.context_type, 'context_type'),
            contextRef: requiredString(body.context_ref, 'context_ref'),
            validFrom: optionalString(body.valid_from, 'valid_from'),
            permissionStatus: optionalString(body.permission_status, 'permission_status')
          });
          return respond(okResponse(result.created ? 201 : 200, result), request, env);
        }
        if (action === 'end_membership') {
          const link = await repo.endMembership({
            studentId: requiredString(body.student_id, 'student_id'),
            contextType: requiredString(body.context_type, 'context_type'),
            contextRef: requiredString(body.context_ref, 'context_ref'),
            validTo: optionalString(body.valid_to, 'valid_to')
          });
          return respond(okResponse(200, { link }), request, env);
        }
        if (action === 'set_permission_status') {
          const result = await repo.setPermissionStatus({
            studentId: requiredString(body.student_id, 'student_id'),
            contextType: requiredString(body.context_type, 'context_type'),
            contextRef: requiredString(body.context_ref, 'context_ref'),
            status: requiredString(body.status, 'status')
          });
          return respond(okResponse(200, result), request, env);
        }
        // repair_set_permission_status
        const result = await repo.repairSetPermissionStatus(requiredString(body.operation_id, 'operation_id'));
        return respond(okResponse(200, result), request, env);
      }

      return respond(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    } catch (error) {
      return respond(toErrorResponse(error), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'teaching_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Teaching content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetContentStore
  });

  // Every response from this route carries `cache-control: no-store`,
  // including the operator gate's own early exits (401/403/405/
  // misconfigured/preflight) that never reach the callback above.
  return async (request, context) => noStore(await handler(request, context));
}

export default createStudentReferencesHandler();
