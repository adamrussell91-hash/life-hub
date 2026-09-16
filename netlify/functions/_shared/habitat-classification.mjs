// Habitat classification (Phase 4, Feature 4.2) + Bridge People (Phase 4,
// Feature 4.5's other half) — pure functions only, no I/O. See
// BUILD-PLAN.md Phase 4 ("Feature 4.2 — Habitat classification rule": "Open
// product/algorithm decision, not yet made... Write the classifier as a
// pure, independently testable function") and SOURCE-BRIEF.md sections
// 28-33 for the qualitative Forest/Coral Reef/Mangrove/Savannah/Wetland/
// Island descriptions this module turns into a computable rule.
//
// The thresholds below are PLACEHOLDER DEFAULTS, delegated explicitly by
// Adam for this build (see the implementing task's own instructions) —
// not yet validated against real data, same unresolved status as
// `relationship-state.mjs`'s `NEW_PERSON_WINDOW_DAYS` etc. (Feature 1.6).
// Tune against real/realistic data before this ships to users. Named,
// exported, and gathered at the top of the file specifically so they are
// trivially adjustable without touching the classification logic — the
// same pattern `relationship-state.mjs` established.
//
// Mangrove (SOURCE-BRIEF.md section 30: "Mangrove represents bridges...
// People connect otherwise separate communities") is deliberately NOT a
// 7th branch of `classifyHabitat` — per the brief, it describes a PERSON's
// bridging role across clusters, not a cluster's own internal density/
// duration/diversity the way Forest/Reef/Savannah/Island/Wetland do.
// Implemented instead as the separate `computeBridgePeople` function below
// (which doubles as Feature 4.5's "Bridge People" — one implementation
// serves both, per the task's own cross-reference).

export const HABITAT_MIN_CLUSTER_SIZE = 2;
export const FOREST_MIN_DENSITY = 0.4;
export const FOREST_MIN_DURATION_DAYS = 365;
export const FOREST_MIN_SIZE = 3;
export const REEF_MIN_DENSITY = 0.3;
export const REEF_MIN_ROLE_DIVERSITY = 0.5;
export const REEF_MIN_SIZE = 3;
export const SAVANNAH_MIN_SIZE = 8;
export const SAVANNAH_MAX_DENSITY = 0.2;
export const ISLAND_MAX_BRIDGE_RATIO = 0.1;
export const ISLAND_MAX_SIZE = 5;
export const EVENT_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

