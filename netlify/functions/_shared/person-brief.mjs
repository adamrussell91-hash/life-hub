import { createAccessContext } from './entity-access.mjs';
import { formatEntityRef, parseEntityRef } from './entity-ref.mjs';
import { assembleEntityOverview } from './entity-overview.mjs';
import { findActiveSelfPerson } from './career-overview.mjs';
import { personHref, resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';
import { createMeetingRepository } from './meeting-repository.mjs';
import { createEventRepository } from './event-repository.mjs';
import { defaultGetUniversalLinkStore } from './universal-link-blobs.mjs';
import { defaultGetProfessionalStore } from './professional-blobs.mjs';

// Person Brief assembly (Phase 3, Feature 3.1 — BUILD-PLAN.md "Phase 3 —
// Person Brief and Relational Search"). Synchronous, non-LLM sections only:
// header (person/role/org + next upcoming meeting or event), "Who they
// are" (a rule-based templated sentence, NOT an LLM call), Open loops,
// Current shared work, and Mutual connections. "Since you last spoke" and
// "Talking points" (Feature 3.2) are deliberately NOT assembled here — a
// follow-up task adds an LLM-generation endpoint and wires it into the
// client's `data-brief-llm-section` placeholders
// (`apps/professional/src/views/person-brief.ts`).
//
// Reuses `assembleEntityOverview` for both the subject person and (for
// Mutual Connections) the active self person — "Who they are", "Open
// loops", and "Current shared work" are all re-shaped subsets of the exact
// same `current_relationships`/`linked_records` Phase 1's Person Profile
// already fetches; no new storage, per the plan's explicit instruction.

// A Task's own lifecycle status (`task-properties.mjs`'s DEFAULT
// `statuses` vocabulary: open, in_progress, done, deferred, dead) IS a
// real, reliable field distinguishing "still open" from "closed" — and it
// already reaches this module for free, since `entity-overview.mjs`'s
// `linked_records.tasks` entries are `RelationshipEndpoint` projections
// produced by `entity-resolvers.mjs`'s `resolveTask`, which sets
// `lifecycle_status: record.status` directly from the authoritative Task
// record. So Open Loops is NOT a scope cut: it lists this person's linked
// Tasks whose status is `open` or `in_progress`. `deferred`/`dead` are
// excluded too, even though neither is literally "complete" — both are
// lifecycle-closed (the task owner has explicitly set them aside), and
// surfacing them as an urgent pre-meeting "loop to close" would be
// misleading. (The mockup's own free-text examples — "Send the assessment
// reform draft you promised in March" — read as ad hoc commitments with no
// dedicated Task record at all; this module only ever lists REAL linked
// Tasks, never invents prose loops.)
const OPEN_TASK_STATUSES = new Set(['open', 'in_progress']);

// Mutual Connections basis relationship types — the three the feature spec
// names. `employee_at`/`member_of` counterparts are always Organisations
// (relationship-registry.mjs), never Persons, so in practice only
// `professional_relationship` (person-to-person) can ever produce a
// person-kind entry in the intersection computed below; the other two are
// still included in the counterpart set per the feature's literal
// definition ("a counterpart ... of BOTH"), in case a future registry
// change ever lets them intersect meaningfully. `buildMutualConnections`
// filters the intersection to `kind === 'person'` before returning it, so
// an org-only overlap is silently dropped rather than surfaced as a
// (nonsensical) "mutual person".
const MUTUAL_LINK_TYPES = new Set(['professional_relationship', 'employee_at', 'member_of']);
const MUTUAL_CONNECTIONS_CAP = 10;

// Title-cased phrasing for every `professional_relationship.role` value
// registry-permitted in `relationship-registry.mjs`'s `allowedRoles`. Used
// only by "Who they are" (never invents a role not actually stored).
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
  introduction: 'Introduction contact',
  other: 'Contact'
};

// SOURCE-BRIEF.md section 50, "Empty Brief" — verbatim, two paragraphs.
// Reused as data (not hard-coded again) by both the assembly result below
// and this module's own tests, so the client and the fixture can never
// drift from the source copy independently.
export const EMPTY_BRIEF_TITLE = 'No upcoming interaction found.';
export const EMPTY_BRIEF_BODY = 'Open a person and create a meeting or event first.';

function currentRelationshipsOfType(currentRelationships, type) {
  return currentRelationships.filter((entry) => entry.link.relationship_type === type);
}

