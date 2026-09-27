/**
 * Source adapters for tie inference. Each yields evidence items:
 * `{ people, how, record_ref, date, text }`. Failed adapters are skipped.
 */

import { TIE_RECORD_PEOPLE_CAP } from './constants.mjs';
import { excerptAroundNames, redactExcludedNames, resolveNamedPeople } from './name-match.mjs';

/**
 * @typedef {{ ref: string, display_name: string, aliases?: string[], is_self?: boolean, org_refs?: string[] }} RosterPerson
 */

function dateOf(...values) {
  for (const v of values) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    if (typeof v === 'string' && Number.isFinite(Date.parse(v))) {
      return new Date(v).toISOString().slice(0, 10);
    }
  }
  return null;
}

/**
 * Collect person refs from Universal Link endpoints for a record.
 */
export function peopleRefsFromLinks(links, relationshipTypes) {
  const types = new Set(relationshipTypes);
  const refs = [];
  for (const link of links ?? []) {
    if (!types.has(link.relationship_type)) continue;
    for (const end of [link.source_ref, link.target_ref]) {
      if (typeof end === 'string' && end.startsWith('shared:person:')) refs.push(end);
    }
  }
  return [...new Set(refs)];
}

async function safeListLinks(linkRepo, recordRef, accessContext) {
  if (!linkRepo || typeof linkRepo.listForEntity !== 'function' || !recordRef) return [];
  try {
    const result = await linkRepo.listForEntity(recordRef, accessContext);
    return Array.isArray(result) ? result : result?.links ?? [];
  } catch {
    return [];
  }
}

/**
 * Profiles — A's profile names B → profile_mentions (one mention is enough).
 */
export function evidenceFromProfiles({ roster, excludedPeople = [] }) {
  const evidence = [];
  const ambiguous = [];
  let namedHits = 0;

  for (const person of roster ?? []) {
    const textRaw = [person.profile_summary, person.body_markdown, person.profile_body]
      .filter((t) => typeof t === 'string' && t.trim())
      .join('\n');
    if (!textRaw) continue;
    const text = redactExcludedNames(textRaw, excludedPeople);
    const { matched, ambiguous: amb } = resolveNamedPeople(text, roster);
    for (const name of amb) {
      if (!ambiguous.includes(name)) ambiguous.push(name);
    }
    for (const other of matched) {
      if (other.ref === person.ref) continue;
      namedHits += 1;
      evidence.push({
        people: [person.ref, other.ref],
        how: 'profile_mentions',
        record_ref: person.ref,
        date: null,
        text: excerptAroundNames(text, [person, other])
      });
    }
  }
  return { evidence, skipped: null, stats: { named_hits: namedHits, ambiguous_names: ambiguous } };
}

/**
 * Shared organisation — context only (never alone a candidate).
 */
export function evidenceFromOrganisations({ roster }) {
  const evidence = [];
  /** @type {Map<string, string[]>} */
  const byOrg = new Map();
  for (const person of roster ?? []) {
    for (const orgRef of person.org_refs ?? []) {
      const list = byOrg.get(orgRef) ?? [];
      list.push(person.ref);
      byOrg.set(orgRef, list);
    }
  }
  for (const [orgRef, refs] of byOrg) {
    if (refs.length < 2 || refs.length > TIE_RECORD_PEOPLE_CAP) continue;
    evidence.push({
      people: refs,
      how: 'shared_org',
      record_ref: orgRef,
      date: null,
      text: ''
    });
  }
  return { evidence, skipped: null, stats: { orgs_with_pairs: evidence.length } };
}

/**
 * Communications — co_recipient, recipient_about, named.
 */