function daysBetween(earlierIso, laterMs) {
  const earlierMs = Date.parse(earlierIso);
  if (!Number.isFinite(earlierMs) || !Number.isFinite(laterMs)) return 0;
  return (laterMs - earlierMs) / DAY_MS;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Enriches raw organisation groups — `people-cohorts.mjs`'s
 * `groupCurrentOrganisationMembers(peopleWithRelationships)` output shape,
 * `[{ ref, display_name, members: [{ ref, display_name, link }] }]`, where
 * `link` is the member's own CURRENT `employee_at`/`member_of` link
 * (carrying `valid_from`) — with the density/avgDurationDays/roleDiversity/
 * bridgeRatio statistics `classifyHabitat` needs. Pure: `currentProfessionalRelationshipLinks`
 * is the caller's already-deduped `[{ id, source_ref, target_ref, role }]`
 * list of CURRENT `professional_relationship` links; no I/O happens here.
 *
 * `bridgeRatio` per organisation group is computed against every OTHER
 * group in `organisationGroups` (not a global "is this person a bridge at
 * all" check) — a member counts toward `bridgeMemberCount` if they also
 * currently belong to >= 1 different group in this same input array.
 */
export function computeOrganisationClusterStats(organisationGroups, currentProfessionalRelationshipLinks, { now = new Date() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const groups = organisationGroups ?? [];
  const links = currentProfessionalRelationshipLinks ?? [];

  // personRef -> Set(orgRef) across every size->=2 organisation group in
  // this input, used for the "member also belongs to >= 1 OTHER cluster"
  // bridgeRatio test.
  const membershipByPerson = new Map();
  for (const group of groups) {
    for (const member of group.members) {
      if (!membershipByPerson.has(member.ref)) membershipByPerson.set(member.ref, new Set());
      membershipByPerson.get(member.ref).add(group.ref);
    }
  }

  return groups.map((group) => {
    const memberRefs = new Set(group.members.map((m) => m.ref));
    const size = group.members.length;

    const linksAmongMembers = links.filter(
      (link) => memberRefs.has(link.source_ref) && memberRefs.has(link.target_ref)
    );
    const possiblePairs = (size * (size - 1)) / 2;
    const density = possiblePairs > 0 ? linksAmongMembers.length / possiblePairs : 0;

    const avgDurationDays = mean(group.members.map((m) => daysBetween(m.link?.valid_from, nowMs)));

    const mutualLinks = linksAmongMembers;
    const roleDiversity =
      mutualLinks.length > 0 ? new Set(mutualLinks.map((link) => link.role)).size / mutualLinks.length : 0;

    const bridgeMemberCount = group.members.filter(
      (m) => (membershipByPerson.get(m.ref)?.size ?? 0) > 1
    ).length;
    const bridgeRatio = size > 0 ? bridgeMemberCount / size : 0;

    return {
      kind: 'organisation',
      id: group.ref,
      label: group.display_name,
      member_refs: group.members.map((m) => m.ref),
      size,
      density,
      avgDurationDays,
      roleDiversity,
      bridgeRatio
    };
  });
}

/**
 * Classification priority — first match wins, most-specific/temporal
 * signal first, broad catch-all last:
 *
 *   1. Wetland — event clusters ONLY, never an organisation cluster no
 *      matter its stats (SOURCE-BRIEF.md section 32's "grows before the
 *      event and recedes afterwards" is a fundamentally different, TIME-
 *      WINDOWED signal from the other five habitats' cluster-internal
 *      stats, so it is checked first and short-circuits everything else
 *      for that cluster kind).
 *   2. Island — small AND barely bridging. Checked before Forest/Reef so a
 *      small, dense, isolated clique (e.g. a 3-person team with high
 *      internal density) reads as Island rather than Forest/Reef — brief
 *      section 33's "specialisation and isolation" is the more specific,
 *      defining trait of a small self-contained cluster than sheer
 *      density is.
 *   3. Forest — dense AND long-lived (section 28: "mature, dense... long
 *      duration").
 *   4. Reef — dense AND role-diverse (section 29: "diversity, overlap and
 *      relational complexity"), independent of how long-lived it is.
 *   5. Savannah — large AND sparse, the broad catch-all for a big loose
 *      network (section 31: "broad, dispersed... moderate density").
 *   6. Unclassified (`null`) — a genuinely ungrouped cluster matching none
 *      of the above. Required, not an error (BUILD-PLAN.md Phase 4:
 *      "explicit 'no habitat forced' case for a genuinely ungrouped
 *      cluster").
 */
export function classifyHabitat(cluster) {
  if (!cluster || !Number.isFinite(cluster.size) || cluster.size < HABITAT_MIN_CLUSTER_SIZE) return null;

  // 1. Wetland — event clusters only. The caller is expected to have
  // already gated candidacy on size + window before constructing an
  // event-kind cluster object at all (see network-ecology-world.mjs), but
  // `inWindow` is still checked explicitly here too so this function stays
  // self-contained and directly fixture-testable without needing the full
  // assembly pipeline.
  if (cluster.kind === 'event') {
    return cluster.inWindow ? 'wetland' : null;
  }

  // 2. Island
  if (cluster.size <= ISLAND_MAX_SIZE && cluster.bridgeRatio <= ISLAND_MAX_BRIDGE_RATIO) {
    return 'island';
  }

  // 3. Forest
  if (
    cluster.density >= FOREST_MIN_DENSITY &&
    cluster.avgDurationDays >= FOREST_MIN_DURATION_DAYS &&
    cluster.size >= FOREST_MIN_SIZE
  ) {
    return 'forest';
  }

  // 4. Reef
  if (
    cluster.density >= REEF_MIN_DENSITY &&
    cluster.roleDiversity >= REEF_MIN_ROLE_DIVERSITY &&
    cluster.size >= REEF_MIN_SIZE
  ) {
    return 'reef';
  }

  // 5. Savannah
  if (cluster.size >= SAVANNAH_MIN_SIZE && cluster.density <= SAVANNAH_MAX_DENSITY) {
    return 'savannah';
  }

  // 6. Unclassified
  return null;
}

function joinWithAnd(labels) {
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

/**
 * People who are current members of >= 2 different organisation clusters
 * (size >= 2 each) — Mangrove/Feature 4.5's "Bridge People". Takes
 * `groupCurrentOrganisationMembers`'s raw group shape directly (the SAME
 * grouping Habitat's own cluster stats are built from — see
 * `computeOrganisationClusterStats` above), so bridging is always computed
 * against the identical cluster membership Habitat classification itself
 * used, never a second, possibly-different grouping pass.
 *
 * Each result carries a plain-language `description` citing WHICH
 * organisations/clusters the person bridges (e.g. "Connects UNSW and St
 * Aloysius") — per Principle 6, never a ranking/score, just a factual
 * description of what connects where.
 */
export function computeBridgePeople(organisationGroups) {
  const membershipByPerson = new Map();

  for (const group of organisationGroups ?? []) {
    for (const member of group.members) {
      if (!membershipByPerson.has(member.ref)) {
        membershipByPerson.set(member.ref, { display_name: member.display_name, clusters: [] });
      }
      membershipByPerson.get(member.ref).clusters.push({ ref: group.ref, label: group.display_name });
    }
  }

  const bridgePeople = [];
  for (const [ref, info] of membershipByPerson.entries()) {
    if (info.clusters.length < 2) continue;
    // Sorted alphabetically by label — a plain-language description must
    // read the same regardless of which order the underlying data happened
    // to load the person's organisation links in; it is not meant to leak
    // any internal loading/sort order as user-facing meaning.
    const sortedClusters = [...info.clusters].sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
    bridgePeople.push({
      ref,
      display_name: info.display_name,
      organisation_refs: sortedClusters.map((c) => c.ref),
      description: `Connects ${joinWithAnd(sortedClusters.map((c) => c.label))}`
    });
  }

  bridgePeople.sort((a, b) => (a.display_name ?? '').localeCompare(b.display_name ?? ''));
  return bridgePeople;
}
