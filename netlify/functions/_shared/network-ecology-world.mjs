// Network Ecology I/O assembly (Phase 4, Features 4.1-data/4.2/4.5-text).
// Everything in this file does real I/O (Blobs reads via the injected
// repositories) — the PURE classification/graph logic it calls lives in
// `habitat-classification.mjs` and `network-graph.mjs`/`introduction-paths.mjs`,
// independently testable without any store at all.
//
// PRIVACY/VISIBILITY (BUILD-PLAN.md Phase 4 server contract, non-
// negotiable): "a hidden linked record must not leak through node
// presence, edge presence, or habitat membership counts... apply the same
// per-record visibility check to every node and edge it assembles, not
// just to the top-level entity a request names."
//
// `people-collection.mjs`'s `loadAllPeopleWithRelationships` deliberately
// passes `{ includeArchived: true }` as the RESOLVE OPTIONS for each
// person's OWN ref (the "self" side of `listForEntity`) — that is correct
// for its own documented purpose (an admin-facing full aggregation), but
// it means an ARCHIVED Person's own top-level `{ person, relationships }`
// entry still comes back in its output array, even though:
//   - every OTHER visible person's view of that archived person (as the
//     "other endpoint" of one of THEIR links) is already filtered out by
//     `universal-link-read-repository.mjs`'s `toAccessibleEntry`, which
//     resolves the other endpoint WITHOUT `includeArchived` and drops an
//     `endpoint_not_found` link entirely, and
//   - the same is true for archived/hidden Organisation endpoints.
// So the ONE remaining gap — and the one this module exists to close for
// Network Ecology specifically — is exactly the "not just the top-level
// entity a request names" case BUILD-PLAN.md calls out: `filterVisiblePeople`
// below drops an archived person's own top-level entry before it ever
// reaches graph/cluster/path assembly, so their node, their edges, and
// their cluster membership never appear anywhere in `/world`, `/ego`, or
// `/introduction-paths`'s output. See tests/integration/network-ecology-world.test.js's
// dedicated privacy test for the end-to-end proof.

import { loadAllPeopleWithRelationships } from './people-collection.mjs';
import { groupCurrentOrganisationMembers } from './people-cohorts.mjs';
import {
  HABITAT_MIN_CLUSTER_SIZE,
  EVENT_WINDOW_DAYS,
  classifyHabitat,
  computeBridgePeople,
  computeOrganisationClusterStats
} from './habitat-classification.mjs';
import { buildRelationshipGraph, computeEgoNeighborhood } from './network-graph.mjs';
import { findIntroductionPaths, MAX_INTRODUCTION_PATHS } from './introduction-paths.mjs';
import { createMeetingRepository } from './meeting-repository.mjs';
import { createEventRepository } from './event-repository.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';
import { createAccessContext } from './entity-access.mjs';
import { formatEntityRef } from './entity-ref.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';

const DAY_MS = 86_400_000;

function isVisiblePerson(person) {
  return person?.lifecycle_status !== 'archived';
}

// Exported for direct unit testing of the privacy gap this module closes,
// independent of any store.
export function filterVisiblePeople(peopleWithRelationships) {
  return (peopleWithRelationships ?? []).filter((entry) => isVisiblePerson(entry.person));
}

async function loadVisiblePeople(deps) {
  const { store, resolveEntity, createRepository, now, env, fetchImpl } = deps;
  if (!store) throw new Error('Network Ecology assembly requires a universal link store.');
  const loadPeople = deps.loadAllPeopleWithRelationships ?? loadAllPeopleWithRelationships;
  const peopleWithRelationships = await loadPeople({
    store,
    now,
    resolveEntity,
    createRepository,
    env,
    fetchImpl
  });
  return filterVisiblePeople(peopleWithRelationships);
}

function extractCurrentProfessionalRelationshipLinks(peopleWithRelationships) {
  const seen = new Map();
  for (const { relationships } of peopleWithRelationships) {
    for (const { link } of relationships) {
      if (link.status !== 'current') continue;
      if (link.relationship_type !== 'professional_relationship') continue;
      if (!seen.has(link.id)) {
        seen.set(link.id, { id: link.id, source_ref: link.source_ref, target_ref: link.target_ref, role: link.role ?? null });
      }
    }
  }
  return [...seen.values()];
}

function buildOrganisationClusters(peopleWithRelationships, now) {
  // Reuses `people-cohorts.mjs`'s exact Dynamic Cohorts grouping helper —
  // the same ">= 2 currently-linked people" organisation clusters Dynamic
  // Cohorts (Phase 2, Feature 2.4) already computes — rather than a
  // second, possibly-subtly-different pass over `peopleWithRelationships`.
  const groups = groupCurrentOrganisationMembers(peopleWithRelationships);
  const links = extractCurrentProfessionalRelationshipLinks(peopleWithRelationships);
  const stats = computeOrganisationClusterStats(groups, links, { now });

  const clusters = stats.map((s) => ({
    id: s.id,
    kind: 'organisation',
    label: s.label,
    member_refs: s.member_refs,
    habitat: classifyHabitat(s)
  }));

  const bridgePeople = computeBridgePeople(groups);
  return { clusters, bridgePeople };
}

