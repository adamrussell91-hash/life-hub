import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { isValidOrganisationId, isValidPositionId, isValidUnitId } from './_shared/identity-schema.mjs';
import { formatEntityRef } from './_shared/entity-ref.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { createOrgStructureRepository } from './_shared/org-structure.mjs';
import { createPersonWorkplaceService } from './_shared/person-workplace.mjs';

export const config = { path: '/api/org-structure' };

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

function readOrgId(url) {
  const id = url.searchParams.get('organisation_id') || url.searchParams.get('id');
  if (!id || !isValidOrganisationId(id)) {
    throw Object.assign(new Error('organisation_id query param required.'), {
      status: 400,
      code: 'missing_organisation_id'
    });
  }
  return id;
}

export function createOrgStructureHandler(deps = {}) {
  const createRepo = deps.createOrgStructureRepository ?? createOrgStructureRepository;
  const identityNow = deps.now ?? (() => new Date().toISOString());

  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const url = new URL(request.url);
    const repo = createRepo({
      store,
      now: identityNow,
      resolveEntity: deps.resolveEntity,
      getContentStore: async () => store
    });
    const workplaces = (deps.createPersonWorkplaceService ?? createPersonWorkplaceService)({
      store,
      env,
      fetchImpl: deps.fetchImpl,
      resolveEntity: deps.resolveEntity,
      now: identityNow
    });

    // Chart → profile: whoever holds a role has that role as their job
    // title at this organisation. Never fails the chart write itself.
    async function syncProfileTitle(organisationRef, personRef, title) {
      try {
        await workplaces.setPersonWorkplace(
          { person_ref: personRef, organisation_ref: organisationRef, job_title: title },
          { syncChart: false }
        );
      } catch (error) {
        console.warn('[org-structure] profile title sync failed', error?.code ?? error?.message);
      }
    }

    try {
      if (request.method === 'GET') {
        const organisationId = readOrgId(url);
        const organisationRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: organisationId });
        // Profile → chart: everyone here with a job title gets a box. If the
        // people list is unavailable the chart still loads.
        let peopleHere = [];
        try {
          peopleHere = await workplaces.listOrganisationWorkplaces(organisationRef);
          await repo.syncFromProfiles(organisationId, peopleHere);
        } catch (error) {
          console.warn('[org-structure] profile sync skipped', error?.code ?? error?.message);
        }
        const payload = await repo.getDerivedGraph(organisationId);
        const onChart = new Set(
          (payload.links ?? [])
            .filter((l) => l.relationship_type === 'holds_position' && l.status === 'current')
            .map((l) => l.source_ref)
        );
        payload.people_here = peopleHere.map((p) => ({ ...p, on_chart: onChart.has(p.person_ref) }));
        return withCors(okResponse(200, payload), request, env);
      }

      if (request.method === 'POST') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        assertNoAccessFields(parsed.value);
        const action = url.searchParams.get('action') || parsed.value.action || 'create_unit';
        const organisationRef =
          typeof parsed.value.organisation_ref === 'string'
            ? parsed.value.organisation_ref
            : parsed.value.organisation_id
              ? formatEntityRef({
                  namespace: 'shared',
                  kind: 'organisation',
                  id: parsed.value.organisation_id
                })
              : null;

        if (action === 'create_unit') {
          const record = await repo.createUnit({
            ...parsed.value,
            organisation_ref: organisationRef || parsed.value.organisation_ref
          });
          return withCors(okResponse(201, { unit: record }), request, env);
        }
        if (action === 'create_position') {
          const record = await repo.createPosition({
            ...parsed.value,
            organisation_ref: organisationRef || parsed.value.organisation_ref
          });
          return withCors(okResponse(201, { position: record }), request, env);
        }
        if (action === 'create_link') {
          if (!organisationRef) {
            return withCors(
              errorResponse(400, 'organisation_ref_required', 'organisation_ref is required.', false),
              request,
              env
            );
          }
          const result = await repo.createStructureLink({
            organisationRef,
            relationshipType: parsed.value.relationship_type,
            sourceRef: parsed.value.source_ref,
            targetRef: parsed.value.target_ref,
            role: parsed.value.role ?? null,
            validFrom: parsed.value.valid_from ?? null,
            validTo: parsed.value.valid_to ?? null,
            metadata: parsed.value.metadata ?? {}
          });
          if (parsed.value.relationship_type === 'holds_position') {
            const positionId = String(parsed.value.target_ref ?? '').split(':')[2] ?? '';
            const position = (await repo.loadStructure(organisationRef.slice('shared:organisation:'.length)))
              .positions.find((p) => p.id === positionId);
            if (position) await syncProfileTitle(organisationRef, parsed.value.source_ref, position.title);
          }
          return withCors(okResponse(result.created ? 201 : 200, { link: result.link, created: result.created }), request, env);
        }
        if (action === 'end_link' || action === 'archive_position') {
          const organisationId = organisationRef?.startsWith('shared:organisation:')
            ? organisationRef.slice('shared:organisation:'.length)
            : '';
          if (!isValidOrganisationId(organisationId)) {
            return withCors(
              errorResponse(400, 'organisation_ref_required', 'organisation_ref is required.', false),
              request,
              env
            );
          }
          if (action === 'end_link') {
            const linkId = typeof parsed.value.link_id === 'string' ? parsed.value.link_id : '';
            if (!linkId) {
              return withCors(errorResponse(400, 'link_id_required', 'link_id is required.', false), request, env);
            }
            const link = await repo.endStructureLink(organisationId, linkId);
            return withCors(okResponse(200, { link }), request, env);
          }
          const result = await repo.archivePosition(organisationId, parsed.value.position_id);
          return withCors(okResponse(200, result), request, env);
        }
        return withCors(errorResponse(400, 'invalid_action', 'Unsupported action.', false), request, env);
      }

      if (request.method === 'PATCH') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        assertNoAccessFields(parsed.value);
        const kind = url.searchParams.get('kind') || parsed.value.kind;
        const id = url.searchParams.get('entity_id') || parsed.value.id;
        if (kind === 'layout') {
          const organisationId = readOrgId(url);
          const layout = await repo.saveLayout(organisationId, parsed.value.layout);
          return withCors(okResponse(200, { layout }), request, env);
        }
        if (kind === 'unit') {
          if (!isValidUnitId(id)) {
            return withCors(errorResponse(400, 'invalid_unit_id', 'Invalid unit id.', false), request, env);
          }
          const record = await repo.updateUnit(id, parsed.value);
          return withCors(okResponse(200, { unit: record }), request, env);
        }
        if (kind === 'position') {
          if (!isValidPositionId(id)) {
            return withCors(errorResponse(400, 'invalid_position_id', 'Invalid position id.', false), request, env);
          }
          const record = await repo.updatePosition(id, parsed.value);
          if (typeof parsed.value.title === 'string') {
            const orgId = record.organisation_ref.slice('shared:organisation:'.length);
            for (const personRef of await repo.holdersOf(orgId, id)) {
              await syncProfileTitle(record.organisation_ref, personRef, record.title);
            }
          }
          return withCors(okResponse(200, { position: record }), request, env);
        }
        return withCors(errorResponse(400, 'invalid_kind', 'kind must be unit, position, or layout.', false), request, env);
      }

      return withCors(methodNotAllowed('GET, POST, PATCH, OPTIONS'), request, env);
    } catch (error) {
      return withCors(toErrorResponse(error), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'universal_link_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Universal Link content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetUniversalLinkStore
  });
}

export default createOrgStructureHandler();
