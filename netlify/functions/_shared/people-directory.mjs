import { formatEntityRef } from './entity-ref.mjs';
import { isImportedStudentPerson } from './github-professional-data.mjs';
import { cleanIdentityDisplayName } from './identity-display-name.mjs';
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
  student: 'Student',
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

  // Students are their own type: never mixed into `people` (the colleague
  // network every other surface reads), listed separately under `students`
  // so the People page can show them on their own. Imported Communications
  // students only arrive when the caller opted in (`includeStudents`).
  const students = [];

  for (const { person, relationships } of peopleWithRelationships) {
    if (!person || person.is_self) continue;
    const importedStudent = isImportedStudentPerson(person);
    if (importedStudent && !options.includeStudents) continue;
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
    // Job title at their current workplace says the most; then how you know
    // them; then just where they are.
    const titled = currentOrgLinks.find((o) => typeof o.role === 'string' && o.role.trim());
    const roleLine =
      (titled ? `${titled.role.trim()} · ${titled.display_name}` : null) ??
      proRoles.find((r) => r.current)?.label ??
      (primaryOrg
        ? primaryOrg.current
          ? `At ${primaryOrg.display_name}`
          : `Formerly ${primaryOrg.display_name}`
        : 'No relationship on record');

    const pendingProposals = proposalCounts[personRef] ?? proposalCounts[person.id] ?? 0;
    // Never surface Notion URL / `p/` debris in the directory name or avatar.
    const displayName = cleanIdentityDisplayName(person.display_name) || person.display_name;

    const isStudent =
      importedStudent || proRoles.some((r) => r.role === 'student' && r.current);
    const target = isStudent ? students : people;

    target.push({
      id: person.id,
      person_type: isStudent ? 'student' : 'colleague',
      ref: personRef,
      display_name: displayName,
      initials: monogram(displayName),
      role_line: importedStudent && !proRoles.length && !primaryOrg ? 'Student' : roleLine,
      relationship_roles: proRoles,
      job_title: titled ? titled.role.trim() : null,
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

  // Collapse hermit twins that share an exact display name (common when a
  // Communications `student_name` like "A and B" was ingested twice into Blobs
  // with no roles/org). Distinct people who share a name but have relationship
  // signal stay separate.
  const deduped = collapseHermitNameTwins(people);
  students.sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }));
  const dedupedStudents = collapseHermitNameTwins(students);

  return {
    people: deduped,
    students: dedupedStudents,
    organisations: [...organisationsByRef.values()].sort((a, b) =>
      a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' })
    ),
    counts: {
      people: deduped.length,
      students: dedupedStudents.length,
      organisations: organisationsByRef.size
    }
  };
}

function directoryRowSignal(row) {
  return (
    (row.relationship_roles?.length ?? 0) +
    (row.organisation ? 1 : 0) +
    (row.organisations?.length ?? 0) +
    (row.open_item_count ?? 0) +
    (row.you_owe_count ?? 0) +
    (row.they_owe_count ?? 0)
  );
}

/** Keep one row when two hermits share the same cleaned display name. */
function collapseHermitNameTwins(people) {
  const groups = new Map();
  for (const row of people) {
    const key = String(row.display_name || '')
      .toLowerCase()
      .trim() || `id:${row.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const kept = [];
  for (const rows of groups.values()) {
    if (rows.length === 1) {
      kept.push(rows[0]);
      continue;
    }
    const signaled = rows.filter((r) => directoryRowSignal(r) > 0);
    if (signaled.length) {
      // Named people with relationship signal stay; drop hermit twins of them.
      kept.push(...signaled);
      continue;
    }
    // All hermits — keep the first (sort already alphabetical).
    kept.push(rows[0]);
  }
  kept.sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }));
  return kept;
}
