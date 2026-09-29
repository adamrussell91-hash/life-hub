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

const PERSON_PROFILE_PROPS = {
  summary: { type: 'string', description: 'Profile notes (professional_profile.summary).' },
  linkedin_url: { type: 'string', description: 'https LinkedIn URL, or empty to clear.' },
  current_workplace: {
    type: 'array',
    items: { type: 'string' },
    description: 'Workplace label(s) shown on the profile. Pass one string in a single-element array when needed.'
  }
};

export function proposePeopleChangesSchema() {
  return {
    name: 'propose_people_changes',
    description:
      'Propose adding People, editing People (name, aliases, profile notes, LinkedIn, workplace), and linking People to each other or to Organisations. Nothing is saved until Adam taps Confirm on the card, and he can untick single items. Search first. To link a person you are adding in the same call, use "new:<key>" as the ref.',
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
              aliases: { type: 'array', items: { type: 'string' } },
              ...PERSON_PROFILE_PROPS
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
              aliases: { type: 'array', items: { type: 'string' }, description: 'The full new alias list.' },
              ...PERSON_PROFILE_PROPS
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

export function proposeOrganisationChangesSchema() {
  return {
    name: 'propose_organisation_changes',
    description:
      'Propose adding or editing Organisations in Professional Hub. Search with search_people (kinds organisation) first. Nothing is saved until Adam taps Confirm. Cannot set logos from chat.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One line for the Confirm card.' },
        add_organisations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Short handle for this new org.' },
              display_name: { type: 'string' },
              legal_name: { type: 'string' },
              aliases: { type: 'array', items: { type: 'string' } }
            },
            required: ['key', 'display_name'],
            additionalProperties: false
          }
        },
        update_organisations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ref: { type: 'string', description: 'shared:organisation:<id> from search_people.' },
              display_name: { type: 'string' },
              legal_name: { type: 'string' },
              aliases: { type: 'array', items: { type: 'string' } }
            },
            required: ['ref'],
            additionalProperties: false
          }
        }
      },
      required: ['summary'],
      additionalProperties: false
    }
  };
}

function professionalProfileFromItem(item) {
  if (!item || typeof item !== 'object') return null;
  const profile = {};
  if (typeof item.summary === 'string') {
    profile.summary = clean(item.summary, 4000) || null;
  }
  if (typeof item.linkedin_url === 'string') {
    const url = item.linkedin_url.trim();
    profile.linkedin_url = url || null;
  }
  if (item.current_workplace !== undefined) {
    if (typeof item.current_workplace === 'string') {
      const label = clean(item.current_workplace, 200);
      profile.current_workplace = label ? [label] : [];
    } else if (Array.isArray(item.current_workplace)) {
      profile.current_workplace = item.current_workplace
        .map(value => clean(value, 200))
        .filter(Boolean)
        .slice(0, 8);
    } else if (item.current_workplace === null) {
      profile.current_workplace = [];
    }
  }
  return Object.keys(profile).length ? profile : null;
}