export async function evidenceFromComms(deps) {
  const { communicationRepo, linkRepo, accessContext, roster, excludedPeople = [] } = deps;
  if (!communicationRepo) {
    return { evidence: [], skipped: 'communications_store_unavailable', stats: {} };
  }
  let records;
  try {
    records = await communicationRepo.listCommunications();
  } catch (error) {
    return {
      evidence: [],
      skipped: `communications_list_failed:${error?.code ?? error?.message ?? 'error'}`,
      stats: {}
    };
  }

  const evidence = [];
  const ambiguous = [];
  let multiPerson = 0;
  let namedHits = 0;

  for (const record of records ?? []) {
    const recordRef =
      record.ref ??
      (record.id ? `professional:communication:${record.id}` : null);
    if (!recordRef) continue;
    const links = await safeListLinks(linkRepo, recordRef, accessContext);
    const recipients = peopleRefsFromLinks(links, ['recipient']);
    const about = peopleRefsFromLinks(links, ['about_person']);
    const linked = [...new Set([...recipients, ...about])];
    if (linked.length >= 2) multiPerson += 1;

    if (recipients.length >= 2 && recipients.length <= TIE_RECORD_PEOPLE_CAP) {
      evidence.push({
        people: recipients,
        how: 'co_recipient',
        record_ref: recordRef,
        date: dateOf(record.occurred_at, record.date, record.created_at),
        text: excerptAroundNames(
          redactExcludedNames([record.subject, record.summary, record.body].filter(Boolean).join('\n'), excludedPeople),
          roster.filter((p) => recipients.includes(p.ref))
        )
      });
    }
    for (const r of recipients) {
      for (const a of about) {
        if (r === a) continue;
        evidence.push({
          people: [r, a],
          how: 'recipient_about',
          record_ref: recordRef,
          date: dateOf(record.occurred_at, record.date, record.created_at),
          text: excerptAroundNames(
            redactExcludedNames([record.subject, record.summary, record.body].filter(Boolean).join('\n'), excludedPeople),
            roster.filter((p) => p.ref === r || p.ref === a)
          )
        });
      }
    }

    const body = [record.subject, record.summary, record.body].filter(Boolean).join('\n');
    if (body) {
      const text = redactExcludedNames(body, excludedPeople);
      const { matched, ambiguous: amb } = resolveNamedPeople(text, roster);
      for (const name of amb) if (!ambiguous.includes(name)) ambiguous.push(name);
      if (matched.length >= 2 && matched.length <= TIE_RECORD_PEOPLE_CAP) {
        namedHits += matched.length;
        evidence.push({
          people: matched.map((p) => p.ref),
          how: 'named',
          record_ref: recordRef,
          date: dateOf(record.occurred_at, record.date, record.created_at),
          text: excerptAroundNames(text, matched),
          same_sentence: true
        });
      }
    }
  }

  return {
    evidence,
    skipped: null,
    stats: {
      records: records?.length ?? 0,
      multi_person: multiPerson,
      named_hits: namedHits,
      ambiguous_names: ambiguous
    }
  };
}

/**
 * Meetings — co_attendee, named.
 */
export async function evidenceFromMeetings(deps) {
  const { meetingRepo, linkRepo, accessContext, roster, excludedPeople = [] } = deps;
  if (!meetingRepo) {
    return { evidence: [], skipped: 'meetings_store_unavailable', stats: {} };
  }
  let records;
  try {
    records = await meetingRepo.listMeetings();
  } catch (error) {
    return {
      evidence: [],
      skipped: `meetings_list_failed:${error?.code ?? error?.message ?? 'error'}`,
      stats: {}
    };
  }

  const evidence = [];
  const ambiguous = [];
  let multiPerson = 0;
  let namedHits = 0;

  for (const record of records ?? []) {
    const recordRef = record.ref ?? (record.id ? `professional:meeting:${record.id}` : null);
    if (!recordRef) continue;
    const links = await safeListLinks(linkRepo, recordRef, accessContext);
    const attendees = peopleRefsFromLinks(links, ['attendee']);
    if (attendees.length >= 2) multiPerson += 1;
    if (attendees.length >= 2 && attendees.length <= TIE_RECORD_PEOPLE_CAP) {
      evidence.push({
        people: attendees,
        how: 'co_attendee',
        record_ref: recordRef,
        date: dateOf(record.occurred_at, record.starts_at, record.date, record.created_at),
        text: excerptAroundNames(
          redactExcludedNames(
            [record.title, record.purpose, record.summary, record.body].filter(Boolean).join('\n'),
            excludedPeople
          ),
          roster.filter((p) => attendees.includes(p.ref))
        )
      });
    }
    const body = [record.title, record.purpose, record.blocks, record.decisions, record.summary, record.body]
      .flat()
      .filter(Boolean)
      .map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
      .join('\n');
    if (body) {
      const text = redactExcludedNames(body, excludedPeople);
      const { matched, ambiguous: amb } = resolveNamedPeople(text, roster);
      for (const name of amb) if (!ambiguous.includes(name)) ambiguous.push(name);
      if (matched.length >= 2 && matched.length <= TIE_RECORD_PEOPLE_CAP) {
        namedHits += matched.length;
        evidence.push({
          people: matched.map((p) => p.ref),
          how: 'named',
          record_ref: recordRef,
          date: dateOf(record.occurred_at, record.starts_at, record.date),
          text: excerptAroundNames(text, matched),
          same_sentence: true
        });
      }
    }
  }

  return {
    evidence,
    skipped: null,
    stats: {
      records: records?.length ?? 0,
      multi_person: multiPerson,
      named_hits: namedHits,
      ambiguous_names: ambiguous
    }
  };
}