async function buildEventClusters({ professionalStore, universalLinkStore, resolveEntity, createRepository, now, visiblePersonRefs }) {
  if (!professionalStore) return [];

  const meetingRepo = createMeetingRepository({ store: professionalStore });
  const eventRepo = createEventRepository({ store: professionalStore });
  const [meetings, events] = await Promise.all([meetingRepo.listMeetings(), eventRepo.listEvents()]);

  // Handled gracefully, per the task's own note: `attendee`'s registry
  // declaration currently only allows `sourceKinds: ['professional:meeting']`
  // (Phase 3 finding), so `events` attendee links may not exist in
  // practice yet — an empty `events` attendee result here is expected, not
  // an error, and simply yields zero event-derived candidate clusters for
  // Events (Meetings can still produce Wetland clusters normally).
  const linkRepo = (createRepository ?? createUniversalLinkRepository)({
    store: universalLinkStore,
    resolveEntity: resolveEntity ?? defaultResolveEntity
  });
  const accessContext = createAccessContext({ workflow: 'life' });

  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const windowMs = EVENT_WINDOW_DAYS * DAY_MS;
  const windowStart = nowMs - windowMs;
  const windowEnd = nowMs + windowMs;

  const candidates = [
    ...meetings.map((m) => ({ kind: 'meeting', id: m.id, title: m.title, scheduledStart: m.scheduled_start })),
    ...events.map((e) => ({ kind: 'event', id: e.id, title: e.title, scheduledStart: e.start }))
  ];

  const clusters = [];
  for (const candidate of candidates) {
    const startMs = Date.parse(candidate.scheduledStart);
    if (!Number.isFinite(startMs)) continue;
    if (startMs < windowStart || startMs > windowEnd) continue;

    const ref = formatEntityRef({ namespace: 'professional', kind: candidate.kind, id: candidate.id });
    if (!ref) continue;

    let outgoing = [];
    try {
      ({ outgoing } = await linkRepo.listForEntity(ref, accessContext, {}));
    } catch {
      // The meeting/event itself is somehow inaccessible to this read —
      // skip this one candidate cluster rather than failing the whole
      // world-graph assembly over it.
      continue;
    }

    const attendeeRefs = [
      ...new Set(
        outgoing
          .filter(
            (entry) =>
              entry.link.status === 'current' &&
              entry.link.relationship_type === 'attendee' &&
              entry.endpoint.kind === 'person'
          )
          .map((entry) => entry.endpoint.ref)
          // Privacy: an attendee's own visibility is re-checked against the
          // SAME visible-person universe every other node/edge in this
          // module is checked against — never trusted solely because the
          // attendee-link resolver happened to return it.
          .filter((personRef) => visiblePersonRefs.has(personRef))
      )
    ];

    if (attendeeRefs.length < HABITAT_MIN_CLUSTER_SIZE) continue;

    clusters.push({
      id: ref,
      kind: 'event',
      label: candidate.title || (candidate.kind === 'meeting' ? 'Meeting' : 'Event'),
      member_refs: attendeeRefs,
      habitat: classifyHabitat({ kind: 'event', size: attendeeRefs.length, inWindow: true })
    });
  }

  return clusters;
}

/**
 * `GET /api/network-ecology/world` data layer. Full graph: every visible
 * person/organisation node, every current `professional_relationship`/
 * `employee_at`/`member_of` edge between two visible nodes, every
 * candidate organisation/event cluster with its classified habitat
 * (`null` when genuinely unclassified — never forced), and Bridge People.
 */
export async function assembleWorldGraph(deps = {}) {
  const peopleWithRelationships = await loadVisiblePeople(deps);
  const graph = buildRelationshipGraph(peopleWithRelationships);

  const now = deps.now ?? new Date();
  const { clusters: organisationClusters, bridgePeople } = buildOrganisationClusters(peopleWithRelationships, now);

  const visiblePersonRefs = new Set(peopleWithRelationships.map((entry) => entry.person.ref));
  const eventClusters = await buildEventClusters({
    professionalStore: deps.professionalStore,
    universalLinkStore: deps.store,
    resolveEntity: deps.resolveEntity,
    createRepository: deps.createRepository,
    now,
    visiblePersonRefs
  });

  return {
    nodes: [...graph.nodes.values()],
    edges: graph.edges.map((edge) => ({
      source_ref: edge.source_ref,
      target_ref: edge.target_ref,
      relationship_type: edge.relationship_type
    })),
    clusters: [...organisationClusters, ...eventClusters],
    bridge_people: bridgePeople
  };
}

/**
 * `GET /api/network-ecology/ego?ref=&hops=` data layer. The neighbourhood
 * subgraph around `refInput`, over the SAME current-relationship-link
 * graph Introduction Paths uses (`network-graph.mjs`'s
 * `buildRelationshipGraph`) — an unknown/hidden `refInput` yields the same
 * empty `{ nodes: [], edges: [] }` `computeEgoNeighborhood` already
 * returns for a ref absent from the graph, never a distinct error.
 */
export async function assembleEgoGraph(refInput, deps = {}) {
  const hops = Number.isInteger(deps.hops) && deps.hops > 0 ? deps.hops : 2;
  const peopleWithRelationships = await loadVisiblePeople(deps);
  const graph = buildRelationshipGraph(peopleWithRelationships);
  const { nodes, edges } = computeEgoNeighborhood(graph, refInput, hops);

  return {
    nodes,
    edges: edges.map((edge) => ({
      source_ref: edge.source_ref,
      target_ref: edge.target_ref,
      relationship_type: edge.relationship_type
    }))
  };
}

/**
 * `GET /api/network-ecology/introduction-paths?from=&to=` data layer —
 * plain-text chain version only (Sankey deferred, see
 * `introduction-paths.mjs`'s own doc comment).
 */
export async function assembleIntroductionPaths(fromRef, toRef, deps = {}) {
  const maxHops = Number.isInteger(deps.maxHops) && deps.maxHops > 0 ? deps.maxHops : 3;
  const maxPaths = Number.isInteger(deps.maxPaths) && deps.maxPaths > 0 ? deps.maxPaths : MAX_INTRODUCTION_PATHS;
  const peopleWithRelationships = await loadVisiblePeople(deps);
  return findIntroductionPaths(peopleWithRelationships, fromRef, toRef, { maxHops, maxPaths });
}
