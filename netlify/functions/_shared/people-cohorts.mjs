// Dynamic Cohorts (Phase 2, Feature 2.4). Groups people sharing a current
// organisation link (`employee_at`/`member_of`) into one cohort per
// organisation that has >= 2 currently-linked people — an organisation with
// only 1 linked person is not a "cohort". Per plan requirement: "people
// with no shared context appear in zero cohorts (not a default
// 'Uncategorised' cohort)" — there is no fallback bucket anywhere below;
// a person simply never gets added to `members` unless a real >=2-person
// group forms around them.
//
// Role-based cohorts (grouping by `professional_relationship.role`, e.g.
// every 'mentor'-role link) were considered and deliberately NOT
// implemented: a role value is already visible per-relationship on the
// Person Profile itself (Phase 1's human_label), and globally grouping
// "everyone I've ever labelled mentor" does not share an actual context
// the way a shared organisation does — it risks conflating unrelated
// mentor relationships across unrelated fields into one misleading bucket.
// Organisation-only cohorts are the meaningful grouping for Phase 2;
// documented here per the task's explicit instruction to record this
// reasoning either way.
//
// Cohort label: the organisation's own `display_name` directly (e.g.
// "UNSW"), not a generated creative label like "Gifted Education network"
// — that needs semantic tagging this task has no data for. Documented
// naming simplification.

const ORGANISATION_LINK_TYPES = new Set(['employee_at', 'member_of']);

// Shared low-level grouping helper — factored out so Phase 4's Habitat
// Classification (`habitat-classification.mjs` / `network-ecology-world.mjs`)
// reuses the EXACT SAME "who currently shares an organisation" grouping
// this module's own `computeDynamicCohorts` uses, rather than a second,
// possibly-subtly-different pass over `peopleWithRelationships`. Unlike
// `computeDynamicCohorts`'s output, each member entry here keeps the full
// relationship `link` (not just `ref`/`display_name`) — Habitat's
// `avgDurationDays` statistic needs `link.valid_from`, which
// `computeDynamicCohorts`'s own public shape deliberately never exposed
// (Dynamic Cohorts had no use for it). Only organisations with >= 2
// currently-linked people are returned — the same ">= 2" floor
// `computeDynamicCohorts`'s own comment documents below, and the same
// floor Habitat's `HABITAT_MIN_CLUSTER_SIZE` constant independently pins
// to the identical value for its own candidate-cluster gate.
export function groupCurrentOrganisationMembers(peopleWithRelationships) {
  const byOrg = new Map();

  for (const { person, relationships } of peopleWithRelationships) {
    for (const entry of relationships) {
      const { link, endpoint } = entry;
      if (link.status !== 'current') continue;
      if (!ORGANISATION_LINK_TYPES.has(link.relationship_type)) continue;
      if (endpoint.kind !== 'organisation') continue;

      if (!byOrg.has(endpoint.ref)) {
        byOrg.set(endpoint.ref, {
          ref: endpoint.ref,
          display_name: endpoint.display_label,
          members: new Map()
        });
      }
      byOrg.get(endpoint.ref).members.set(person.id, { ref: person.ref, display_name: person.display_name, link });
    }
  }

  const groups = [];
  for (const org of byOrg.values()) {
    if (org.members.size < 2) continue;
    const members = [...org.members.values()].sort((a, b) =>
      (a.display_name ?? '').localeCompare(b.display_name ?? '')
    );
    groups.push({ ref: org.ref, display_name: org.display_name, members });
  }
  return groups;
}

export function computeDynamicCohorts(peopleWithRelationships) {
  const groups = groupCurrentOrganisationMembers(peopleWithRelationships);

  const cohorts = groups.map((org) => ({
    kind: 'organisation',
    key: org.ref,
    label: org.display_name,
    organisation_ref: org.ref,
    // Strip `link` back off — `computeDynamicCohorts`'s public shape is
    // unchanged from before this refactor; only `groupCurrentOrganisationMembers`
    // (a new export) exposes it.
    members: org.members.map(({ ref, display_name }) => ({ ref, display_name }))
  }));

  cohorts.sort((a, b) => b.members.length - a.members.length || a.label.localeCompare(b.label));
  return cohorts;
}
