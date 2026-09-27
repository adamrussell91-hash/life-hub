// Network Ecology I/O assembly (Phase 4 + miniworld data contract).
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
import { mapBounded } from './blobs-list.mjs';

const DAY_MS = 86_400_000;
const TRAVERSABLE_LINK_TYPES = new Set(['employee_at', 'member_of', 'professional_relationship']);
const TIMELINE_FLOOR_YEAR = 2015;
const UPCOMING_EVENT_DAYS = 60;
const EVENT_BATCH_SIZE = 10;

// Same predicate as `network-ecology-history.mjs` — inlined here to avoid a
// circular import (history already imports `filterVisiblePeople` from this
// module). Keep the two in lockstep.
function isLinkActiveAsOf(link, cutoffMs) {
  const validFromMs = link?.valid_from ? Date.parse(link.valid_from) : NaN;
  if (Number.isFinite(validFromMs) && validFromMs > cutoffMs) return false;
  const validToMs = link?.valid_to ? Date.parse(link.valid_to) : NaN;
  if (Number.isFinite(validToMs) && validToMs < cutoffMs) return false;
  return true;
}

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

function toIsoDateOnly(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function personLastContacted(person) {
  return toIsoDateOnly(person?.last_contacted ?? person?.professional_profile?.last_contacted ?? null);
}

function enrichNodes(graphNodes, peopleWithRelationships) {
  const byRef = new Map(peopleWithRelationships.map((entry) => [entry.person.ref, entry.person]));
  return [...graphNodes.values()].map((node) => {
    if (node.kind !== 'person') {
      return { ...node, last_contacted: null, is_self: false };
    }
    const person = byRef.get(node.ref);
    return {
      ...node,
      last_contacted: personLastContacted(person),
      is_self: person?.is_self === true
    };
  });
}

function extractProfessionalRelationshipLinks(peopleWithRelationships, { currentOnly = true, isLinkIncluded } = {}) {
  const seen = new Map();
  for (const { relationships } of peopleWithRelationships) {
    for (const { link } of relationships) {
      if (link.relationship_type !== 'professional_relationship') continue;
      if (isLinkIncluded) {
        if (!isLinkIncluded(link)) continue;
      } else if (currentOnly && link.status !== 'current') {
        continue;
      }
      if (!seen.has(link.id)) {
        seen.set(link.id, {
          id: link.id,
          source_ref: link.source_ref,
          target_ref: link.target_ref,
          role: link.role ?? null
        });
      }
    }
  }
  return [...seen.values()];
}

/** Every traversable link (current and ended) between visible endpoints. */
function extractAllTraversableLinks(peopleWithRelationships, visibleRefs) {
  const seen = new Map();
  for (const { relationships } of peopleWithRelationships) {
    for (const { link } of relationships) {
      if (!TRAVERSABLE_LINK_TYPES.has(link.relationship_type)) continue;
      if (link.status !== 'current' && link.status !== 'ended') continue;
      if (!visibleRefs.has(link.source_ref) || !visibleRefs.has(link.target_ref)) continue;
      if (seen.has(link.id)) continue;
      seen.set(link.id, {
        source_ref: link.source_ref,
        target_ref: link.target_ref,
        relationship_type: link.relationship_type,
        role: link.role ?? null,
        valid_from: link.valid_from ?? null,
        valid_to: link.valid_to ?? null,
        status: link.status
      });
    }
  }
  return [...seen.values()];
}

function earliestValidFromYear(peopleWithRelationships) {
  let earliest = null;
  for (const { relationships } of peopleWithRelationships) {
    for (const { link } of relationships) {
      if (!TRAVERSABLE_LINK_TYPES.has(link.relationship_type)) continue;
      if (!link.valid_from) continue;
      const ms = Date.parse(link.valid_from);
      if (!Number.isFinite(ms)) continue;
      const year = new Date(ms).getUTCFullYear();
      if (earliest == null || year < earliest) earliest = year;
    }
  }
  return earliest;
}

function mapOrganisationClusters(peopleWithRelationships, cutoff, { nowForStats } = {}) {
  const cutoffMs = cutoff.getTime();
  const isLinkIncluded = (link) => isLinkActiveAsOf(link, cutoffMs);
  const groups = groupCurrentOrganisationMembers(peopleWithRelationships, { isLinkIncluded });
  const links = extractProfessionalRelationshipLinks(peopleWithRelationships, { isLinkIncluded });
  const stats = computeOrganisationClusterStats(groups, links, { now: nowForStats ?? cutoff });
  const clusters = stats.map((s) => ({
    id: s.id,
    kind: 'organisation',
    label: s.label,
    member_refs: s.member_refs,
    habitat: classifyHabitat(s),
    since: s.since,
    event_date: null
  }));
  const bridgePeople = computeBridgePeople(groups);
  return { clusters, bridgePeople };
}

function buildOrganisationClusters(peopleWithRelationships, now) {
  return mapOrganisationClusters(peopleWithRelationships, now instanceof Date ? now : new Date(now), {
    nowForStats: now
  });
}

function buildTimeline(peopleWithRelationships, now) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const currentYear = nowDate.getUTCFullYear();
  const earliest = earliestValidFromYear(peopleWithRelationships);
  const startYear = Math.max(TIMELINE_FLOOR_YEAR, earliest ?? currentYear);
  const timeline = {};

  for (let year = startYear; year <= currentYear; year += 1) {
    const cutoff =
      year === currentYear
        ? nowDate
        : new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    const { clusters, bridgePeople } = mapOrganisationClusters(peopleWithRelationships, cutoff);
    timeline[String(year)] = {
      clusters,
      bridge_people: bridgePeople
    };
  }

  return timeline;
}