/**
 * Events — co_attendee (presenters/facilitators count double via duplicate how weight in classify),
 * named.
 */
export async function evidenceFromEvents(deps) {
  const { eventRepo, linkRepo, accessContext, roster, excludedPeople = [] } = deps;
  if (!eventRepo) {
    return { evidence: [], skipped: 'events_store_unavailable', stats: {} };
  }
  let records;
  try {
    records = await eventRepo.listEvents();
  } catch (error) {
    return {
      evidence: [],
      skipped: `events_list_failed:${error?.code ?? error?.message ?? 'error'}`,
      stats: {}
    };
  }

  const evidence = [];
  const ambiguous = [];
  let multiPerson = 0;
  let namedHits = 0;

  for (const record of records ?? []) {
    const recordRef = record.ref ?? (record.id ? `professional:event:${record.id}` : null);
    if (!recordRef) continue;
    const links = await safeListLinks(linkRepo, recordRef, accessContext);
    const attendees = peopleRefsFromLinks(links, ['attendee']);
    // Presenter / facilitator roles count as an extra co_attendee signal
    const weighted = [];
    for (const link of links ?? []) {
      if (link.relationship_type !== 'attendee') continue;
      const ref =
        link.source_ref?.startsWith('shared:person:')
          ? link.source_ref
          : link.target_ref?.startsWith('shared:person:')
            ? link.target_ref
            : null;
      if (!ref) continue;
      weighted.push(ref);
      if (link.role === 'presenter' || link.role === 'facilitator') weighted.push(ref);
    }
    const uniqueAttendees = [...new Set(attendees)];
    if (uniqueAttendees.length >= 2) multiPerson += 1;
    if (uniqueAttendees.length >= 2 && uniqueAttendees.length <= TIE_RECORD_PEOPLE_CAP) {
      evidence.push({
        people: uniqueAttendees,
        how: 'co_attendee',
        record_ref: recordRef,
        date: dateOf(record.occurred_at, record.starts_at, record.date, record.created_at),
        text: excerptAroundNames(
          redactExcludedNames([record.title, record.summary, record.body].filter(Boolean).join('\n'), excludedPeople),
          roster.filter((p) => uniqueAttendees.includes(p.ref))
        )
      });
      // Extra evidence item when weight > unique (presenter/facilitator)
      if (weighted.length > uniqueAttendees.length) {
        evidence.push({
          people: uniqueAttendees,
          how: 'co_attendee',
          record_ref: `${recordRef}#weighted`,
          date: dateOf(record.occurred_at, record.starts_at, record.date),
          text: ''
        });
      }
    }
    const body = [record.title, record.summary, record.body].filter(Boolean).join('\n');
    if (body) {
      const text = redactExcludedNames(body, excludedPeople);
      const { matched, ambiguous: amb } = resolveNamedPeople(text, roster);
      for (const name of amb) if (!ambiguous.includes(name)) ambiguous.push(name);
      if (matched.length >= 2 && matched.length <= TIE_RECORD_PEOPLE_CAP) {
        namedHits += matched.length;
        evidence.push({
          people: matched.map((p) => p.ref),
          how: 'named',
          record_ref: recordRef,
          date: dateOf(record.occurred_at, record.starts_at, record.date),
          text: excerptAroundNames(text, matched),
          same_sentence: true
        });
      }
    }
  }

  return {
    evidence,
    skipped: null,
    stats: {
      records: records?.length ?? 0,
      multi_person: multiPerson,
      named_hits: namedHits,
      ambiguous_names: ambiguous
    }
  };
}

