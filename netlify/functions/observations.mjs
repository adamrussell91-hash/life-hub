import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createObservationRepository } from './_shared/observation-repository.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';

export const config = { path: '/api/observations' };

// Same forbidden-access-fields list communications.mjs and
// communication-repository.mjs each already define independently — no
// shared helper for this exact list exists yet in _shared/, so this is a
// third copy consistent with that existing (pre-existing) duplication
// pattern rather than a new one.
const FORBIDDEN_ACCESS_FIELDS = ['actor', 'workflow', 'allowed_visibility', 'allowed_entity_kinds'];

function assertNoAccessFields(value) {
  for (const key of FORBIDDEN_ACCESS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      throw Object.assign(new Error(`Field "${key}" is not accepted in this request.`), {
        status: 400,
        code: 'access_field_not_accepted'
      });
    }
  }
}

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  const retryable = Boolean(error?.retryable) || status === 503;
  return errorResponse(status, code, message, retryable);
}

export function createObservationsHandler(deps = {}) {
  const observationNow = deps.observationNow ?? (() => new Date().toISOString());
  const createRepository = deps.createObservationRepository ?? createObservationRepository;

  return createOperatorHandler(
    async (request, context) => {
      const { store } = context;
      const env = deps.env ?? context.env;
      const url = new URL(request.url);
      const repo = createRepository({
        store,
        now: observationNow,
        generateId: deps.generateId
      });

      try {
        if (request.method === 'GET') {
          const aboutRef = url.searchParams.get('about_ref');
          if (!aboutRef) {
            return withCors(
              errorResponse(400, 'missing_about_ref', 'about_ref query param required.', false),
              request,
              env
            );
          }
          const observations = await repo.listObservationsForAboutRef(aboutRef);
          return withCors(okResponse(200, { observations }), request, env);
        }

        if (request.method === 'POST') {
          // about_ref comes from the JSON body, not the query string. This
          // deliberately deviates from the plan document's shorthand route
          // notation (`GET/POST /api/observations?about_ref=<ref>`) — a POST
          // body is the correct place for create-time fields including
          // about_ref, matching how communications.mjs's POST reads
          // everything (direction, channel, links, ...) from the body with
          // no query params at all.
          const parsed = await readJsonObject(request);
          if (parsed.error) return withCors(parsed.error, request, env);
          assertNoAccessFields(parsed.value);
          const result = await repo.createObservation(parsed.value);
          return withCors(okResponse(201, result), request, env);
        }

        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      } catch (error) {
        return withCors(toErrorResponse(error), request, env);
      }
    },
    {
      ...deps,
      unboundCode: deps.unboundCode ?? 'professional_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
}

export default createObservationsHandler();