/**
 * The person's own current `employee_at` (preferred) or `member_of` link,
 * used both for the header's role/org line and "Who they are"'s optional
 * org clause. Picks the first current entry of each type — `current_
 * relationships` carries no other "primary employer" signal to rank by.
 */
function findCurrentEmployment(currentRelationships) {
  const employeeAt = currentRelationshipsOfType(currentRelationships, 'employee_at')[0];
  if (employeeAt) return employeeAt;
  return currentRelationshipsOfType(currentRelationships, 'member_of')[0] ?? null;
}

/**
 * The "most notable" current `professional_relationship` entry, used by
 * "Who they are". Ranked by: (1) has a `metadata.human_label` — a human
 * deliberately wrote a note about this relationship, which is the
 * strongest signal of "notable" available; (2) earliest `valid_from` — the
 * longest-standing relationship, as a tie-break / fallback when no entry
 * has a human label. Deterministic and documented so a fixture test can
 * assert the exact pick.
 */
function pickNotableRelationship(currentRelationships) {
  const candidates = currentRelationshipsOfType(currentRelationships, 'professional_relationship');
  if (!candidates.length) return null;
  const ranked = [...candidates].sort((a, b) => {
    const aHasLabel = Boolean(a.link.metadata?.human_label);
    const bHasLabel = Boolean(b.link.metadata?.human_label);
    if (aHasLabel !== bHasLabel) return aHasLabel ? -1 : 1;
    const aFrom = a.link.valid_from ? Date.parse(a.link.valid_from) : Number.POSITIVE_INFINITY;
    const bFrom = b.link.valid_from ? Date.parse(b.link.valid_from) : Number.POSITIVE_INFINITY;
    return aFrom - bFrom;
  });
  return ranked[0];
}

/**
 * "Who they are" — RULE-BASED, not an LLM call (Feature 3.1 is explicitly
 * the non-LLM half of the Brief). Template:
 *
 *   "{Role label} since {year}{, at {Org}}. \"{human_label}.\""
 *
 * every clause honest and structured-field-only:
 *  - Role label: the most notable current `professional_relationship`'s
 *    `role`, title-cased via ROLE_LABELS (see `pickNotableRelationship` for
 *    how "most notable" is picked). Falls back to "Contact" for an
 *    unrecognised role value rather than throwing.
 *  - "since {year}": that relationship's `valid_from` year; the whole
 *    clause is omitted when `valid_from` is unset.
 *  - ", at {Org}": the person's current `employee_at` (preferred) or
 *    `member_of` organisation's `display_label`; omitted when neither
 *    exists.
 *  - Quoted sentence: `metadata.human_label`, verbatim, in quotes; omitted
 *    when absent.
 * No other fact is fabricated — if there is no current
 * `professional_relationship` at all, this returns an honest empty-state
 * sentence instead of inventing one.
 */
function buildWhoTheyAre(currentRelationships) {
  const relEntry = pickNotableRelationship(currentRelationships);
  if (!relEntry) {
    return 'No current professional relationship recorded yet.';
  }
  const roleLabel = ROLE_LABELS[relEntry.link.role] ?? 'Contact';
  const year = relEntry.link.valid_from ? new Date(relEntry.link.valid_from).getUTCFullYear() : null;
  const employment = findCurrentEmployment(currentRelationships);
  const humanLabel =
    typeof relEntry.link.metadata?.human_label === 'string' ? relEntry.link.metadata.human_label.trim() : '';

  let sentence = roleLabel;
  if (year) sentence += ` since ${year}`;
  if (employment) sentence += `, at ${employment.endpoint.display_label}`;
  sentence += '.';
  if (humanLabel) sentence += ` "${humanLabel}."`;
  return sentence;
}

/**
 * Open loops: see the module-level comment above for why this is a real
 * field, not a scope cut. Returns every linked Task whose status is `open`
 * or `in_progress`; an honest empty array (never fabricated placeholder
 * text) when there are none.
 */
function buildOpenLoops(linkedRecords) {
  return (linkedRecords.tasks ?? [])
    .filter((task) => OPEN_TASK_STATUSES.has(task.lifecycle_status))
    .map((task) => ({ ref: task.ref, label: task.display_label, href: task.href, status: task.lifecycle_status }));
}

