import { getRelationshipDeclaration } from './relationship-registry.mjs';
import { loadAllPeopleWithRelationships } from './people-collection.mjs';
import { createObservationRepository } from './observation-repository.mjs';
import { mapBounded } from './blobs-list.mjs';

// Relational Search (Phase 3, Feature 3.3), Layer 1 only — structured
// filters, no natural-language/LLM query parsing. See BUILD-PLAN.md Phase
// 3 / Feature 3.3 and SOURCE-BRIEF.md section 45 ("RELATIONAL SEARCH").
// Layer 2 (an LLM query-planning layer translating a free-text question
// like "who have I not spoken with recently but share an active project
// with?" into these structured filters) is explicitly deferred to Phase 5
// per the plan's own allowance — not built here. Documented again in
// PHASE-1-PROGRESS.md.
//
// A relational query is up to three optional filters, ANDed together:
//   - organisation_ref: a CURRENT employee_at/member_of link to this org.
//   - role: a CURRENT professional_relationship link whose `role` matches
//     (must be one of the registry's declared `allowed_roles` for
//     `professional_relationship` — see relationship-registry.mjs).
//   - text: a case-insensitive substring match against EITHER a current
//     professional_relationship link's `metadata.human_label`, OR any of
//     the person's Observations' `text`. This is the only place
//     topic-level context (e.g. "gifted education") lives in this data
//     model today — there is no dedicated topic-tagging system, and this
//     task does not invent one.
//
// At least one filter is required (an all-empty query is a 400). Per
// Principle 6 (brief section 2/26), results are never ranked or scored —
// `runRelationalSearch` only filters and explains. Output order is a
// stable, simple alphabetical-by-name sort, nothing more.

const ORGANISATION_LINK_TYPES = new Set(['employee_at', 'member_of']);
const OBSERVATIONS_BATCH_SIZE = 10;

function professionalRelationshipRoles() {
  const declaration = getRelationshipDeclaration('professional_relationship');
  return new Set(declaration?.allowed_roles ?? []);
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

/** Normalises a raw query-param filter bag into `{ organisation_ref, role, text }`,
 * each either a trimmed non-empty string or `''` (absent). */
export function normalizeRelationalSearchFilters(raw = {}) {
  const organisationRef = typeof raw.organisation_ref === 'string' ? raw.organisation_ref.trim() : '';
  const role = typeof raw.role === 'string' ? raw.role.trim() : '';
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  return { organisation_ref: organisationRef, role, text };
}

function organisationLinkReason(entry) {
  const label = entry.endpoint.display_label ?? entry.endpoint.ref;
  return entry.link.relationship_type === 'employee_at' ? `Employed at ${label}` : `Member of ${label}`;
}

/**
 * Pure filter/explain function — no I/O. `peopleWithRelationships` is
 * `loadAllPeopleWithRelationships`'s output, with each entry additionally
 * carrying an `observations` array (`[{ text, ... }]`, from
 * `observation-repository.mjs`'s `listObservationsForAboutRef` — see
 * `searchPeopleRelationally` below for how that's attached). Throws a
 * `{status: 400}` error when every filter is empty, or `role` is not a
 * declared `professional_relationship` role.
 */
export function runRelationalSearch(peopleWithRelationships, rawFilters = {}) {
  const filters = normalizeRelationalSearchFilters(rawFilters);
  const { organisation_ref: organisationRef, role, text } = filters;

  if (!organisationRef && !role && !text) {
    throw validationError(
      'missing_filter',
      'At least one filter (organisation_ref, role, text) is required.'
    );
  }

  if (role && !professionalRelationshipRoles().has(role)) {
    throw validationError(
      'invalid_role',
      'role must be one of the relationship registry\'s declared professional_relationship roles.'
    );
  }

  const textLower = text.toLowerCase();
  const results = [];

  for (const entry of peopleWithRelationships ?? []) {
    const { person, relationships = [], observations = [] } = entry;
    const reasons = [];

    let organisationMatched = !organisationRef;
    if (organisationRef) {
      const match = relationships.find(
        (rel) =>
          rel.link.status === 'current' &&
          ORGANISATION_LINK_TYPES.has(rel.link.relationship_type) &&
          rel.endpoint.kind === 'organisation' &&
          rel.endpoint.ref === organisationRef
      );
      if (match) {
        organisationMatched = true;
        reasons.push(organisationLinkReason(match));
      }
    }

    let roleMatched = !role;
    if (role) {
      const match = relationships.find(
        (rel) =>
          rel.link.status === 'current' &&
          rel.link.relationship_type === 'professional_relationship' &&
          rel.link.role === role
      );
      if (match) {
        roleMatched = true;
        reasons.push(`Role: ${role}`);
      }
    }

    let textMatched = !text;
    if (text) {
      const labelMatch = relationships.find(
        (rel) =>
          rel.link.status === 'current' &&
          rel.link.relationship_type === 'professional_relationship' &&
          typeof rel.link.metadata?.human_label === 'string' &&
          rel.link.metadata.human_label.toLowerCase().includes(textLower)
      );
      if (labelMatch) {
        textMatched = true;
        reasons.push(`Human label mentions '${text}'`);
      }

      const observationMatch = observations.some(
        (observation) => typeof observation.text === 'string' && observation.text.toLowerCase().includes(textLower)
      );
      if (observationMatch) {
        textMatched = true;
        reasons.push(`Observation mentions '${text}'`);
      }
    }

    if (organisationMatched && roleMatched && textMatched) {
      results.push({
        person_ref: person.ref,
        display_name: person.display_name,
        matched_reasons: reasons
      });
    }
  }

  results.sort((a, b) => (a.display_name ?? '').localeCompare(b.display_name ?? ''));
  return results;
}

/**
 * Async orchestrator: loads every person + relationship set
 * (`loadAllPeopleWithRelationships`, the same full-scan foundation Dynamic
 * Cohorts and People Home Signals already use), attaches each person's
 * Observations with bounded concurrency (`mapBounded`, matching
 * `people-collection.mjs`'s own `PEOPLE_BATCH_SIZE` pattern rather than a
 * serial loop or unbounded `Promise.all`), then runs the pure filter above.
 */
export async function searchPeopleRelationally(rawFilters, deps = {}) {
  const { store, professionalStore, resolveEntity, createRepository, now } = deps;
  if (!store) throw new Error('searchPeopleRelationally requires a universal link store.');
  if (!professionalStore) throw new Error('searchPeopleRelationally requires a professional store.');

  const loadPeople = deps.loadAllPeopleWithRelationships ?? loadAllPeopleWithRelationships;
  const createObservations = deps.createObservationRepository ?? createObservationRepository;
  const observationRepo = createObservations({ store: professionalStore });

  const peopleWithRelationships = await loadPeople({ store, now, resolveEntity, createRepository });

  const withObservations = await mapBounded(peopleWithRelationships, OBSERVATIONS_BATCH_SIZE, async (entry) => {
    const observations = await observationRepo.listObservationsForAboutRef(entry.person.ref);
    return { ...entry, observations };
  });

  return runRelationalSearch(withObservations, rawFilters);
}
