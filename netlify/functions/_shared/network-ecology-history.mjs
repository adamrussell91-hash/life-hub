// Network Ecology History mode (Phase 4, Feature 4.6) — point-in-time
// recomputation of habitat classification against Universal Link period
// data. See BUILD-PLAN.md Phase 4, Feature 4.6: "recompute classification
// against link data filtered to `valid_from <= scrubber_date <= (valid_to
// ?? now)` at each scrubbed point... Do not build a separate
// history-tracking store."
//
// SCOPING DECISION (delegated by Adam for this build, documented per the
// task's own instruction): the mockup/brief's fancy radial time-scrubber
// UI is replaced with a plain `<input type="date">` + "Recompute" button
// (`apps/professional/src/views/network-ecology.ts`'s History mode) —
// same underlying recomputation logic below, a plainer interaction. The
// scrubber's supporting primitive (`radial-year.js`) is simply unused.
//
// REUSE, NOT A FORK: `classifyHabitat`/`computeOrganisationClusterStats`/
// `computeBridgePeople` (habitat-classification.mjs) are imported and
// called completely UNCHANGED — only WHICH links feed them differs. That
// swap is threaded through two small, backward-compatible extension
// points added for this feature:
//   - `network-graph.mjs`'s `buildRelationshipGraph(peopleWithRelationships,
//     { isLinkIncluded })` — an optional predicate, defaulting to the
//     existing "current only" check, so `/world` and `/ego`'s existing
//     calls (one positional arg) are completely unaffected.
//   - `people-cohorts.mjs`'s `groupCurrentOrganisationMembers(
//     peopleWithRelationships, { isLinkIncluded })` — same pattern, same
//     default, so Dynamic Cohorts (Phase 2, Feature 2.4)'s existing call
//     is completely unaffected too.
// This module supplies `isLinkActiveAsOf(link, cutoffMs)` as that
// predicate instead of "is this link current right now" — the ONLY new
// logic; everything downstream (node/edge assembly, dedup, grouping,
// density/duration/role-diversity/bridge-ratio stats, the classification
// rule itself) is the exact same code `/world` already uses and already
// has its own dedicated tests.
//
// `loadAllPeopleWithRelationships` NEEDS NO NEW PARAMETER OR VARIANT for
// this feature. Confirmed by direct read of
// `universal-link-read-repository.mjs`: `listForEntity` (which
// `loadAllPeopleWithRelationships` calls per person) already discloses any
// link whose status is in `ORDINARY_READ_STATUSES` — `{'current',
// 'ended'}` — through an ordinary read, with `valid_from`/`valid_to` both
// intact on the returned record. So an already-ENDED link (one that WAS
// active as of a past History query date but has since ended) is already
// present in the exact same full scan `/world` performs; only `/world`'s
// OWN downstream helpers (`buildRelationshipGraph`,
// `groupCurrentOrganisationMembers`, `extractCurrentProfessionalRelationshipLinks`)
// additionally throw ended links away via `status === 'current'` checks —
// this module simply doesn't apply that "current only" filter, using
// `isLinkActiveAsOf` in its place.
//
// SCOPING DECISION — event (Wetland) clusters are NOT recomputed here;
// `clusters` in this endpoint's response is always `kind: 'organisation'`
// only. `attendee` — the only link type event clusters are built from — is
// declared `temporalMode: 'point'` (relationship-registry.mjs): it carries
// `occurred_at`, never a `valid_from`/`valid_to` PERIOD, so "was this
// attendee link active as of historical date X" is not a well-defined
// point-in-time query the way it is for the period-typed
// `employee_at`/`member_of`/`professional_relationship` links organisation
// clusters are built from. Re-deriving Wetland's separate "is the
// meeting/event near this date" time-window semantics for an arbitrary
// historical cutoff (rather than "now") is a distinct, larger piece of
// work than this task's explicit deliverable and is not exercised by any
// of its required tests (all of which are organisation-cluster/
// habitat-change tests) — a documented simplification, not a silent gap.
//
// VISIBILITY: identical rule to `/world`, deliberately NOT a separate
// policy — `filterVisiblePeople` (imported from `network-ecology-world.mjs`,
// not reimplemented) checks each person's CURRENT `lifecycle_status`, never
// a historical one. A person archived TODAY is excluded from a History
// query even for a date before they were ever archived: visibility is a
// property of the record's CURRENT state, not the queried instant — the
// same "hidden today stays hidden, never retroactively revealed" rule
// `/world` already enforces (see that module's own doc comment), applied
// here unchanged rather than invented afresh.

import { loadAllPeopleWithRelationships } from './people-collection.mjs';
import { filterVisiblePeople } from './network-ecology-world.mjs';
import { groupCurrentOrganisationMembers } from './people-cohorts.mjs';
import { classifyHabitat, computeBridgePeople, computeOrganisationClusterStats } from './habitat-classification.mjs';
import { buildRelationshipGraph } from './network-graph.mjs';

