import { formatEntityRef } from './entity-ref.mjs';
import { warmthFor, touchpointsFromOverview } from './warmth-score.mjs';

/**
 * People redesign Phase 1–3 — directory rows assembled from
 * `loadAllPeopleWithRelationships` output. Warmth from Phase 3 score.
 * Open-item / proposal counts stay 0 here until the selected person's
 * brief/ledger/proposals fill them (V4 patches client-side too).
 */

const ORG_LINK_TYPES = new Set(['employee_at', 'member_of']);
const ROLE_LABELS = {
  colleague: 'Colleague',
  former_colleague: 'Former colleague',
  mentor: 'Mentor',
  mentee: 'Mentee',
  academic_contact: 'Academic contact',
  research_collaborator: 'Research collaborator',
  recruiter: 'Recruiter',
  referee: 'Referee',
  conference_contact: 'Conference contact',
  introduction: 'Introduction',
  other: 'Other'
};

function monogram(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function orgMonogram(name) {
  const words = String(name || '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'ORG';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function isCurrentLink(link) {
  return link.status === 'current' || (!link.valid_to && link.status !== 'ended' && link.status !== 'archived');
}

/**
 * @param {Array<{ person: object, relationships: Array<{ link: object, endpoint: object, direction: string }> }>} peopleWithRelationships
 * @param {{ now?: Date|string, proposalCounts?: Record<string, number> }} [options]
 */
export function assemblePeopleDirectory(peopleWithRelationships, options = {}) {
  const nowIso = options.now instanceof Date ? options.now.toISOString() : options.now ?? new Date().toISOString();
  const proposalCounts = options.proposalCounts ?? {};
  const organisationsByRef = new Map();
  const people = [];

  for (const { person, relationships } of peopleWithRelationships) {
    if (!person || person.is_self) continue;
    if (person.lifecycle_status === 'deleted' || person.lifecycle_status === 'deidentified') continue;

    const personRef = person.ref ?? formatEntityRef({ namespace: 'shared', kind: 'person', id: person.id });
    const currentOrgLinks = [];
    const formerOrgLinks = [];
    const proRoles = [];

    for (const entry of relationships ?? []) {
      const { link, endpoint } = entry;
      if (!link) continue;
      if (ORG_LINK_TYPES.has(link.relationship_type) && endpoint?.kind === 'organisation') {
        const org = {
          ref: endpoint.ref,
          id: endpoint.ref?.split(':')[2] ?? null,
          display_name: endpoint.display_label ?? 'Organisation',
          logo_key: null,
          monogram: orgMonogram(endpoint.display_label),
          current: isCurrentLink(link)
        };
        if (!organisationsByRef.has(org.ref)) organisationsByRef.set(org.ref, org);
        if (org.current) currentOrgLinks.push({ ...org, role: link.role ?? null });
        else formerOrgLinks.push({ ...org, role: link.role ?? null });
      }
      if (link.relationship_type === 'professional_relationship') {
        const role = link.role ?? 'other';
        const human = link.metadata?.human_label ?? null;
        proRoles.push({
          role,
          label: human || ROLE_LABELS[role] || role,
          current: isCurrentLink(link)
        });
      }
    }

    const touchpoints = touchpointsFromOverview({
      relationships: relationships ?? [],
      timeline: [],
      linkedRecords: {}
    });
    const warmthResult = warmthFor({
      touchpoints,
      relationships: relationships ?? [],
      personCreatedAt: person.created_at,
      now: nowIso
    });

    const primaryOrg = currentOrgLinks[0] ?? formerOrgLinks[0] ?? null;
    const roleLine =
      proRoles.find((r) => r.current)?.label ??
      (primaryOrg
        ? primaryOrg.current
          ? `At ${primaryOrg.display_name}`
          : `Formerly ${primaryOrg.display_name}`
        : 'No relationship on record');

    const pendingProposals = proposalCounts[personRef] ?? proposalCounts[person.id] ?? 0;

    people.push({
      id: person.id,
      ref: personRef,
      display_name: person.display_name,
      initials: monogram(person.display_name),
      role_line: roleLine,
      relationship_roles: proRoles,
      organisation: primaryOrg
        ? {
            ref: primaryOrg.ref,
            display_name: primaryOrg.display_name,
            monogram: primaryOrg.monogram,
            logo_key: primaryOrg.logo_key,
            current: primaryOrg.current
          }
        : null,
      organisations: [...currentOrgLinks, ...formerOrgLinks].map((o) => ({
        ref: o.ref,
        display_name: o.display_name,
        monogram: o.monogram,
        logo_key: o.logo_key,
        current: o.current
      })),
      warmth: warmthResult.warmth,
      warmth_band: warmthResult.band,
      warmth_tier: warmthResult.tier,
      warmth_feed_note: warmthResult.feedNote,
      relationship_state: warmthResult.state,
      relationship_reasons: warmthResult.reasons,
      open_item_count: 0,
      you_owe_count: 0,
      they_owe_count: 0,
      pending_proposal_count: pendingProposals,
      next_label: null,
      created_at: person.created_at,
      updated_at: person.updated_at
    });
  }

  people.sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }));

  return {
    people,
    organisations: [...organisationsByRef.values()].sort((a, b) =>
      a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' })
    ),
    counts: {
      people: people.length,
      organisations: organisationsByRef.size
    }
  };
}
