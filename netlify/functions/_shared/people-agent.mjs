// People tools for chat agents (Clare, Hammond, Ann). Search is read-only.
// Every write — add a Person, edit a Person, link two entities — becomes an
// os_propose_action write with a `people:` path, so it waits on Adam's
// Confirm card and then runs through the canonical identity and Universal
// Link repositories, never through raw Blob writes.

import { createAccessContext } from './entity-access.mjs';
import { formatEntityRef, parseEntityRef } from './entity-ref.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import { getGithubPerson } from './github-professional-data.mjs';
import { createIdentityRepository } from './identity-repository.mjs';
import { parseOrganisationRecord, parsePersonRecord } from './identity-schema.mjs';
import { getRelationshipDeclaration } from './relationship-registry.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';
import {
  listOrganisationIndexKeys,
  listPersonIndexKeys,
  organisationKey,
  personKey
} from './universal-link-blobs.mjs';
import { mergeNativeFirst, searchGithubIdentityKind, searchIdentityKind } from '../entity-search.mjs';

export const PEOPLE_AGENT_SLUGS = new Set(['clare', 'hammond', 'ann']);

/** Relationship types an agent may propose, with the endpoint kinds each accepts. */
export const AGENT_LINK_TYPES = Object.freeze([
  'professional_relationship',
  'employee_at',
  'member_of',
  'studied_at',
  'placement_at'
]);

const MAX_SEARCH_RESULTS = 10;
const MAX_CHANGES = 12;
const NEW_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/i;

function clean(value, max = 200) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function cleanAliases(value) {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.map(item => clean(item, 120)).filter(Boolean))].slice(0, 12);
}

// ---------------------------------------------------------------------------
// Tool schemas

export function searchPeopleSchema() {
  return {
    name: 'search_people',
    description:
      'Search Adam\'s Professional People and Organisations by name, sort name or alias. Returns refs (shared:person:… / shared:organisation:…) to use in propose_people_changes. Always search before adding a person so you never create a duplicate.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A name or part of a name.' },
        kinds: {
          type: 'array',
          items: { type: 'string', enum: ['person', 'organisation'] },
          description: 'Defaults to both.'
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  };
}

export function proposePeopleChangesSchema() {
  return {
    name: 'propose_people_changes',
    description:
      'Propose adding People, editing People, and linking People to each other or to Organisations. Nothing is saved until Adam taps Confirm on the card, and he can untick single items. Search first. Editable fields are display_name, sort_name and aliases only. To link a person you are adding in the same call, use "new:<key>" as the ref.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One line for the Confirm card, e.g. "Add Sam Lee and link her to Jo as a colleague".' },
        add_people: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Short handle for this new person, used as "new:<key>" in links.' },
              display_name: { type: 'string' },
              sort_name: { type: 'string' },
              aliases: { type: 'array', items: { type: 'string' } }
            },
            required: ['key', 'display_name'],
            additionalProperties: false
          }
        },
        update_people: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ref: { type: 'string', description: 'shared:person:<id> from search_people.' },
              display_name: { type: 'string' },
              sort_name: { type: 'string' },
              aliases: { type: 'array', items: { type: 'string' }, description: 'The full new alias list.' }
            },
            required: ['ref'],
            additionalProperties: false
          }
        },
        links: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'shared:person:<id> or new:<key>.' },
              to: { type: 'string', description: 'shared:person:<id>, shared:organisation:<id>, or new:<key>.' },
              relationship_type: { type: 'string', enum: [...AGENT_LINK_TYPES] },
              role: {
                type: 'string',
                description: 'Person↔person: colleague, former_colleague, mentor, mentee, academic_contact, research_collaborator, recruiter, referee, conference_contact, introduction or other. Person→organisation: a job title or role, optional.'
              },
              valid_from: { type: 'string', description: 'YYYY-MM-DD, optional.' }
            },
            required: ['from', 'to', 'relationship_type'],
            additionalProperties: false
          }
        }
      },
      required: ['summary'],
      additionalProperties: false
    }
  };
}

// ---------------------------------------------------------------------------
// Search

