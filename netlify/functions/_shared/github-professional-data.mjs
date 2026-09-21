import { createHash } from 'node:crypto';
import { IDENTITY_SCHEMA_VERSION, parseOrganisationRecord, parsePersonRecord } from './identity-schema.mjs';
import { formatEntityRef } from './entity-ref.mjs';

// Read-only bridge onto the private `life-hub-data` repository's imported
// Professional directory (350 people / 18 organisations / 74 relationships,
// migrated from Notion — see docs/migrations/professional-import.md). This
// data's canonical home is GitHub, not `universal-link-content` Blobs — the
// user explicitly chose not to duplicate it into Netlify storage. Every
// function here is read-only: this module never writes to GitHub.
//
// IDs are deterministic, not random. A native Person/Organisation gets a
// `crypto.randomUUID()` id at creation time (identity-schema.mjs). This
// module has no creation step to hook a random id generation into — the
// records already exist as flat GitHub JSON — so a stable id is derived by
// hashing each record's `legacy_id` instead. The same legacy_id always
// yields the same `person_<hex>`/`organisation_<hex>` id, so hrefs and
// Universal-Link-shaped relationship ids stay stable across requests
// without ever needing to mutate the GitHub repository to "assign" one.

const GITHUB_ORIGIN = 'https://api.github.com';
const DATA_PATH = 'data/professional';
const CACHE_TTL_MS = 60_000;

// A fixed, non-disclosing timestamp for every normalized record. These
// records are derived at read time, not stored, so there is no real
// creation/update instant to report — using "now" would make every
// response's timestamps churn on every request for no reason, and would
// make relationship-timeline ordering nondeterministic across requests.
const LEGACY_IMPORT_TIMESTAMP = '2026-09-15T00:00:00.000Z';

export const PROFESSIONAL_DATA_REPO_ENV = 'PROFESSIONAL_GITHUB_REPOSITORY';
export const PROFESSIONAL_DATA_TOKEN_ENV = 'GITHUB_TOKEN';
export const DEFAULT_PROFESSIONAL_DATA_REPO = 'adamrussell91-hash/life-hub-data';

export function professionalDataRepo(env = process.env) {
  const configured = typeof env?.[PROFESSIONAL_DATA_REPO_ENV] === 'string'
    ? env[PROFESSIONAL_DATA_REPO_ENV].trim()
    : '';
  return configured || DEFAULT_PROFESSIONAL_DATA_REPO;
}

function professionalDataToken(env = process.env) {
  const token = env?.[PROFESSIONAL_DATA_TOKEN_ENV];
  return typeof token === 'string' && token.length > 0 ? token : '';
}

export function isProfessionalDataRepoBound(env = process.env) {
  return Boolean(professionalDataToken(env));
}

// `person_`/`organisation_` + 36 lower-case hex/dash characters, matching
// identity-schema.mjs's PERSON_ID_PATTERN / ORGANISATION_ID_PATTERN exactly
// (they only check shape, not UUID version bits) — so a derived id is
// accepted anywhere a native id is, with no changes to that validation.
function deriveIdentityId(prefix, legacyId) {
  const digest = createHash('sha256').update(`${prefix}:${legacyId}`).digest('hex').slice(0, 32);
  const grouped = [digest.slice(0, 8), digest.slice(8, 12), digest.slice(12, 16), digest.slice(16, 20), digest.slice(20, 32)];
  return `${prefix}_${grouped.join('-')}`;
}

export function derivePersonId(legacyId) {
  return deriveIdentityId('person', legacyId);
}

export function deriveOrganisationId(legacyId) {
  return deriveIdentityId('organisation', legacyId);
}

// `ul_` + 64 lower-case hex characters, matching universal-link-schema.mjs's
// LINK_ID_PATTERN exactly, so a merged-in synthetic link is indistinguishable
// in shape from one written by the real Universal Link repository.
function deriveLinkId(relationship) {
  const digest = createHash('sha256')
    .update([
      relationship.person_legacy_id,
      relationship.organisation_legacy_id,
      relationship.relationship_type,
      relationship.valid_from ?? '',
      relationship.role ?? ''
    ].join('|'))
    .digest('hex');
  return `ul_${digest}`;
}