function organisationRefOrNull(value) {
  const ref = typeof value === 'string' ? parseEntityRef(value.trim()) : null;
  return ref && ref.namespace === 'shared' && ref.kind === 'organisation' ? ref : null;
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
    const profile = professionalProfileFromItem(add);
    if (profile) body.professional_profile = profile;
    const profileBit = profile
      ? ` (${[
        profile.summary != null ? 'notes' : null,
        profile.linkedin_url != null ? 'LinkedIn' : null,
        profile.current_workplace ? 'workplace' : null
      ].filter(Boolean).join(', ')})`
      : '';
    writes.push({ path, mode: 'create', content: JSON.stringify(body), diff: `Add person: ${displayName}${profileBit}` });
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
    const profile = professionalProfileFromItem(update);
    if (profile) {
      patch.professional_profile = profile;
      if (profile.summary !== undefined) bits.push(profile.summary ? 'notes updated' : 'notes cleared');
      if (profile.linkedin_url !== undefined) bits.push(profile.linkedin_url ? 'LinkedIn set' : 'LinkedIn cleared');
      if (profile.current_workplace !== undefined) {
        bits.push(
          profile.current_workplace.length
            ? `workplace → ${profile.current_workplace.join(', ')}`
            : 'workplace cleared'
        );
      }
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

/**
 * Turn propose_organisation_changes input into os_propose_action writes.
 */
export async function buildOrganisationProposal(input, { nameForRef } = {}) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  if (!summary) return { ok: false, error: 'summary_required' };
  const adds = Array.isArray(input.add_organisations) ? input.add_organisations : [];
  const updates = Array.isArray(input.update_organisations) ? input.update_organisations : [];
  if (adds.length + updates.length === 0) return { ok: false, error: 'no_changes' };
  if (adds.length + updates.length > MAX_CHANGES) {
    return { ok: false, error: 'too_many_changes', detail: `At most ${MAX_CHANGES} per card.` };
  }

  const lookupName = async ref => {
    if (typeof nameForRef !== 'function') return null;
    try {
      return await nameForRef(ref);
    } catch {
      return null;
    }
  };

  const writes = [];
  const seenKeys = new Set();

  for (const [index, add] of adds.entries()) {
    const key = clean(add?.key, 31);
    const displayName = clean(add?.display_name, 160);
    if (!key || !NEW_KEY_RE.test(key)) return { ok: false, error: 'invalid_new_key', detail: `add_organisations[${index}].key` };
    if (seenKeys.has(key.toLowerCase())) return { ok: false, error: 'duplicate_new_key', detail: key };
    if (!displayName) return { ok: false, error: 'display_name_required', detail: `add_organisations[${index}]` };
    seenKeys.add(key.toLowerCase());
    const body = { display_name: displayName };
    const legalName = clean(add?.legal_name, 200);
    if (legalName) body.legal_name = legalName;
    const aliases = cleanAliases(add?.aliases);
    if (aliases?.length) body.aliases = aliases;
    writes.push({
      path: `people:organisation:new-${key.toLowerCase()}`,
      mode: 'create',
      content: JSON.stringify(body),
      diff: `Add organisation: ${displayName}`
    });
  }

  for (const [index, update] of updates.entries()) {
    const ref = organisationRefOrNull(update?.ref);
    if (!ref) return { ok: false, error: 'invalid_organisation_ref', detail: `update_organisations[${index}].ref` };
    const canonical = formatEntityRef(ref);
    const current = await lookupName(canonical);
    if (!current) return { ok: false, error: 'organisation_not_found', detail: canonical };
    const patch = {};
    const bits = [];
    const displayName = clean(update?.display_name, 160);
    if (displayName && displayName !== current) {
      patch.display_name = displayName;
      bits.push(`name → ${displayName}`);
    }
    if (typeof update?.legal_name === 'string') {
      patch.legal_name = clean(update.legal_name, 200) || null;
      bits.push(`legal name → ${patch.legal_name ?? '(none)'}`);
    }
    const aliases = cleanAliases(update?.aliases);
    if (aliases) {
      patch.aliases = aliases;
      bits.push(`aliases → ${aliases.length ? aliases.join(', ') : '(none)'}`);
    }
    if (!bits.length) return { ok: false, error: 'no_fields_to_update', detail: canonical };
    writes.push({
      path: `people:organisation:${ref.id}`,
      mode: 'overwrite',
      content: JSON.stringify(patch),
      diff: `Edit ${current}: ${bits.join('; ')}`
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
  professionalStore = null,
  env,
  fetchImpl,
  now,
  resolveEntity = defaultResolveEntity,
  getImportedPerson = getGithubPerson,
  createObservation = null,
  createRememberFact = null
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
        const { professional_profile: profilePatch, ...createInput } = body;
        const { record, ref } = await identityRepo.createIdentity({ kind: 'person', input: createInput });
        created.set(write.path, ref);
        let name = record.display_name;
        if (profilePatch && typeof profilePatch === 'object') {
          const parsed = typeof ref === 'string' ? parseEntityRef(ref) : ref;
          const updated = await identityRepo.updateFields({
            ref: parsed,
            patch: { professional_profile: profilePatch }
          });
          name = updated.display_name;
        }
        return { ok: true, result: { path: write.path, mode: 'create', ref, name } };
      }
      if (target.kind === 'person') {
        const ref = { namespace: 'shared', kind: 'person', id: target.id };
        const updated = await updatePerson(ref, body);
        return { ok: true, result: { path: write.path, mode: 'overwrite', ref: formatEntityRef(ref), name: updated.display_name } };
      }
      if (target.kind === 'organisation' && write.mode === 'create') {
        const { record, ref } = await identityRepo.createIdentity({ kind: 'organisation', input: body });
        created.set(write.path, ref);
        return { ok: true, result: { path: write.path, mode: 'create', ref, name: record.display_name } };
      }
      if (target.kind === 'organisation') {
        const ref = { namespace: 'shared', kind: 'organisation', id: target.id };
        const updated = await identityRepo.updateFields({ ref, patch: body });
        return { ok: true, result: { path: write.path, mode: 'overwrite', ref: formatEntityRef(ref), name: updated.display_name } };
      }
      if (target.kind === 'link') {
        const endpoint = value => (
          typeof value === 'string' && (value.startsWith('people:person:new-') || value.startsWith('people:organisation:new-'))
            ? created.get(value)
            : value
        );
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
      if (target.kind === 'observation') {
        if (typeof createObservation !== 'function' && !professionalStore) {
          return peopleError('professional_store_unbound', write.path);
        }
        let result;
        if (typeof createObservation === 'function') {
          result = await createObservation(body);
        } else {
          const { createObservationRepository } = await import('./observation-repository.mjs');
          const repo = createObservationRepository({
            store: professionalStore,
            ...(now ? { now } : {})
          });
          result = await repo.createObservation(body);
        }
        return {
          ok: true,
          result: {
            path: write.path,
            mode: 'create',
            observation_id: result.observation?.id ?? result.id,
            about_ref: body.about_ref
          }
        };
      }
      if (target.kind === 'remember') {
        if (typeof createRememberFact !== 'function' && !professionalStore) {
          return peopleError('professional_store_unbound', write.path);
        }
        let result;
        if (typeof createRememberFact === 'function') {
          result = await createRememberFact(body);
        } else {
          const { createRememberFactRepository } = await import('./remember-repository.mjs');
          const repo = createRememberFactRepository({
            store: professionalStore,
            ...(now ? { now } : {})
          });
          result = await repo.createFact({ ...body, author: body.author || 'adam' });
        }
        return {
          ok: true,
          result: {
            path: write.path,
            mode: 'create',
            remember_id: result.fact?.id ?? result.id,
            created: result.created !== false,
            ...(result.skipped ? { skipped: result.skipped } : {})
          }
        };
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
