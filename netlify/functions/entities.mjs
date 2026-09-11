import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { assertRegisteredEntityRef, formatEntityRef } from './_shared/entity-ref.mjs';
import {
  assertLifecycleTransitionAllowed,
  applyLifecycleTransition,
  writeLifecycleEvent
} from './_shared/entity-lifecycle.mjs';
import {
  generateOrganisationId,
  generatePersonId,
  IDENTITY_SCHEMA_VERSION,
  buildIdentityIndexRecord,
  displayLabelFor,
  parseOrganisationRecord,
  parsePersonRecord,
  redactIdentityRecord,
  validateOrganisationCreateInput,
  validateOrganisationFieldUpdate,
  validatePersonCreateInput,
  validatePersonFieldUpdate
} from './_shared/identity-schema.mjs';
import {
  defaultGetUniversalLinkStore,
  getJSON,
  organisationIndexKey,
  organisationKey,
  personIndexKey,
  personKey,
  setJSON,
  listPersonIndexKeys
} from './_shared/universal-link-blobs.mjs';

export const config = { path: '/api/entities' };

// This API owns Person and Organisation directly — unlike
// `entity-resolvers.mjs`'s generic `resolveEntity` (used by *other* domains
// to safely reference an entity), a lookup here already names an exact ref
// the caller manages, so archived/deleted/deidentified records are visible
// here regardless of the resolver's "hidden from ordinary suggestions"
// default (implementation programme, resolver rule 4: archived entities
// resolve "for deliberate overview and archive workflows" — this handler
// is exactly that).
const SUPPORTED_KINDS = new Set(['person', 'organisation']);

// Lifecycle actions map to the target `lifecycle_status`; `update` is the
// one non-lifecycle action, changing ordinary fields only.
const LIFECYCLE_ACTIONS = {
  activate: 'active',
  deactivate: 'inactive',
  archive: 'archived',
  retain: 'retained',
  deidentify: 'deidentified',
  delete: 'deleted'
};

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

function notFound() {
  return Object.assign(new Error('Entity not found.'), { status: 404, code: 'entity_not_found' });
}

async function loadEntity(store, ref) {
  if (ref.kind === 'person') {
    const record = parsePersonRecord(await getJSON(store, personKey(ref.id)));
    if (!record) throw notFound();
    return record;
  }
  const record = parseOrganisationRecord(await getJSON(store, organisationKey(ref.id)));
  if (!record) throw notFound();
  return record;
}

async function writeEntity(store, kind, record) {
  const key = kind === 'person' ? personKey(record.id) : organisationKey(record.id);
  const indexKey = kind === 'person' ? personIndexKey(record.id) : organisationIndexKey(record.id);
  await setJSON(store, key, record);
  await setJSON(store, indexKey, buildIdentityIndexRecord({
    id: record.id,
    kind,
    displayLabel: displayLabelFor(record),
    sortName: kind === 'person' ? record.sort_name : null,
    lifecycleStatus: record.lifecycle_status,
    isSelf: kind === 'person' ? record.is_self : false,
    updatedAt: record.updated_at
  }));
  return record;
}

// The safe projection this API returns — the redacted record plus its
// canonical ref. `redactIdentityRecord` already hides display_name/
// sort_name/legal_name/aliases for a deleted or deidentified record.
function projectEntity(kind, record) {
  return { ref: formatEntityRef({ namespace: 'shared', kind, id: record.id }), ...redactIdentityRecord(record) };
}

async function assertNoActiveSelfPerson(store) {
  const keys = await listPersonIndexKeys(store);
  for (const key of keys) {
    // eslint-disable-next-line no-await-in-loop
    const entry = await getJSON(store, key);
    if (entry?.is_self && entry?.lifecycle_status === 'active') {
      throw Object.assign(new Error('An active self identity already exists.'), {
        status: 409,
        code: 'self_identity_exists'
      });
    }
  }
}

function readRef(url) {
  const raw = url.searchParams.get('ref');
  if (!raw) {
    throw Object.assign(new Error('ref query param required.'), { status: 400, code: 'missing_ref' });
  }
  const ref = assertRegisteredEntityRef(raw);
  if (!SUPPORTED_KINDS.has(ref.kind)) {
    throw Object.assign(new Error(`This API does not manage kind "${ref.kind}".`), {
      status: 400,
      code: 'unsupported_entity_kind'
    });
  }
  return ref;
}