async function githubJson(url, { token, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'life-hub'
      }
    });
  } catch {
    return null;
  }
  if (!response?.ok) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function decodeBase64(content) {
  return Buffer.from(String(content).replace(/\n/g, ''), 'base64').toString('utf8');
}

async function fetchDataFile(repo, token, fetchImpl, filename) {
  const payload = await githubJson(`${GITHUB_ORIGIN}/repos/${repo}/contents/${DATA_PATH}/${filename}`, { token, fetchImpl });
  if (!payload || typeof payload.content !== 'string') return null;
  try {
    return JSON.parse(decodeBase64(payload.content));
  } catch {
    return null;
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function normalizePeople(rows) {
  const byId = new Map();
  const idByLegacyId = new Map();
  // Exactly one imported Person may be the operator. A second `is_self:
  // true` row is treated as an ordinary contact rather than throwing —
  // a hard fail here would blank the whole directory over one bad flag.
  let claimedSelf = false;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object' || !isNonEmptyString(row.legacy_id) || !isNonEmptyString(row.display_name)) continue;
    const id = derivePersonId(row.legacy_id);
    const wantsSelf = row.is_self === true;
    const isSelf = wantsSelf && !claimedSelf;
    if (isSelf) claimedSelf = true;
    const record = parsePersonRecord({
      schema_version: IDENTITY_SCHEMA_VERSION,
      id,
      kind: 'person',
      display_name: row.display_name,
      sort_name: typeof row.sort_name === 'string' ? row.sort_name : null,
      aliases: isStringArray(row.aliases) ? row.aliases : [],
      lifecycle_status: 'active',
      is_self: isSelf,
      retention_reason: null,
      retention_review_at: null,
      created_at: LEGACY_IMPORT_TIMESTAMP,
      updated_at: LEGACY_IMPORT_TIMESTAMP
    });
    if (!record) continue;
    byId.set(id, record);
    idByLegacyId.set(row.legacy_id, id);
  }
  return { byId, idByLegacyId };
}

function normalizeOrganisations(rows) {
  const byId = new Map();
  const idByLegacyId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object' || !isNonEmptyString(row.legacy_id) || !isNonEmptyString(row.display_name)) continue;
    const id = deriveOrganisationId(row.legacy_id);
    const record = parseOrganisationRecord({
      schema_version: IDENTITY_SCHEMA_VERSION,
      id,
      kind: 'organisation',
      display_name: row.display_name,
      legal_name: typeof row.legal_name === 'string' ? row.legal_name : null,
      aliases: isStringArray(row.aliases) ? row.aliases : [],
      lifecycle_status: 'active',
      retention_reason: null,
      retention_review_at: null,
      created_at: LEGACY_IMPORT_TIMESTAMP,
      updated_at: LEGACY_IMPORT_TIMESTAMP
    });
    if (!record) continue;
    byId.set(id, record);
    idByLegacyId.set(row.legacy_id, id);
  }
  return { byId, idByLegacyId };
}