export async function evidenceFromThreads(deps) {
  const { threadRepo, linkRepo, accessContext } = deps;
  if (!threadRepo) {
    return { evidence: [], skipped: 'threads_store_unavailable', stats: {} };
  }
  let records;
  try {
    records = await threadRepo.listThreads();
  } catch (error) {
    return {
      evidence: [],
      skipped: `threads_list_failed:${error?.code ?? error?.message ?? 'error'}`,
      stats: {}
    };
  }
  const evidence = [];
  for (const record of records ?? []) {
    const recordRef = record.ref ?? (record.id ? `professional:thread:${record.id}` : null);
    if (!recordRef) continue;
    const links = await safeListLinks(linkRepo, recordRef, accessContext);
    const people = peopleRefsFromLinks(links, ['in_thread']);
    // Also gather people linked to comms in this thread if the record embeds them
    if (Array.isArray(record.member_refs)) {
      for (const r of record.member_refs) {
        if (typeof r === 'string' && r.startsWith('shared:person:')) people.push(r);
      }
    }
    const unique = [...new Set(people)];
    if (unique.length >= 2 && unique.length <= TIE_RECORD_PEOPLE_CAP) {
      evidence.push({
        people: unique,
        how: 'co_thread',
        record_ref: recordRef,
        date: dateOf(record.updated_at, record.created_at),
        text: typeof record.title === 'string' ? record.title : ''
      });
    }
  }
  return { evidence, skipped: null, stats: { records: records?.length ?? 0 } };
}

export async function evidenceFromPromises(deps) {
  const { ledgerRepo, roster, excludedPeople = [] } = deps;
  if (!ledgerRepo) {
    return { evidence: [], skipped: 'ledger_store_unavailable', stats: {} };
  }
  // list across roster people
  const evidence = [];
  const ambiguous = [];
  let namedHits = 0;
  for (const person of roster ?? []) {
    let items;
    try {
      items = await ledgerRepo.listForPerson(person.ref, {});
    } catch {
      continue;
    }
    for (const item of items ?? []) {
      const textRaw = [item.text, item.body, item.note].filter(Boolean).join('\n');
      if (!textRaw) continue;
      const text = redactExcludedNames(textRaw, excludedPeople);
      const { matched, ambiguous: amb } = resolveNamedPeople(text, roster);
      for (const name of amb) if (!ambiguous.includes(name)) ambiguous.push(name);
      const others = matched.filter((p) => p.ref !== person.ref);
      if (others.length === 0) continue;
      namedHits += others.length;
      for (const other of others) {
        evidence.push({
          people: [person.ref, other.ref],
          how: 'named',
          record_ref: item.ref ?? item.id ?? `ledger:${person.ref}:${item.id ?? 'x'}`,
          date: dateOf(item.due_at, item.created_at),
          text: excerptAroundNames(text, [person, other]),
          same_sentence: true
        });
      }
    }
  }
  return {
    evidence,
    skipped: null,
    stats: { named_hits: namedHits, ambiguous_names: ambiguous }
  };
}

export async function evidenceFromApplications(deps) {
  const { applicationRepo, linkRepo, accessContext } = deps;
  if (!applicationRepo) {
    return { evidence: [], skipped: 'applications_store_unavailable', stats: {} };
  }
  let records;
  try {
    records = await applicationRepo.listApplications();
  } catch (error) {
    return {
      evidence: [],
      skipped: `applications_list_failed:${error?.code ?? error?.message ?? 'error'}`,
      stats: {}
    };
  }
  const evidence = [];
  for (const record of records ?? []) {
    const recordRef = record.ref ?? (record.id ? `professional:application:${record.id}` : null);
    if (!recordRef) continue;
    const links = await safeListLinks(linkRepo, recordRef, accessContext);
    const contacts = peopleRefsFromLinks(links, ['referee', 'application_contact']);
    if (contacts.length >= 2 && contacts.length <= TIE_RECORD_PEOPLE_CAP) {
      evidence.push({
        people: contacts,
        how: 'co_referee',
        record_ref: recordRef,
        date: dateOf(record.submitted_at, record.created_at),
        text: typeof record.title === 'string' ? record.title : ''
      });
    }
  }
  return { evidence, skipped: null, stats: { records: records?.length ?? 0 } };
}