export async function searchPeopleForAgent({ query, kinds, store, env, fetchImpl } = {}) {
  const q = clean(query, 120);
  if (!q) return { ok: false, error: 'query_required' };
  if (!store) return { ok: false, error: 'people_store_unavailable' };
  const wanted = Array.isArray(kinds) && kinds.length ? new Set(kinds) : new Set(['person', 'organisation']);
  const github = { env, ...(fetchImpl ? { fetchImpl } : {}) };
  const groups = [];
  if (wanted.has('person')) {
    const [native, imported] = await Promise.all([
      searchIdentityKind(store, 'person', listPersonIndexKeys, personKey, parsePersonRecord, q, false),
      searchGithubIdentityKind('person', q, false, github)
    ]);
    groups.push(...mergeNativeFirst(native, imported));
  }
  if (wanted.has('organisation')) {
    const [native, imported] = await Promise.all([
      searchIdentityKind(store, 'organisation', listOrganisationIndexKeys, organisationKey, parseOrganisationRecord, q, false),
      searchGithubIdentityKind('organisation', q, false, github)
    ]);
    groups.push(...mergeNativeFirst(native, imported));
  }
  const results = groups
    .sort((a, b) => a.rank - b.rank || a.display_label.localeCompare(b.display_label))
    .slice(0, MAX_SEARCH_RESULTS)
    .map(entry => ({
      ref: entry.ref,
      kind: entry.kind,
      name: entry.display_label,
      ...(entry.supporting_label === 'self' ? { note: 'Adam himself' } : {})
    }));
  return { ok: true, query: q, count: results.length, results };
}

// ---------------------------------------------------------------------------
// Proposal building

function personRefOrNull(value) {
  const ref = typeof value === 'string' ? parseEntityRef(value.trim()) : null;
  return ref && ref.namespace === 'shared' && ref.kind === 'person' ? ref : null;
}

function endpointRef(value) {
  const ref = typeof value === 'string' ? parseEntityRef(value.trim()) : null;
  return ref && ref.namespace === 'shared' && (ref.kind === 'person' || ref.kind === 'organisation') ? ref : null;
}

/**
 * Turn propose_people_changes input into os_propose_action writes. `nameForRef`
 * resolves a display name for card copy (and proves the ref exists).
 */
