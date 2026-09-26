/**
 * People redesign Phase 2 — deterministic link inference (pure).
 * Produces proposal *inputs*; the repository decides create vs skip.
 *
 * Rules (BUILD-PLAN 2.2):
 * - Person name/alias in task/project/event title or body → contact / collaborator / attendee
 * - Shared current employer with Adam → colleague
 * - Project name contains "Mentor" + collaborator person → mentee (Adam as source)
 */

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameMatches(haystack, person) {
  const hay = normalizeName(haystack);
  if (!hay) return false;
  const names = [person.display_name, ...(person.aliases ?? [])]
    .map(normalizeName)
    .filter((n) => n.length >= 3);
  return names.some((n) => hay.includes(n));
}

function isCurrentLink(link) {
  return link.status === 'current' || (!link.valid_to && link.status !== 'ended' && link.status !== 'archived');
}

/**
 * @param {object} input
 * @param {object} input.selfPerson — Adam's person record `{ ref, display_name }`
 * @param {Array<{ person, relationships }>} input.peopleWithRelationships
 * @param {Array<{ id, ref, title, body?, status? }>} input.tasks
 * @param {Array<{ id, ref, title, body? }>} input.projects
 * @param {Array<{ id, ref, title, body?, kind?: 'meeting'|'event' }>} input.events
 * @param {Set<string>} [input.existingLinkKeys] — `${type}|${source}|${target}|${role||''}` already linked
 */
export function inferLinkProposals(input) {
  const selfRef = input.selfPerson?.ref;
  if (!selfRef) return [];

  const existing = input.existingLinkKeys ?? new Set();
  const proposals = [];
  const seenHashKeys = new Set();

  function push(proposal) {
    const key = [
      proposal.proposed_link.relationship_type,
      proposal.proposed_link.source_ref,
      proposal.proposed_link.target_ref,
      proposal.proposed_link.role ?? ''
    ].join('|');
    if (existing.has(key) || seenHashKeys.has(key)) return;
    seenHashKeys.add(key);
    proposals.push(proposal);
  }

  const people = (input.peopleWithRelationships ?? []).filter((p) => p.person && !p.person.is_self);

  // Shared employer → colleague
  const selfOrgs = new Set();
  const selfEntry = (input.peopleWithRelationships ?? []).find((p) => p.person?.is_self || p.person?.ref === selfRef);
  for (const entry of selfEntry?.relationships ?? []) {
    if (
      (entry.link?.relationship_type === 'employee_at' || entry.link?.relationship_type === 'member_of') &&
      isCurrentLink(entry.link) &&
      entry.endpoint?.kind === 'organisation'
    ) {
      selfOrgs.add(entry.endpoint.ref);
    }
  }

  for (const { person, relationships } of people) {
    const personRef = person.ref;
    for (const entry of relationships ?? []) {
      if (
        (entry.link?.relationship_type === 'employee_at' || entry.link?.relationship_type === 'member_of') &&
        isCurrentLink(entry.link) &&
        entry.endpoint?.kind === 'organisation' &&
        selfOrgs.has(entry.endpoint.ref)
      ) {
        push({
          person_ref: personRef,
          proposer: 'rules',
          reason: `You both work at ${entry.endpoint.display_label ?? 'the same organisation'}`,
          sources: [{ ref: entry.endpoint.ref, excerpt: entry.endpoint.display_label ?? '' }],
          proposed_link: {
            source_ref: selfRef,
            target_ref: personRef,
            relationship_type: 'professional_relationship',
            role: 'colleague',
            context_key: null,
            context_ref: null,
            valid_from: null,
            occurred_at: null,
            metadata: {}
          }
        });
      }
    }
  }

  // Name in task → contact
  for (const task of input.tasks ?? []) {
    if (task.status === 'done' || task.status === 'dead') continue;
    const text = `${task.title ?? ''} ${task.body ?? ''}`;
    const taskRef = task.ref ?? (task.id ? `tasks:task:${task.id}` : null);
    if (!taskRef) continue;
    for (const { person } of people) {
      if (!nameMatches(text, person)) continue;
      push({
        person_ref: person.ref,
        proposer: 'rules',
        reason: `from Task: ${task.title ?? 'untitled'}`,
        sources: [{ ref: taskRef, excerpt: task.title ?? '' }],
        proposed_link: {
          source_ref: taskRef,
          target_ref: person.ref,
          relationship_type: 'contact',
          role: null,
          context_key: null,
          context_ref: null,
          valid_from: null,
          occurred_at: null,
          metadata: {}
        }
      });
    }
  }

  // Name in project → collaborator; Mentor project → mentee
  for (const project of input.projects ?? []) {
    const projectRef = project.ref ?? (project.id ? `tasks:project:${project.id}` : null);
    if (!projectRef) continue;
    const title = project.title ?? '';
    const text = `${title} ${project.body ?? ''}`;
    const isMentorProject = /mentor/i.test(title);

    for (const { person } of people) {
      if (!nameMatches(text, person) && !isMentorProject) continue;
      // Collaborator when name appears
      if (nameMatches(text, person)) {
        push({
          person_ref: person.ref,
          proposer: 'rules',
          reason: `from Project: ${title || 'untitled'}`,
          sources: [{ ref: projectRef, excerpt: title }],
          proposed_link: {
            source_ref: projectRef,
            target_ref: person.ref,
            relationship_type: 'collaborator',
            role: null,
            context_key: null,
            context_ref: null,
            valid_from: null,
            occurred_at: null,
            metadata: {}
          }
        });
      }
    }

    // Mentor project with a collaborator person already linked, or name match
    if (isMentorProject) {
      const linkedPeople = new Set();
      for (const { person, relationships } of people) {
        const isCollab = (relationships ?? []).some(
          (e) =>
            e.link?.relationship_type === 'collaborator' &&
            (e.link.source_ref === projectRef || e.link.target_ref === person.ref)
        );
        if (isCollab || nameMatches(text, person)) linkedPeople.add(person.ref);
      }
      // Also: any person whose name is in the project title/body, or who is the
      // only named mentee candidate via "Accreditation Mentor" style titles —
      // when no names in title, still propose for people already collaborator-linked.
      for (const { person } of people) {
        if (!linkedPeople.has(person.ref) && !nameMatches(text, person)) continue;
        push({
          person_ref: person.ref,
          proposer: 'rules',
          reason: `from Project: ${title}`,
          sources: [{ ref: projectRef, excerpt: title }],
          proposed_link: {
            source_ref: selfRef,
            target_ref: person.ref,
            relationship_type: 'professional_relationship',
            role: 'mentee',
            context_key: null,
            context_ref: projectRef,
            valid_from: null,
            occurred_at: null,
            metadata: { human_label: title }
          }
        });
      }
    }
  }

  // Name in event/meeting → attendee
  for (const event of input.events ?? []) {
    const eventRef =
      event.ref ??
      (event.id
        ? event.kind === 'meeting'
          ? `professional:meeting:${event.id}`
          : `professional:event:${event.id}`
        : null);
    if (!eventRef) continue;
    const text = `${event.title ?? ''} ${event.body ?? ''}`;
    for (const { person } of people) {
      if (!nameMatches(text, person)) continue;
      push({
        person_ref: person.ref,
        proposer: 'rules',
        reason: `from ${event.kind === 'meeting' ? 'Meeting' : 'Event'}: ${event.title ?? 'untitled'}`,
        sources: [{ ref: eventRef, excerpt: event.title ?? '' }],
        proposed_link: {
          source_ref: eventRef,
          target_ref: person.ref,
          relationship_type: 'attendee',
          role: null,
          context_key: null,
          context_ref: null,
          valid_from: null,
          occurred_at: null,
          metadata: {}
        }
      });
    }
  }

  return proposals;
}