function invalidDateError(dateInput) {
  return Object.assign(new Error(`Invalid history date: ${JSON.stringify(dateInput)}`), {
    status: 400,
    code: 'invalid_date'
  });
}

// Accepts a bare date (`YYYY-MM-DD`, what `<input type="date">` sends) or
// any ISO timestamp `Date.parse` understands. Deliberately does NOT
// require `date <= now` — a future date, or a date with no matching data
// at all, is handled gracefully by the empty-result fall-through below
// (BUILD-PLAN.md Feature 4.6's own instruction: "handle gracefully...
// do not require date <= now as a hard validation rule unless there's a
// clear reason to" — there isn't one here: a future query simply surfaces
// whichever links already exist that also happen to satisfy the same
// as-of-that-instant test, which for a future instant is most current
// links plus none that have "ended" yet relative to it).
export function parseHistoryDate(dateInput) {
  if (typeof dateInput !== 'string' || !dateInput.trim()) throw invalidDateError(dateInput);
  const ms = Date.parse(dateInput);
  if (!Number.isFinite(ms)) throw invalidDateError(dateInput);
  return new Date(ms);
}

// The core point-in-time predicate: was `link` active at `cutoffMs`? A
// missing `valid_from` (period-mode relationships MAY omit it — see
// `relationship-registry.mjs`'s validation, which permits `valid_from:
// null` for a period relationship) is treated as "no known lower bound",
// i.e. it never excludes a link on that basis alone — the safest reading
// of genuinely unknown data, consistent with `avgDurationDays`'s own
// existing null-tolerant handling in `habitat-classification.mjs`. A
// link still open today (`valid_to: null`) has no upper bound, so it
// passes for any `cutoffMs >= valid_from`, including a `cutoffMs` equal
// to today.
export function isLinkActiveAsOf(link, cutoffMs) {
  const validFromMs = link?.valid_from ? Date.parse(link.valid_from) : NaN;
  if (Number.isFinite(validFromMs) && validFromMs > cutoffMs) return false;
  const validToMs = link?.valid_to ? Date.parse(link.valid_to) : NaN;
  if (Number.isFinite(validToMs) && validToMs < cutoffMs) return false;
  return true;
}

function extractProfessionalRelationshipLinksAsOf(peopleWithRelationships, cutoffMs) {
  const seen = new Map();
  for (const { relationships } of peopleWithRelationships) {
    for (const { link } of relationships) {
      if (link.relationship_type !== 'professional_relationship') continue;
      if (!isLinkActiveAsOf(link, cutoffMs)) continue;
      if (!seen.has(link.id)) {
        seen.set(link.id, { id: link.id, source_ref: link.source_ref, target_ref: link.target_ref, role: link.role ?? null });
      }
    }
  }
  return [...seen.values()];
}

async function loadVisiblePeople(deps) {
  const { store, resolveEntity, createRepository, now, env, fetchImpl } = deps;
  if (!store) throw new Error('Network Ecology History assembly requires a universal link store.');
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

/**
 * `GET /api/network-ecology/history?date=` data layer. Same response
 * shape as `assembleWorldGraph` (`{ nodes, edges, clusters, bridge_people }`)
 * plus the echoed `date` (the parsed cutoff instant, ISO-formatted) so the
 * client can confirm exactly what point in time it is displaying.
 */
export async function assembleHistoryGraph(dateInput, deps = {}) {
  const cutoff = parseHistoryDate(dateInput);
  const cutoffMs = cutoff.getTime();

  const peopleWithRelationships = await loadVisiblePeople(deps);
  const isLinkIncluded = (link) => isLinkActiveAsOf(link, cutoffMs);

  const graph = buildRelationshipGraph(peopleWithRelationships, { isLinkIncluded });

  const groups = groupCurrentOrganisationMembers(peopleWithRelationships, { isLinkIncluded });
  const professionalRelationshipLinks = extractProfessionalRelationshipLinksAsOf(peopleWithRelationships, cutoffMs);
  // `now: cutoff` (not real "now") — `computeOrganisationClusterStats`'s
  // `avgDurationDays` must reflect how long each membership had existed
  // AS OF the historical instant being queried, not how long it has
  // existed by today; otherwise the SAME underlying data would report a
  // longer duration at an EARLIER date than at a later one, which is
  // backwards and would make Forest's duration threshold meaningless for
  // History mode.
  const stats = computeOrganisationClusterStats(groups, professionalRelationshipLinks, { now: cutoff });

  const clusters = stats.map((s) => ({
    id: s.id,
    kind: 'organisation',
    label: s.label,
    member_refs: s.member_refs,
    habitat: classifyHabitat(s)
  }));

  const bridgePeople = computeBridgePeople(groups);

  return {
    date: cutoff.toISOString(),
    nodes: [...graph.nodes.values()],
    edges: graph.edges.map((edge) => ({
      source_ref: edge.source_ref,
      target_ref: edge.target_ref,
      relationship_type: edge.relationship_type
    })),
    clusters,
    bridge_people: bridgePeople
  };
}
