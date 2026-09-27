import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { formatEntityRef, parseEntityRef } from './_shared/entity-ref.mjs';
import { isValidOrganisationId } from './_shared/identity-schema.mjs';
import { createOrganisationReadStore } from './_shared/organisation-read.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';

export const config = { path: '/api/organisation-read' };

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
  const data = error?.read ? { read: error.read } : undefined;
  return errorResponse(status, code, message, retryable, {}, data);
}

function readOrganisationRef(url, body = null) {
  const fromQuery =
    url.searchParams.get('organisation_ref') ||
    (url.searchParams.get('organisation_id')
      ? formatEntityRef({
          namespace: 'shared',
          kind: 'organisation',
          id: url.searchParams.get('organisation_id')
        })
      : null);
  const fromBody =
    typeof body?.organisation_ref === 'string'
      ? body.organisation_ref
      : body?.organisation_id && isValidOrganisationId(body.organisation_id)
        ? formatEntityRef({
            namespace: 'shared',
            kind: 'organisation',
            id: body.organisation_id
          })
        : null;
  const ref = fromQuery || fromBody;
  if (!ref || !parseEntityRef(ref)) {
    throw Object.assign(new Error('organisation_ref query param required.'), {
      status: 400,
      code: 'missing_organisation_ref'
    });
  }
  return ref;
}

export function createOrganisationReadHandler(deps = {}) {
  const createStore = deps.createOrganisationReadStore ?? createOrganisationReadStore;
  const readNow = deps.now ?? (() => new Date().toISOString());

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      const url = new URL(request.url);
      const readStore = createStore({
        store,
        now: readNow
      });

      try {
        if (request.method === 'GET') {
          const organisationRef = readOrganisationRef(url);
          const read = await readStore.loadRead(organisationRef);
          return withCors(okResponse(200, { read }), request, env);
        }

        if (request.method === 'POST') {
          const parsed = await readJsonObject(request);
          if (parsed.error) return withCors(parsed.error, request, env);
          assertNoAccessFields(parsed.value ?? {});
          const action = url.searchParams.get('action') || parsed.value?.action || 'run_now';
          if (action !== 'run_now') {
            return withCors(
              errorResponse(400, 'invalid_action', 'Unsupported action.', false),
              request,
              env
            );
          }
          const organisationRef = readOrganisationRef(url, parsed.value);
          // Context inputs may be supplied by the caller (tests / future job
          // assembler). When omitted, run with empty six-input shells so the
          // empty/error states stay fail-visible rather than inventing data.
          const contextInputs = parsed.value?.context ?? {};
          const result = await readStore.runNow({
            organisationRef,
            contextInputs: {
              structure: contextInputs.structure,
              memberships: contextInputs.memberships,
              warmthByUnit: contextInputs.warmth_by_unit ?? contextInputs.warmthByUnit,
              observations: contextInputs.observations,
              meetings: contextInputs.meetings,
              openOpportunities:
                contextInputs.open_opportunities ?? contextInputs.openOpportunities
            },
            complete: deps.complete ?? null
          });
          return withCors(
            okResponse(200, {
              read: result.read,
              created: result.created,
              request_preview: {
                has_structure: Boolean(result.request?.finalRequest?.includes('## STRUCTURE')),
                membership_count: result.context?.memberships?.length ?? 0
              }
            }),
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
      unboundCode: deps.unboundCode ?? 'professional_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
}

export default createOrganisationReadHandler();