async function listMeetingEventCandidates(professionalStore) {
  if (!professionalStore) return [];
  const meetingRepo = createMeetingRepository({ store: professionalStore });
  const eventRepo = createEventRepository({ store: professionalStore });
  const [meetings, events] = await Promise.all([meetingRepo.listMeetings(), eventRepo.listEvents()]);
  return [
    ...meetings.map((m) => ({
      kind: 'meeting',
      id: m.id,
      title: m.title,
      scheduledStart: m.scheduled_start
    })),
    ...events.map((e) => ({
      kind: 'event',
      id: e.id,
      title: e.title,
      scheduledStart: e.start
    }))
  ];
}

async function attendeeRefsFor(candidate, { linkRepo, accessContext }) {
  const ref = formatEntityRef({ namespace: 'professional', kind: candidate.kind, id: candidate.id });
  if (!ref) return { ref: null, attendeeRefs: [] };

  let outgoing = [];
  try {
    ({ outgoing } = await linkRepo.listForEntity(ref, accessContext, {}));
  } catch {
    return { ref, attendeeRefs: [] };
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
    )
  ];
  return { ref, attendeeRefs };
}

// Meetings/Events in either the ±EVENT_WINDOW_DAYS wetland window or the
// next UPCOMING_EVENT_DAYS, with their (unfiltered) attendee refs. Listed
// once and hydrated in bounded batches: the earlier version listed every
// Meeting/Event twice and read each candidate's links one at a time, which
// pushed `/world` past the SPA's 20s abort on real Blob latency.
async function loadEventAttendance({ professionalStore, universalLinkStore, resolveEntity, createRepository, now }) {
  const candidates = await listMeetingEventCandidates(professionalStore);
  if (!candidates.length) return [];

  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const windowStart = nowMs - EVENT_WINDOW_DAYS * DAY_MS;
  const windowEnd = nowMs + Math.max(EVENT_WINDOW_DAYS, UPCOMING_EVENT_DAYS) * DAY_MS;
  const inRange = candidates
    .map((candidate) => ({ candidate, startMs: Date.parse(candidate.scheduledStart) }))
    .filter(({ startMs }) => Number.isFinite(startMs) && startMs >= windowStart && startMs <= windowEnd);
  if (!inRange.length) return [];

  const linkRepo = (createRepository ?? createUniversalLinkRepository)({
    store: universalLinkStore,
    resolveEntity: resolveEntity ?? defaultResolveEntity
  });
  const accessContext = createAccessContext({ workflow: 'life' });

  return mapBounded(inRange, EVENT_BATCH_SIZE, async ({ candidate, startMs }) => ({
    candidate,
    startMs,
    ...(await attendeeRefsFor(candidate, { linkRepo, accessContext }))
  }));
}

