import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createAccessContext } from './_shared/entity-access.mjs';
import { createStudentReferenceRepository } from './_shared/student-reference-repository.mjs';
import { defaultGetContentStore } from './_shared/teaching-blobs.mjs';

// Teaching-scoped, protected StudentReference API (implementation
// programme "Slice 8"). Deliberately POST-only for every mutation — the
// server derives the `teaching` workflow itself; nothing here accepts a
// client-supplied workflow, actor, or visibility (implementation
// programme, "Authorisation model"). There is no PATCH/DELETE HTTP verb:
// archive, unarchive, delete, assign, end_membership, and
// set_permission_status are all POST actions, matching PR 327's original
// "no canonical StudentReference routes" boundary — this route is never
// reachable through `/api/universal-links` or `/api/entities`.
export const config = { path: '/api/student-references' };

const ACTIONS = new Set([
  'create',
  'repair_create',
  'archive',
  'unarchive',
  'delete',
  'assign',
  'end_membership',
  'set_permission_status'
]);

function validationError(code, message) {
  return errorResponse(400, code, message, false);
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

export function createStudentReferencesHandler(deps = {}) {
  const createRepository = deps.createRepository ?? createStudentReferenceRepository;

  return createOperatorHandler(async (request, context) => {
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
        ...(deps.generateId ? { generateId: deps.generateId } : {})
      });
    } catch (error) {
      return withCors(toErrorResponse(error), request, env);
    }

    try {
      if (request.method === 'GET') {
        const url = new URL(request.url);
        const id = url.searchParams.get('id') ?? '';
        if (!id) return withCors(validationError('missing_id', 'id query param required.'), request, env);
        const student = await repo.get(id);
        return withCors(okResponse(200, { student }, { 'cache-control': 'no-store' }), request, env);
      }

      if (request.method === 'POST') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const body = parsed.value;
        const action = body.action;
        if (!ACTIONS.has(action)) {
          return withCors(validationError('invalid_action', `action must be one of: ${[...ACTIONS].join(', ')}.`), request, env);
        }

        if (action === 'create') {
          const result = await repo.create(body.initials);
          return withCors(okResponse(201, result), request, env);
        }
        if (action === 'repair_create') {
          const result = await repo.repairCreate(body.operation_id);
          return withCors(okResponse(200, result), request, env);
        }
        if (action === 'archive') {
          const student = await repo.archive(body.id);
          return withCors(okResponse(200, { student }), request, env);
        }
        if (action === 'unarchive') {
          const student = await repo.unarchive(body.id);
          return withCors(okResponse(200, { student }), request, env);
        }
        if (action === 'delete') {
          const result = await repo.delete(body.id, body.reason);
          return withCors(okResponse(200, result), request, env);
        }
        if (action === 'assign') {
          const result = await repo.assign({
            studentId: body.student_id,
            contextType: body.context_type,
            contextRef: body.context_ref,
            validFrom: body.valid_from,
            permissionStatus: body.permission_status
          });
          return withCors(okResponse(result.created ? 201 : 200, result), request, env);
        }
        if (action === 'end_membership') {
          const link = await repo.endMembership({
            studentId: body.student_id,
            contextType: body.context_type,
            contextRef: body.context_ref,
            validTo: body.valid_to
          });
          return withCors(okResponse(200, { link }), request, env);
        }
        // set_permission_status
        const result = await repo.setPermissionStatus({
          studentId: body.student_id,
          contextType: body.context_type,
          contextRef: body.context_ref,
          status: body.status,
          changedAt: body.changed_at
        });
        return withCors(okResponse(200, result), request, env);
      }

      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
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

export default createStudentReferencesHandler();