export function createEntitiesHandler(deps = {}) {
  // A separate injectable clock from operator-gate's own `deps.now` (which
  // times out session verification) — this one stamps created_at/updated_at
  // and lifecycle event timestamps, and needs to be independently
  // deterministic for tests.
  const identityNow = deps.identityNow ?? (() => new Date().toISOString());

  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const url = new URL(request.url);

    try {
      if (request.method === 'GET') {
        const ref = readRef(url);
        const record = await loadEntity(store, ref);
        return withCors(okResponse(200, projectEntity(ref.kind, record)), request, env);
      }

      if (request.method === 'POST') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        assertNoAccessFields(parsed.value);
        const kind = parsed.value.kind;
        if (!SUPPORTED_KINDS.has(kind)) {
          return withCors(errorResponse(400, 'unsupported_entity_kind', 'kind must be "person" or "organisation".', false), request, env);
        }

        const now = identityNow();
        if (kind === 'person') {
          const input = validatePersonCreateInput(parsed.value);
          if (input.is_self) await assertNoActiveSelfPerson(store);
          const record = {
            schema_version: IDENTITY_SCHEMA_VERSION,
            id: generatePersonId(),
            kind: 'person',
            display_name: input.display_name,
            sort_name: input.sort_name,
            aliases: input.aliases,
            lifecycle_status: 'active',
            is_self: input.is_self,
            retention_reason: null,
            retention_review_at: null,
            created_at: now,
            updated_at: now
          };
          await writeEntity(store, 'person', record);
          return withCors(okResponse(201, projectEntity('person', record)), request, env);
        }

        const input = validateOrganisationCreateInput(parsed.value);
        const record = {
          schema_version: IDENTITY_SCHEMA_VERSION,
          id: generateOrganisationId(),
          kind: 'organisation',
          display_name: input.display_name,
          legal_name: input.legal_name,
          aliases: input.aliases,
          lifecycle_status: 'active',
          retention_reason: null,
          retention_review_at: null,
          created_at: now,
          updated_at: now
        };
        await writeEntity(store, 'organisation', record);
        return withCors(okResponse(201, projectEntity('organisation', record)), request, env);
      }

      if (request.method === 'PATCH') {
        const ref = readRef(url);
        const action = url.searchParams.get('action') ?? 'update';
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        assertNoAccessFields(parsed.value);

        const record = await loadEntity(store, ref);
        const now = identityNow();

        if (action === 'update') {
          const patch = ref.kind === 'person'
            ? validatePersonFieldUpdate(parsed.value)
            : validateOrganisationFieldUpdate(parsed.value);
          const updated = { ...record, ...patch, updated_at: now };
          await writeEntity(store, ref.kind, updated);
          return withCors(okResponse(200, projectEntity(ref.kind, updated)), request, env);
        }

        const toStatus = LIFECYCLE_ACTIONS[action];
        if (!toStatus) {
          return withCors(errorResponse(400, 'invalid_action', 'Unsupported action.', false), request, env);
        }

        assertLifecycleTransitionAllowed({
          kind: ref.kind,
          fromStatus: record.lifecycle_status,
          toStatus,
          isSelf: ref.kind === 'person' ? record.is_self : false,
          retentionReason: parsed.value.retention_reason,
          retentionReviewAt: parsed.value.retention_review_at
        });
        const updated = applyLifecycleTransition({
          record,
          toStatus,
          retentionReason: parsed.value.retention_reason ?? null,
          retentionReviewAt: parsed.value.retention_review_at ?? null,
          now
        });
        await writeEntity(store, ref.kind, updated);
        await writeLifecycleEvent(store, {
          entityRef: formatEntityRef({ namespace: 'shared', kind: ref.kind, id: ref.id }),
          fromStatus: record.lifecycle_status,
          toStatus,
          now
        });
        return withCors(okResponse(200, projectEntity(ref.kind, updated)), request, env);
      }

      // No hard delete in this slice — DELETE is not exposed.
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

export default createEntitiesHandler();