export async function buildPeopleProposal(input, { nameForRef } = {}) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  if (!summary) return { ok: false, error: 'summary_required' };
  const adds = Array.isArray(input.add_people) ? input.add_people : [];
  const updates = Array.isArray(input.update_people) ? input.update_people : [];
  const links = Array.isArray(input.links) ? input.links : [];
  if (adds.length + updates.length + links.length === 0) return { ok: false, error: 'no_changes' };
  if (adds.length + updates.length + links.length > MAX_CHANGES) return { ok: false, error: 'too_many_changes', detail: `At most ${MAX_CHANGES} per card.` };

  const lookupName = async ref => {
    if (typeof nameForRef !== 'function') return null;
    try {
      return await nameForRef(ref);
    } catch {
      return null;
    }
  };

  const writes = [];
  const newPaths = new Map();
  const newNames = new Map();

  for (const [index, add] of adds.entries()) {
    const key = clean(add?.key, 31);
    const displayName = clean(add?.display_name, 160);
    if (!key || !NEW_KEY_RE.test(key)) return { ok: false, error: 'invalid_new_key', detail: `add_people[${index}].key` };
    if (newPaths.has(key)) return { ok: false, error: 'duplicate_new_key', detail: key };
    if (!displayName) return { ok: false, error: 'display_name_required', detail: `add_people[${index}]` };
    const path = `people:person:new-${key.toLowerCase()}`;
    newPaths.set(key, path);
    newNames.set(key, displayName);
    const body = { display_name: displayName };
    const sortName = clean(add?.sort_name, 160);
    if (sortName) body.sort_name = sortName;
    const aliases = cleanAliases(add?.aliases);
    if (aliases?.length) body.aliases = aliases;
    writes.push({ path, mode: 'create', content: JSON.stringify(body), diff: `Add person: ${displayName}` });
  }

  for (const [index, update] of updates.entries()) {
    const ref = personRefOrNull(update?.ref);
    if (!ref) return { ok: false, error: 'invalid_person_ref', detail: `update_people[${index}].ref` };
    const canonical = formatEntityRef(ref);
    const current = await lookupName(canonical);
    if (!current) return { ok: false, error: 'person_not_found', detail: canonical };
    const patch = {};
    const bits = [];
    const displayName = clean(update?.display_name, 160);
    if (displayName && displayName !== current) {
      patch.display_name = displayName;
      bits.push(`name → ${displayName}`);
    }
    if (typeof update?.sort_name === 'string') {
      patch.sort_name = clean(update.sort_name, 160) || null;
      bits.push(`sort name → ${patch.sort_name ?? '(none)'}`);
    }
    const aliases = cleanAliases(update?.aliases);
    if (aliases) {
      patch.aliases = aliases;
      bits.push(`aliases → ${aliases.length ? aliases.join(', ') : '(none)'}`);
    }
    if (!bits.length) return { ok: false, error: 'no_fields_to_update', detail: canonical };
    writes.push({
      path: `people:person:${ref.id}`,
      mode: 'overwrite',
      content: JSON.stringify(patch),
      diff: `Edit ${current}: ${bits.join('; ')}`
    });
  }

  for (const [index, link] of links.entries()) {
    const resolveEnd = async value => {
      const raw = typeof value === 'string' ? value.trim() : '';
      if (raw.startsWith('new:')) {
        const key = raw.slice(4);
        const path = newPaths.get(key);
        return path ? { ref: path, kind: 'person', name: newNames.get(key) } : null;
      }
      const ref = endpointRef(raw);
      if (!ref) return null;
      const canonical = formatEntityRef(ref);
      const name = await lookupName(canonical);
      return name ? { ref: canonical, kind: ref.kind, name } : null;
    };
    const from = await resolveEnd(link?.from);
    const to = await resolveEnd(link?.to);
    if (!from) return { ok: false, error: 'invalid_link_from', detail: `links[${index}].from` };
    if (!to) return { ok: false, error: 'invalid_link_to', detail: `links[${index}].to` };
    if (from.ref === to.ref) return { ok: false, error: 'self_link', detail: `links[${index}]` };
    const type = clean(link?.relationship_type, 60);
    if (!AGENT_LINK_TYPES.includes(type)) return { ok: false, error: 'unsupported_relationship_type', detail: type };
    const declaration = getRelationshipDeclaration(type);
    const sourceKinds = declaration?.source_kinds ?? [];
    const targetKinds = declaration?.target_kinds ?? [];
    if (from.kind !== 'person' || !sourceKinds.includes('shared:person')) {
      return { ok: false, error: 'invalid_link_source_kind', detail: `${type} starts at a person` };
    }
    if (!targetKinds.includes(`shared:${to.kind}`)) {
      return { ok: false, error: 'invalid_link_target_kind', detail: `${type} cannot point at a ${to.kind}` };
    }
    const role = clean(link?.role, 80) || null;
    const allowedRoles = declaration?.allowed_roles ?? [];
    if (allowedRoles.length && role && !allowedRoles.includes(role)) {
      return { ok: false, error: 'invalid_role', detail: `${type} role must be one of ${allowedRoles.join(', ')}` };
    }
    if (type === 'professional_relationship' && !role) {
      return { ok: false, error: 'role_required', detail: `professional_relationship needs a role: ${allowedRoles.join(', ')}` };
    }
    const validFrom = /^\d{4}-\d{2}-\d{2}$/.test(link?.valid_from ?? '') ? link.valid_from : null;
    const body = {
      source_ref: from.ref,
      target_ref: to.ref,
      relationship_type: type,
      ...(role ? { role } : {}),
      ...(validFrom ? { valid_from: validFrom } : {})
    };
    const label = type === 'professional_relationship' ? role.replace(/_/g, ' ') : `${type.replace(/_/g, ' ')}${role ? ` (${role})` : ''}`;
    writes.push({
      path: `people:link:new-${index + 1}`,
      mode: 'create',
      content: JSON.stringify(body),
      diff: `Link ${from.name} → ${to.name}: ${label}`
    });
  }

  return {
    ok: true,
    proposal: {
      intent: summary,
      reads: [],
      writes,
      surfaces: ['confirm_card', 'governance_log']
    }
  };
}

