import { isIndexKey, listBlobKeys } from './blobs-list.mjs';
import {
  OPPORTUNITY_SCHEMA_VERSION,
  buildAppliesToApplicationIntent,
  compareOpportunitiesByCloses,
  generateOpportunityId,
  isValidOpportunityId,
  opportunityIndexRecord,
  parseOpportunityRecord,
  projectOpportunity,
  validateOpportunityCreateInput,
  validateOpportunityPatch
} from './opportunity-schema.mjs';
import {
  defaultGetProfessionalStore,
  getJSON,
  setJSON
} from './professional-blobs.mjs';

// Blob store for opportunities under `opportunities/` on professional-hub-content.

export const OPPORTUNITY_PREFIX = 'opportunities/records/';
export const OPPORTUNITY_INDEX_PREFIX = 'opportunities/index/';
export const OPPORTUNITY_BY_ORG_PREFIX = 'opportunities/by-org/';

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function notFound() {
  return Object.assign(new Error('Opportunity not found.'), {
    status: 404,
    code: 'opportunity_not_found'
  });
}

export function opportunityKey(id) {
  if (!isValidOpportunityId(id)) {
    throw validationError('invalid_opportunity_id', 'Invalid Opportunity id.');
  }
  return `${OPPORTUNITY_PREFIX}${id}`;
}

export function opportunityIndexKey(id) {
  return `${OPPORTUNITY_INDEX_PREFIX}${id}`;
}

export function opportunityByOrgKey(organisationRef, id) {
  return `${OPPORTUNITY_BY_ORG_PREFIX}${organisationRef}/${id}`;
}

export function createOpportunityRepository(deps = {}) {
  const store = deps.store;
  if (!store) {
    throw new Error('createOpportunityRepository requires a professional store.');
  }
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? generateOpportunityId;
  const createApplication =
    deps.createApplication ??
    null; /* optional: inject createApplicationRepository().createApplication */

  async function getOpportunity(id) {
    if (!isValidOpportunityId(id)) throw notFound();
    const record = parseOpportunityRecord(await getJSON(store, opportunityKey(id)));
    if (!record) throw notFound();
    return projectOpportunity(record, now());
  }

  async function listOpportunities({ organisationRef = null, status = null } = {}) {
    let ids;
    if (organisationRef) {
      const keys = await listBlobKeys(store, `${OPPORTUNITY_BY_ORG_PREFIX}${organisationRef}/`);
      ids = [
        ...new Set(
          keys
            .filter((key) => !isIndexKey(key))
            .map((key) => key.slice(`${OPPORTUNITY_BY_ORG_PREFIX}${organisationRef}/`.length))
            .filter(isValidOpportunityId)
        )
      ];
    } else {
      const keys = await listBlobKeys(store, OPPORTUNITY_INDEX_PREFIX);
      ids = [
        ...new Set(
          keys
            .filter((key) => !isIndexKey(key))
            .map((key) => key.slice(OPPORTUNITY_INDEX_PREFIX.length))
            .filter(isValidOpportunityId)
        )
      ];
    }

    const records = [];
    const nowIso = now();
    for (const id of ids) {
      const raw = parseOpportunityRecord(await getJSON(store, opportunityKey(id)));
      if (!raw) continue;
      const projected = projectOpportunity(raw, nowIso);
      if (status && projected.status !== status) continue;
      records.push(projected);
    }
    records.sort(compareOpportunitiesByCloses);
    return records;
  }

  async function createOpportunity(input) {
    const validated = validateOpportunityCreateInput(input);
    const timestamp = now();
    const id = generateId();
    if (!isValidOpportunityId(id)) {
      throw validationError('invalid_opportunity_id', 'Generated Opportunity id is invalid.');
    }
    const record = {
      schema_version: OPPORTUNITY_SCHEMA_VERSION,
      id,
      organisation_ref: validated.organisation_ref,
      kind: validated.kind,
      title: validated.title,
      summary: validated.summary,
      closes_on: validated.closes_on,
      closes_precision: validated.closes_precision,
      url: validated.url,
      sources: validated.sources,
      found_by: validated.found_by,
      status: 'open',
      created_at: timestamp,
      updated_at: timestamp
    };
    await setJSON(store, opportunityKey(id), record);
    await setJSON(store, opportunityIndexKey(id), opportunityIndexRecord(record));
    await setJSON(store, opportunityByOrgKey(validated.organisation_ref, id), { id });
    return { opportunity: projectOpportunity(record, timestamp), created: true };
  }

  async function patchOpportunity(id, patchInput) {
    if (!isValidOpportunityId(id)) throw notFound();
    const existing = parseOpportunityRecord(await getJSON(store, opportunityKey(id)));
    if (!existing) throw notFound();
    const patch = validateOpportunityPatch(patchInput, existing);
    const updated = { ...existing, ...patch, updated_at: now() };
    await setJSON(store, opportunityKey(id), updated);
    await setJSON(store, opportunityIndexKey(id), opportunityIndexRecord(updated));
    return projectOpportunity(updated, now());
  }

  async function dismissOpportunity(id) {
    return patchOpportunity(id, { status: 'dismissed' });
  }

  /**
   * Add to Applications: builds applies_to intent; when createApplication is
   * injected, creates the application and marks the opportunity applied.
   */
  async function addToApplications(id) {
    const opportunity = await getOpportunity(id);
    if (opportunity.status === 'dismissed') {
      throw validationError('opportunity_dismissed', 'Cannot add a dismissed opportunity to Applications.');
    }
    const intent = buildAppliesToApplicationIntent(opportunity);
    if (!createApplication) {
      return {
        opportunity,
        application_intent: intent,
        application: null,
        created: false
      };
    }
    const result = await createApplication(intent);
    const updated = await patchOpportunity(id, { status: 'applied' });
    return {
      opportunity: updated,
      application_intent: intent,
      application: result.application ?? result,
      links: result.links ?? [],
      created: true
    };
  }

  return {
    getOpportunity,
    listOpportunities,
    createOpportunity,
    patchOpportunity,
    dismissOpportunity,
    addToApplications
  };
}

export async function defaultCreateOpportunityRepository(deps = {}) {
  const store = deps.store ?? (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)());
  return createOpportunityRepository({ ...deps, store });
}