function buildEventClusters(attendance, { now, visiblePersonRefs }) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const windowMs = EVENT_WINDOW_DAYS * DAY_MS;
  const windowStart = nowMs - windowMs;
  const windowEnd = nowMs + windowMs;

  const clusters = [];
  for (const { candidate, startMs, ref, attendeeRefs: allRefs } of attendance) {
    if (startMs < windowStart || startMs > windowEnd) continue;
    const attendeeRefs = allRefs.filter((personRef) => visiblePersonRefs.has(personRef));
    if (!ref || attendeeRefs.length < HABITAT_MIN_CLUSTER_SIZE) continue;

    const eventDate = toIsoDateOnly(candidate.scheduledStart);
    const since = eventDate ? Number(eventDate.slice(0, 4)) : null;

    clusters.push({
      id: ref,
      kind: 'event',
      label: candidate.title || (candidate.kind === 'meeting' ? 'Meeting' : 'Event'),
      member_refs: attendeeRefs,
      habitat: classifyHabitat({ kind: 'event', size: attendeeRefs.length, inWindow: true }),
      since,
      event_date: eventDate
    });
  }

  return clusters;
}

function buildUpcomingEvents(attendance, { now, visiblePersonRefs }) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const windowEnd = nowMs + UPCOMING_EVENT_DAYS * DAY_MS;
  const upcoming = [];

  for (const { candidate, startMs, ref, attendeeRefs: allRefs } of attendance) {
    if (startMs < nowMs || startMs > windowEnd) continue;
    const attendeeRefs = allRefs.filter((personRef) => visiblePersonRefs.has(personRef));
    if (!ref || attendeeRefs.length === 0) continue;

    upcoming.push({
      ref,
      title: candidate.title || (candidate.kind === 'meeting' ? 'Meeting' : 'Event'),
      date: toIsoDateOnly(candidate.scheduledStart),
      attendee_refs: attendeeRefs
    });
  }

  upcoming.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return upcoming;
}

/**
 * `GET /api/network-ecology/world` data layer. Full graph plus miniworld
 * fields: dated `links`, per-node `last_contacted`/`is_self`, `timeline`,
 * `upcoming_events`, and clusters that always carry a habitat landform.
 */
export async function assembleWorldGraph(deps = {}) {
  const now = deps.now ?? new Date();
  // People and Meeting/Event attendance are independent Blob scans — run
  // them together; visibility filtering of attendees happens afterwards.
  const [peopleWithRelationships, attendance] = await Promise.all([
    loadVisiblePeople(deps),
    loadEventAttendance({
      professionalStore: deps.professionalStore,
      universalLinkStore: deps.store,
      resolveEntity: deps.resolveEntity,
      createRepository: deps.createRepository,
      now
    })
  ]);
  const graph = buildRelationshipGraph(peopleWithRelationships);

  const { clusters: organisationClusters, bridgePeople } = buildOrganisationClusters(
    peopleWithRelationships,
    now
  );

  const visiblePersonRefs = new Set(peopleWithRelationships.map((entry) => entry.person.ref));
  // Organisation nodes from the graph must count as visible endpoints for
  // link disclosure (they are already filtered at resolution time).
  const visibleRefs = new Set([...visiblePersonRefs, ...[...graph.nodes.keys()].filter((ref) => graph.nodes.get(ref)?.kind === 'organisation')]);

  const eventClusters = buildEventClusters(attendance, { now, visiblePersonRefs });

  const clusters = [...organisationClusters, ...eventClusters];
  const timeline = buildTimeline(peopleWithRelationships, now);
  // Current year in the timeline must equal today's organisation clusters
  // (events are Now-only wetlands; timeline years stay organisation-only
  // like `/history`).
  const currentYear = String((now instanceof Date ? now : new Date(now)).getUTCFullYear());
  if (timeline[currentYear]) {
    timeline[currentYear] = {
      clusters: organisationClusters,
      bridge_people: bridgePeople
    };
  }

  const upcomingEvents = buildUpcomingEvents(attendance, { now, visiblePersonRefs });

  return {
    nodes: enrichNodes(graph.nodes, peopleWithRelationships),
    edges: graph.edges.map((edge) => ({
      source_ref: edge.source_ref,
      target_ref: edge.target_ref,
      relationship_type: edge.relationship_type
    })),
    links: extractAllTraversableLinks(peopleWithRelationships, visibleRefs),
    clusters,
    bridge_people: bridgePeople,
    timeline,
    upcoming_events: upcomingEvents
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