// ---------------------------------------------------------------------------
// Confirm-time execution

function peopleError(code, detail) {
  return { ok: false, error: code, ...(detail ? { detail } : {}) };
}

function parseBody(write) {
  try {
    const parsed = JSON.parse(write.content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Executor handed to executeProposeActionWrites as blobStores.people.
 * `created` maps a `people:person:new-*` path to the ref it produced, so a
 * link in the same card can point at a person created moments earlier.
 */
export function createPeopleWriteExecutor({
  store,
  env,
  fetchImpl,
  now,
  resolveEntity = defaultResolveEntity,
  getImportedPerson = getGithubPerson
} = {}) {
  if (!store) throw new Error('createPeopleWriteExecutor requires a store.');
  const github = { env, ...(fetchImpl ? { fetchImpl } : {}) };
  const identityRepo = createIdentityRepository({ store, ...(now ? { now } : {}) });
  const linkRepo = createUniversalLinkRepository({
    store,
    resolveEntity: (ref, ctx, options = {}) => resolveEntity(ref, ctx, { ...github, ...options }),
    ...(now ? { now } : {})
  });

  async function updatePerson(ref, patch) {
    try {
      return await identityRepo.updateFields({ ref, patch });
    } catch (error) {
      if (error?.code !== 'entity_not_found') throw error;
      // Imported from Notion and never edited in the app: adopt it under its
      // own id, then apply the edit.
      const imported = await getImportedPerson(ref.id, github);
      if (!imported) throw error;
      await identityRepo.adoptImportedIdentity({ kind: 'person', record: imported });
      return identityRepo.updateFields({ ref, patch });
    }
  }

  async function apply(write, target, created = new Map()) {
    const body = parseBody(write);
    if (!body) return peopleError('invalid_people_write', write.path);
    try {
      if (target.kind === 'person' && write.mode === 'create') {
        const { record, ref } = await identityRepo.createIdentity({ kind: 'person', input: body });
        created.set(write.path, ref);
        return { ok: true, result: { path: write.path, mode: 'create', ref, name: record.display_name } };
      }
      if (target.kind === 'person') {
        const ref = { namespace: 'shared', kind: 'person', id: target.id };
        const updated = await updatePerson(ref, body);
        return { ok: true, result: { path: write.path, mode: 'overwrite', ref: formatEntityRef(ref), name: updated.display_name } };
      }
      if (target.kind === 'link') {
        const endpoint = value => (typeof value === 'string' && value.startsWith('people:person:new-') ? created.get(value) : value);
        const sourceRef = endpoint(body.source_ref);
        const targetRef = endpoint(body.target_ref);
        if (!sourceRef || !targetRef) {
          return peopleError('link_endpoint_not_created', 'A person this link needs was not added. Tick the "Add person" line too.');
        }
        const { link, created: wasCreated } = await linkRepo.createLink(
          { ...body, source_ref: sourceRef, target_ref: targetRef },
          createAccessContext({ workflow: 'life' })
        );
        return { ok: true, result: { path: write.path, mode: 'create', link_id: link.id, created: wasCreated } };
      }
      return peopleError('unknown_write_target', write.path);
    } catch (error) {
      return peopleError(typeof error?.code === 'string' ? error.code : 'people_write_failed', error?.message);
    }
  }

  return { apply };
}

/** Display name for a shared person/organisation ref (null when it does not exist). */
export function createPeopleNameLookup({ env, fetchImpl, resolveEntity = defaultResolveEntity } = {}) {
  const github = { env, ...(fetchImpl ? { fetchImpl } : {}) };
  const access = createAccessContext({ workflow: 'life' });
  return async ref => {
    try {
      const endpoint = await resolveEntity(ref, access, github);
      return endpoint?.display_label ?? endpoint?.display_name ?? null;
    } catch {
      return null;
    }
  };
}