/**
 * Current shared work: the exact same data selection as
 * `apps/professional/src/components/person-tabs.ts`'s `renderSharedWorkTab`
 * (Shared Work tab) — `linked_records.tasks/.communications/.meetings/
 * .events/.applications` flattened into one list — just reshaped into a
 * compact `{ kind, label, href, status }` item per entry for the Brief's
 * denser layout, rather than the tab's fuller `<ul>` rendering. No new
 * selection logic.
 */
function buildCurrentSharedWork(linkedRecords) {
  const items = [];
  const push = (kind, entries) => {
    for (const item of entries ?? []) {
      items.push({ kind, label: item.display_label, href: item.href, status: item.lifecycle_status });
    }
  };
  push('communication', linkedRecords.communications);
  push('task', linkedRecords.tasks);
  push('meeting', linkedRecords.meetings);
  push('event', linkedRecords.events);
  push('application', linkedRecords.applications);
  return items;
}

function collectMutualBasisCounterparts(currentRelationships) {
  const byRef = new Map();
  for (const entry of currentRelationships) {
    if (!MUTUAL_LINK_TYPES.has(entry.link.relationship_type)) continue;
    byRef.set(entry.endpoint.ref, entry.endpoint);
  }
  return byRef;
}

/**
 * Mutual connections: entities that are a current professional_relationship/
 * employee_at/member_of counterpart of BOTH `personRef` and `selfRef`,
 * intersected by ref, filtered to Person-kind entries only (see the
 * `MUTUAL_LINK_TYPES` comment above for why), capped at
 * `MUTUAL_CONNECTIONS_CAP`. Returns `[]` when there is no active self
 * person, or when the subject person IS the self person (a "mutual
 * connection with yourself" has no meaning).
 */
function buildMutualConnections(personRef, selfRef, personRelationships, selfRelationships) {
  if (!selfRef || personRef === selfRef) return [];
  const personCounterparts = collectMutualBasisCounterparts(personRelationships);
  const selfCounterparts = collectMutualBasisCounterparts(selfRelationships);
  const mutual = [];
  for (const [ref, endpoint] of personCounterparts) {
    if (ref === personRef || ref === selfRef) continue;
    if (!selfCounterparts.has(ref)) continue;
    if (endpoint.kind !== 'person') continue;
    mutual.push({ ref, display_label: endpoint.display_label, href: endpoint.href });
    if (mutual.length >= MUTUAL_CONNECTIONS_CAP) break;
  }
  return mutual;
}

/**
 * The header's next-upcoming-interaction lookup — the first function in
 * this codebase to answer "what's the next meeting/event for person X"
 * (BUILD-PLAN.md's own note: "No existing function lists" this). Per-person
 * and cheap: reuses the person's own link list (the same
 * `createUniversalLinkRepository().listForEntity` every other per-entity
 * view already calls — see `entity-overview.mjs`), filtered to `attendee`
 * links whose other endpoint is a `professional:meeting` or
 * `professional:event` ref, hydrated via `meeting-repository.mjs`/
 * `event-repository.mjs`, filtered to a future start, soonest first.
 *
 * Note: today's relationship registry (`relationship-registry.mjs`) only
 * declares `attendee` with `sourceKinds: ['professional:meeting']` — there
 * is no person-attendee relationship type for `professional:event` at all,
 * so the `event` branch below is currently unreachable in practice. It is
 * still implemented (not skipped) per the feature's explicit instruction
 * to check both kinds, and costs nothing extra — it will start working the
 * moment a future slice adds an event-attendee relationship type, with no
 * change needed here.
 */
async function findNextInteraction(personRef, { linkRepo, accessContext, meetingRepo, eventRepo, now }) {
  const { incoming } = await linkRepo.listForEntity(personRef, accessContext);
  const attendeeLinks = incoming.filter(
    (entry) =>
      entry.link.relationship_type === 'attendee' &&
      entry.link.status === 'current' &&
      (entry.endpoint.kind === 'meeting' || entry.endpoint.kind === 'event')
  );

  const nowMs = Date.parse(now());
  const candidates = [];
  for (const entry of attendeeLinks) {
    const parsed = parseEntityRef(entry.endpoint.ref);
    if (!parsed) continue;
    if (parsed.kind === 'meeting') {
      let meeting;
      try {
        meeting = await meetingRepo.getMeeting(parsed.id);
      } catch {
        continue;
      }
      if (!meeting.scheduled_start || Date.parse(meeting.scheduled_start) <= nowMs) continue;
      candidates.push({
        kind: 'meeting',
        title: meeting.title,
        start: meeting.scheduled_start,
        end: meeting.scheduled_end,
        time_zone: meeting.time_zone,
        location: meeting.location_text ?? null,
        href: entry.endpoint.href
      });
    } else {
      let event;
      try {
        event = await eventRepo.getEvent(parsed.id);
      } catch {
        continue;
      }
      if (!event.start || Date.parse(event.start) <= nowMs) continue;
      candidates.push({
        kind: 'event',
        title: event.title,
        start: event.start,
        end: event.end,
        time_zone: event.time_zone,
        location: event.location_text ?? null,
        href: entry.endpoint.href
      });
    }
  }

  candidates.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return candidates[0] ?? null;
}

