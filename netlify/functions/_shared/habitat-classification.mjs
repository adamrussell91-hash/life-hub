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
/** Sandbank: ≤4 people, every membership `valid_from` known and within this age. */
export const SANDBANK_MAX_SIZE = 4;
export const SANDBANK_MAX_AGE_DAYS = 365;

/** Habitats the miniworld always draws as landforms (never null on a cluster). */
export const HABITAT_KINDS = Object.freeze([
  'wetland',
  'sandbank',
  'island',
  'forest',
  'reef',
  'savannah'
]);

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

    // Sandbank candidacy: every member has a known valid_from within the
    // last SANDBANK_MAX_AGE_DAYS. A missing valid_from disqualifies the
    // whole cluster (truthfulness: never invent a start date).
    const isSandbankCandidate =
      size > 0 &&
      size <= SANDBANK_MAX_SIZE &&
      group.members.every((m) => {
        const vf = m.link?.valid_from;
        if (!vf || typeof vf !== 'string') return false;
        const age = daysBetween(vf, nowMs);
        return Number.isFinite(age) && age >= 0 && age <= SANDBANK_MAX_AGE_DAYS;
      });

    const sinceYears = group.members
      .map((m) => {
        const ms = m.link?.valid_from ? Date.parse(m.link.valid_from) : NaN;
        return Number.isFinite(ms) ? new Date(ms).getUTCFullYear() : null;
      })
      .filter((y) => y != null);
    const since = sinceYears.length ? Math.min(...sinceYears) : null;

    return {
      kind: 'organisation',
      id: group.ref,
      label: group.display_name,
      member_refs: group.members.map((m) => m.ref),
      size,
      density,
      avgDurationDays,
      roleDiversity,
      bridgeRatio,
      isSandbankCandidate,
      since
    };
  });
}

/**
 * Classification priority — first match wins (Network Ecology miniworld
 * BUILD-PLAN.md, Adam-approved order):
 *
 *   1. Wetland — event clusters ONLY (time-windowed gathering).
 *   2. Sandbank — small new organisation community (≤4, every membership
 *      started within the last year).
 *   3. Island — small AND barely bridging.
 *   4. Forest — dense AND long-lived.
 *   5. Reef — dense AND role-diverse.
 *   6. Savannah — large AND sparse (explicit rule).
 *   7. Savannah (catch-all) — organisation clusters that match no rule
 *      still need a landform (Open decision 1). Undersized / missing
 *      clusters still return `null` (not a community).
 */
export function classifyHabitat(cluster) {
  if (!cluster || !Number.isFinite(cluster.size) || cluster.size < HABITAT_MIN_CLUSTER_SIZE) return null;

  // 1. Wetland — event clusters only.
  if (cluster.kind === 'event') {
    return cluster.inWindow ? 'wetland' : null;
  }

  // 2. Sandbank — new organisation community.
  if (cluster.isSandbankCandidate === true) {
    return 'sandbank';
  }

  // 3. Island
  if (cluster.size <= ISLAND_MAX_SIZE && cluster.bridgeRatio <= ISLAND_MAX_BRIDGE_RATIO) {
    return 'island';
  }

  // 4. Forest
  if (
    cluster.density >= FOREST_MIN_DENSITY &&
    cluster.avgDurationDays >= FOREST_MIN_DURATION_DAYS &&
    cluster.size >= FOREST_MIN_SIZE
  ) {
    return 'forest';
  }

  // 5. Reef
  if (
    cluster.density >= REEF_MIN_DENSITY &&
    cluster.roleDiversity >= REEF_MIN_ROLE_DIVERSITY &&
    cluster.size >= REEF_MIN_SIZE
  ) {
    return 'reef';
  }

  // 6. Savannah (explicit large/sparse rule)
  if (cluster.size >= SAVANNAH_MIN_SIZE && cluster.density <= SAVANNAH_MAX_DENSITY) {
    return 'savannah';
  }

  // 7. Savannah catch-all — every organisation community gets a landform.
  return 'savannah';
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
