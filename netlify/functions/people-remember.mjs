import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createRememberFactRepository } from './_shared/remember-repository.mjs';
import { runRememberScanForPerson } from './_shared/remember-service.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { parseEntityRef } from './_shared/entity-ref.mjs';

export const config = { path: '/api/people/remember' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  return errorResponse(status, code, message, Boolean(error?.retryable) || status === 503);
}

export function createPeopleRememberHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const { env } = context;
      const professionalStore =
        deps.professionalStore ??
        (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)(env).catch(() => null));
      if (!professionalStore) {
        return withCors(
          errorResponse(503, 'professional_blobs_unbound', 'Professional content store is not bound.', true),
          request,
          env
        );
      }

      const url = new URL(request.url);
      const repo =
        deps.rememberRepo ??
        createRememberFactRepository({
          store: professionalStore,
          now: deps.now,
          generateId: deps.generateId
        });

      try {
        if (request.method === 'GET') {
          const personRef = url.searchParams.get('person_ref');
          if (!personRef || !parseEntityRef(personRef)) {
            return withCors(
              errorResponse(400, 'missing_person_ref', 'person_ref query param required.', false),
              request,
              env
            );
          }
          const facts = await repo.listForPerson(personRef, { status: 'active' });
          return withCors(okResponse(200, { facts, count: facts.length }), request, env);
        }

        if (request.method === 'POST') {
          const body = await readJsonObject(request);
          const action = body?.action ?? url.searchParams.get('action');

          if (action === 'run' || action === 'ann_scan') {
            const personRef = body?.person_ref;
            if (!personRef || !parseEntityRef(personRef)) {
              return withCors(
                errorResponse(400, 'missing_person_ref', 'person_ref required.', false),
                request,
                env
              );
            }
            const result = await runRememberScanForPerson(personRef, {
              ...deps,
              env,
              professionalStore,
              displayName: body?.display_name
            });
            const facts = await repo.listForPerson(personRef, { status: 'active' });
            return withCors(
              okResponse(200, {
                ...result,
                facts,
                note:
                  result.count > 0
                    ? `Ann found ${result.count} fact${result.count === 1 ? '' : 's'}.`
                    : "Ann hasn't found anything yet."
              }),
              request,
              env
            );
          }

          if (action === 'create') {
            const result = await repo.createFact({ ...body, author: body.author ?? 'adam' });
            return withCors(okResponse(200, result), request, env);
          }

          if (action === 'patch') {
            if (!body?.id) {
              return withCors(errorResponse(400, 'missing_id', 'id required.', false), request, env);
            }
            const fact = await repo.patchFact(body.id, body, { actor: body.actor ?? 'adam' });
            return withCors(okResponse(200, { fact }), request, env);
          }

          if (action === 'reorder') {
            if (!body?.person_ref || !parseEntityRef(body.person_ref)) {
              return withCors(
                errorResponse(400, 'missing_person_ref', 'person_ref required.', false),
                request,
                env
              );
            }
            const facts = await repo.reorder(body.person_ref, body.ordered_ids ?? []);
            return withCors(okResponse(200, { facts }), request, env);
          }

          return withCors(
            errorResponse(400, 'invalid_action', 'Unknown remember action.', false),
            request,
            env
          );
        }

        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      } catch (error) {
        return withCors(toErrorResponse(error), request, env);
      }
    },
    {
      ...deps,
      requireStore: false
    }
  );
}

export default createPeopleRememberHandler();