function isIsoDateOrNull(value) {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

// Builds synthetic Universal-Link-shaped `link` objects — never written
// anywhere, only ever held in memory for one request — indexed by the
// derived person/organisation id each relationship touches, so
// entity-overview.mjs's merge can look them up in O(1) the same way the
// real repository's membership index does.
function normalizeRelationships(rows, peopleIdByLegacyId, organisationsIdByLegacyId) {
  const byPersonId = new Map();
  const byOrganisationId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    if (row.relationship_type !== 'employee_at' && row.relationship_type !== 'member_of') continue;
    const personId = peopleIdByLegacyId.get(row.person_legacy_id);
    const organisationId = organisationsIdByLegacyId.get(row.organisation_legacy_id);
    if (!personId || !organisationId) continue;
    if (row.role !== null && row.role !== undefined && typeof row.role !== 'string') continue;
    if (!isIsoDateOrNull(row.valid_from) || !isIsoDateOrNull(row.valid_to)) continue;

    const sourceRef = formatEntityRef({ namespace: 'shared', kind: 'person', id: personId });
    const targetRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: organisationId });
    const link = {
      id: deriveLinkId(row),
      source_ref: sourceRef,
      target_ref: targetRef,
      relationship_type: row.relationship_type,
      role: row.role ?? null,
      context_key: null,
      context_ref: null,
      temporal_mode: 'period',
      valid_from: row.valid_from ?? null,
      valid_to: row.valid_to ?? null,
      occurred_at: null,
      status: row.valid_to ? 'ended' : 'current',
      visibility: 'operator',
      metadata: {},
      created_at: LEGACY_IMPORT_TIMESTAMP,
      updated_at: LEGACY_IMPORT_TIMESTAMP
    };

    if (!byPersonId.has(personId)) byPersonId.set(personId, []);
    byPersonId.get(personId).push({ link, otherRef: targetRef, direction: 'outgoing' });

    if (!byOrganisationId.has(organisationId)) byOrganisationId.set(organisationId, []);
    byOrganisationId.get(organisationId).push({ link, otherRef: sourceRef, direction: 'incoming' });
  }
  return { byPersonId, byOrganisationId };
}

let cache = null; // { repo, expiresAt, data }

export function resetProfessionalDataCache() {
  cache = null;
}

async function loadProfessionalData({ env = process.env, fetchImpl = fetch, now = () => Date.now() } = {}) {
  const token = professionalDataToken(env);
  if (!token) return null;
  const repo = professionalDataRepo(env);
  if (cache && cache.repo === repo && cache.expiresAt > now()) return cache.data;

  const [peopleRaw, organisationsRaw, relationshipsRaw] = await Promise.all([
    fetchDataFile(repo, token, fetchImpl, 'people.json'),
    fetchDataFile(repo, token, fetchImpl, 'organisations.json'),
    fetchDataFile(repo, token, fetchImpl, 'relationships.json')
  ]);
  if (!Array.isArray(peopleRaw) || !Array.isArray(organisationsRaw) || !Array.isArray(relationshipsRaw)) {
    return null;
  }

  const people = normalizePeople(peopleRaw);
  const organisations = normalizeOrganisations(organisationsRaw);
  const relationships = normalizeRelationships(relationshipsRaw, people.idByLegacyId, organisations.idByLegacyId);

  const data = {
    peopleById: people.byId,
    organisationsById: organisations.byId,
    relationshipsByPersonId: relationships.byPersonId,
    relationshipsByOrganisationId: relationships.byOrganisationId
  };
  cache = { repo, expiresAt: now() + CACHE_TTL_MS, data };
  return data;
}

export async function getGithubPerson(id, options = {}) {
  const data = await loadProfessionalData(options);
  return data?.peopleById.get(id) ?? null;
}

export async function getGithubOrganisation(id, options = {}) {
  const data = await loadProfessionalData(options);
  return data?.organisationsById.get(id) ?? null;
}

export async function listGithubPersonCandidates(options = {}) {
  const data = await loadProfessionalData(options);
  return data ? [...data.peopleById.values()] : [];
}

export async function getGithubActiveSelfPerson(options = {}) {
  const people = await listGithubPersonCandidates(options);
  return people.find((record) => record.is_self === true && record.lifecycle_status === 'active') ?? null;
}

export async function listGithubOrganisationCandidates(options = {}) {
  const data = await loadProfessionalData(options);
  return data ? [...data.organisationsById.values()] : [];
}

// Returns `{ link, otherRef, direction }` rows for the given kind/id — the
// same shape entity-overview.mjs's native merge needs before it resolves
// `otherRef` into a hydrated `endpoint` via the caller's own `resolveEntity`.
export async function listGithubRelationshipEntries(kind, id, options = {}) {
  const data = await loadProfessionalData(options);
  if (!data) return [];
  if (kind === 'person') return data.relationshipsByPersonId.get(id) ?? [];
  if (kind === 'organisation') return data.relationshipsByOrganisationId.get(id) ?? [];
  return [];
}