export async function evidenceFromTasksProjects(deps) {
  const { tasks = [], projects = [], roster, excludedPeople = [] } = deps;
  const evidence = [];
  const ambiguous = [];
  let namedHits = 0;
  for (const record of [...(tasks ?? []), ...(projects ?? [])]) {
    const recordRef =
      record.ref ??
      (record.id
        ? record.kind === 'project' || String(record.ref || '').includes('project')
          ? `tasks:project:${record.id}`
          : `tasks:task:${record.id}`
        : null);
    if (!recordRef) continue;
    const body = [record.title, record.body, record.notes, record.description].filter(Boolean).join('\n');
    if (!body) continue;
    const text = redactExcludedNames(body, excludedPeople);
    const { matched, ambiguous: amb } = resolveNamedPeople(text, roster);
    for (const name of amb) if (!ambiguous.includes(name)) ambiguous.push(name);
    if (matched.length >= 2 && matched.length <= TIE_RECORD_PEOPLE_CAP) {
      namedHits += matched.length;
      evidence.push({
        people: matched.map((p) => p.ref),
        how: 'named',
        record_ref: recordRef,
        date: dateOf(record.updated_at, record.created_at),
        text: excerptAroundNames(text, matched),
        same_sentence: true
      });
    }
  }
  return {
    evidence,
    skipped: null,
    stats: {
      tasks: tasks?.length ?? 0,
      projects: projects?.length ?? 0,
      named_hits: namedHits,
      ambiguous_names: ambiguous
    }
  };
}

export async function evidenceFromKnowledge(deps) {
  const { knowledgePages = [], roster, excludedPeople = [] } = deps;
  if (!knowledgePages) {
    return { evidence: [], skipped: 'knowledge_unavailable', stats: {} };
  }
  const evidence = [];
  const ambiguous = [];
  let namedHits = 0;
  for (const page of knowledgePages) {
    const recordRef = page.ref ?? (page.id ? `knowledge:page:${page.id}` : null);
    if (!recordRef) continue;
    const body = [page.title, page.body, page.markdown, page.summary].filter(Boolean).join('\n');
    if (!body) continue;
    const text = redactExcludedNames(body, excludedPeople);
    const { matched, ambiguous: amb } = resolveNamedPeople(text, roster);
    for (const name of amb) if (!ambiguous.includes(name)) ambiguous.push(name);
    if (matched.length >= 2 && matched.length <= TIE_RECORD_PEOPLE_CAP) {
      namedHits += matched.length;
      evidence.push({
        people: matched.map((p) => p.ref),
        how: 'named',
        record_ref: recordRef,
        date: dateOf(page.updated_at, page.created_at),
        text: excerptAroundNames(text, matched),
        same_sentence: true
      });
    }
  }
  return {
    evidence,
    skipped: knowledgePages.length === 0 && deps.knowledgeMissing ? 'knowledge_unavailable' : null,
    stats: { pages: knowledgePages.length, named_hits: namedHits, ambiguous_names: ambiguous }
  };
}

/**
 * Run selected source adapters. Returns { evidence, perSource, skipped }.
 */
export async function collectEvidence(deps = {}) {
  const enabled = new Set(deps.sources ?? [
    'comms',
    'meetings',
    'events',
    'threads',
    'promises',
    'profiles',
    'organisations',
    'applications',
    'tasks',
    'knowledge'
  ]);

  const runners = {
    profiles: () => evidenceFromProfiles(deps),
    organisations: () => evidenceFromOrganisations(deps),
    comms: () => evidenceFromComms(deps),
    meetings: () => evidenceFromMeetings(deps),
    events: () => evidenceFromEvents(deps),
    threads: () => evidenceFromThreads(deps),
    promises: () => evidenceFromPromises(deps),
    applications: () => evidenceFromApplications(deps),
    tasks: () => evidenceFromTasksProjects(deps),
    knowledge: () => evidenceFromKnowledge(deps)
  };

  const evidence = [];
  const perSource = {};
  const skipped = {};

  for (const [id, run] of Object.entries(runners)) {
    if (!enabled.has(id)) {
      skipped[id] = 'disabled';
      continue;
    }
    try {
      const result = await run();
      perSource[id] = {
        evidence_count: result.evidence?.length ?? 0,
        stats: result.stats ?? {}
      };
      if (result.skipped) skipped[id] = result.skipped;
      evidence.push(...(result.evidence ?? []));
    } catch (error) {
      skipped[id] = `adapter_threw:${error?.message ?? 'error'}`;
      perSource[id] = { evidence_count: 0, stats: {} };
    }
  }

  return { evidence, perSource, skipped };
}