function buildHeader(overview, nextInteraction) {
  const person = overview.entity;
  const employment = findCurrentEmployment(overview.current_relationships);
  return {
    person: {
      ref: person.ref,
      display_name: person.display_name,
      href: personHref(person.id)
    },
    role: employment?.link.role ?? null,
    organisation: employment
      ? { ref: employment.endpoint.ref, display_name: employment.endpoint.display_label, href: employment.endpoint.href }
      : null,
    // Non-null exactly when a future meeting/event was found. `null` means
    // the client renders SOURCE-BRIEF.md section 50's "Empty Brief" copy
    // (`EMPTY_BRIEF_TITLE`/`EMPTY_BRIEF_BODY`, exported above) in place of
    // the meeting-meta block — the rest of the Brief's sections still
    // render normally either way; only this one field is empty-state-aware.
    next_interaction: nextInteraction
  };
}

/**
 * Assembles the synchronous sections of one person's Brief. Throws the same
 * `entity_not_found`/`invalid_entity_ref` errors `assembleEntityOverview`
 * does for an unknown or malformed person id — callers (the route handler)
 * translate those into the response envelope the same way every other
 * Professional route does.
 */
export async function assemblePersonBrief(personId, deps = {}) {
  const universalStore = deps.universalStore ?? (await (deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore)());
  const professionalStore =
    deps.professionalStore ?? (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)());
  const resolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const createRepository = deps.createRepository ?? createUniversalLinkRepository;
  const createMeetings = deps.createMeetingRepository ?? createMeetingRepository;
  const createEvents = deps.createEventRepository ?? createEventRepository;
  const now = deps.now ?? (() => new Date().toISOString());
  const findSelf = deps.findActiveSelfPerson ?? findActiveSelfPerson;

  const personRef = formatEntityRef({ namespace: 'shared', kind: 'person', id: personId });

  const overview = await assembleEntityOverview(personRef || personId, {
    store: universalStore,
    env: deps.env,
    fetchImpl: deps.fetchImpl,
    resolveEntity,
    createRepository
  });

  const accessContext = createAccessContext({ workflow: 'life' });
  const linkRepo = createRepository({ store: universalStore, resolveEntity });
  const meetingRepo = createMeetings({ store: professionalStore });
  const eventRepo = createEvents({ store: professionalStore });

  const nextInteraction = await findNextInteraction(overview.entity.ref, {
    linkRepo,
    accessContext,
    meetingRepo,
    eventRepo,
    now
  });

  let mutualConnections = [];
  const self = await findSelf(universalStore);
  if (self && self.id !== personId) {
    const selfRef = formatEntityRef({ namespace: 'shared', kind: 'person', id: self.id });
    const selfOverview = await assembleEntityOverview(selfRef, {
      store: universalStore,
      env: deps.env,
      fetchImpl: deps.fetchImpl,
      resolveEntity,
      createRepository
    });
    mutualConnections = buildMutualConnections(
      overview.entity.ref,
      selfRef,
      overview.current_relationships,
      selfOverview.current_relationships
    );
  }

  return {
    header: buildHeader(overview, nextInteraction),
    who_they_are: buildWhoTheyAre(overview.current_relationships),
    open_loops: buildOpenLoops(overview.linked_records),
    current_shared_work: buildCurrentSharedWork(overview.linked_records),
    mutual_connections: mutualConnections
  };
}

export {
  buildCurrentSharedWork,
  buildHeader,
  buildMutualConnections,
  buildOpenLoops,
  buildWhoTheyAre,
  findNextInteraction
};