/**
 * Real-title fixtures for D4 — Henry's mentoring task and Accreditation Mentor project.
 */
export const HENRY_INFERENCE_FIXTURES = {
  selfPerson: { ref: 'shared:person:person_self', display_name: 'Adam Russell' },
  peopleWithRelationships: [
    {
      person: {
        ref: 'shared:person:person_henry',
        display_name: 'Henry McLennan',
        aliases: ['Henry'],
        is_self: false
      },
      relationships: [
        {
          link: {
            relationship_type: 'employee_at',
            status: 'current',
            valid_to: null
          },
          endpoint: {
            ref: 'shared:organisation:org_sac',
            kind: 'organisation',
            display_label: 'St. Aloysius College'
          }
        }
      ]
    },
    {
      person: { ref: 'shared:person:person_self', display_name: 'Adam Russell', is_self: true },
      relationships: [
        {
          link: { relationship_type: 'employee_at', status: 'current', valid_to: null },
          endpoint: {
            ref: 'shared:organisation:org_sac',
            kind: 'organisation',
            display_label: 'St. Aloysius College'
          }
        }
      ]
    }
  ],
  tasks: [
    {
      id: 'task_mentor_meet',
      ref: 'tasks:task:task_mentor_meet',
      title: 'Set up mentoring meeting with Henry McLennan',
      body: '',
      status: 'open'
    }
  ],
  projects: [
    {
      id: 'proj_accreditation',
      ref: 'tasks:project:proj_accreditation',
      title: 'Accreditation Mentor',
      body: 'Henry McLennan proficient pathway'
    }
  ],
  events: []
};
