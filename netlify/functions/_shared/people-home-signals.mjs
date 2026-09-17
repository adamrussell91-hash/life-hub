import { classifyRelationshipState } from './relationship-state.mjs';

// People Home (Phase 2, Features 2.2-2.3) — signal counts and the People
// Today modules. Every function here takes the SAME
// `loadAllPeopleWithRelationships` output (`people-collection.mjs`) as
// input — none of them re-scans storage independently.
//
// Named constants below are tunable, same pattern as
// `relationship-state.mjs`'s own thresholds — proposed defaults, not
// Adam-specified, flagged for tuning against real data.
export const UPCOMING_WINDOW_DAYS = 14;
export const RECENT_CHANGE_WINDOW_DAYS = 30;
export const NEW_CONNECTION_WINDOW_DAYS = 30; // matches NEW_PERSON_WINDOW_DAYS for consistency
export const RECONNECT_SUGGESTION_CAP = 5; // brief section 20: "three to five suggestions"
export const RECENT_CHANGES_DISPLAY_CAP = 10;
export const DORMANT_REVIEW_DISPLAY_CAP = 20;

const DAY_MS = 86_400_000;

function toIso(now) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function toDate(now) {
  return now instanceof Date ? now : new Date(now);
}

// Mirrors `entity-overview.mjs`'s private `effectiveDate` — a link's own
// best single date, in the same priority order.
function effectiveLinkDate(link) {
  return link.occurred_at ?? link.valid_from ?? link.created_at ?? null;
}

function daysBetween(earlierIso, laterIso) {
  return (Date.parse(laterIso) - Date.parse(earlierIso)) / DAY_MS;
}

function isWithinLastDays(iso, now, days) {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const diffDays = (toDate(now).getTime() - t) / DAY_MS;
  return diffDays >= 0 && diffDays <= days;
}

function personIdFromRef(ref) {
  const parts = String(ref).split(':');
  return parts.length === 3 ? parts[2] : null;
}

function buildPersonById(peopleWithRelationships) {
  const map = new Map();
  for (const { person } of peopleWithRelationships) map.set(person.id, person);
  return map;
}

function describePerson(ref, personById) {
  const id = personIdFromRef(ref);
  const person = id ? personById.get(id) : null;
  return { ref, display_name: person?.display_name ?? null };
}

// Every `professional_relationship` link seen across the whole population,
// deduped by link id (the same link is discovered once from each side's own
// relationships array — a person-to-person link between A and B appears
// under both A's and B's entries).
function collectProfessionalRelationshipLinks(peopleWithRelationships) {
  const byId = new Map();
  for (const { relationships } of peopleWithRelationships) {
    for (const entry of relationships) {
      if (entry.link.relationship_type !== 'professional_relationship') continue;
      if (byId.has(entry.link.id)) continue;
      byId.set(entry.link.id, entry);
    }
  }
  return [...byId.values()];
}

function pairKey(link) {
  return [link.source_ref, link.target_ref].slice().sort().join('|');
}

// Groups the deduped professional_relationship links by the (unordered)
// pair of people they connect, each group sorted newest-effective-date
// first — the basis for `lastMeaningfulInteraction`/
// `previousMeaningfulInteraction` below.
function groupByPair(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = pairKey(entry.link);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => {
      const ad = effectiveLinkDate(a.link);
      const bd = effectiveLinkDate(b.link);
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return Date.parse(bd) - Date.parse(ad);
    });
  }
  return groups;
}

/**
 * Classifies every CURRENT `professional_relationship` link exactly once,
 * via the ported `classifyRelationshipState` (relationship-state.mjs — see
 * its header for the keep-in-sync obligation with the TS original).
 *
 * `lastMeaningfulInteraction`/`previousMeaningfulInteraction` mirror the
 * Phase 1 client's own documented simplification
 * (`apps/professional/src/components/person-tabs.ts`,
 * `deriveRelationshipStateInput`): the two most recent DIRECT
 * professional_relationship links between this same pair of people
 * (current or historical), by effective date — not a full cross-type
 * interaction timeline (this aggregation has no cheaper way to build one
 * across the whole population; see PHASE-1-PROGRESS.md Phase 2 decisions).
 * `upcomingInteraction` and `activeSharedContexts` are likewise always
 * null/0 here — the same follow-up gap the Phase 1 client already
 * documents (no upcoming-interaction or shared-context data source exists
 * yet), not a new one introduced by this aggregation.
 *
 * `personCreatedAt` uses the link's source person's `created_at` (falling
 * back to the link's own `created_at` if that person cannot be found in
 * this scan) — inconsequential to the actual classification here, since
 * `lastMeaningfulInteraction` is derived from the link itself and is
 * therefore never null for a professional_relationship link, so the
 * classifier's "new" / zero-interaction branch (the only branch that reads
 * `personCreatedAt`) never fires for this aggregation.
 */
function classifyCurrentProfessionalRelationships(peopleWithRelationships, now) {
  const nowIso = toIso(now);
  const links = collectProfessionalRelationshipLinks(peopleWithRelationships);
  const groups = groupByPair(links);
  const personById = buildPersonById(peopleWithRelationships);

  const classified = [];
  for (const entry of links) {
    if (entry.link.status !== 'current') continue;
    const group = groups.get(pairKey(entry.link)) ?? [entry];
    const last = group[0] ? effectiveLinkDate(group[0].link) : null;
    const previous = group[1] ? effectiveLinkDate(group[1].link) : null;

    const sourcePersonId = personIdFromRef(entry.link.source_ref);
    const sourcePerson = sourcePersonId ? personById.get(sourcePersonId) : null;
    const personCreatedAt = sourcePerson?.created_at ?? entry.link.created_at;

    const result = classifyRelationshipState({
      lastMeaningfulInteraction: last,
      previousMeaningfulInteraction: previous,
      upcomingInteraction: null,
      activeSharedContexts: 0,
      personCreatedAt,
      now: nowIso
    });

    classified.push({
      link: entry.link,
      endpoint: entry.endpoint,
      state: result.state,
      reasons: result.reasons,
      lastMeaningfulInteraction: last
    });
  }
  return classified;
}

function countUpcomingInteractions(meetings, events, now) {
  const nowMs = toDate(now).getTime();
  const endMs = nowMs + UPCOMING_WINDOW_DAYS * DAY_MS;
  const inWindow = (iso) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) && t >= nowMs && t <= endMs;
  };
  const meetingCount = meetings.filter((m) => inWindow(m.scheduled_start)).length;
  const eventCount = events.filter((e) => inWindow(e.start)).length;
  return meetingCount + eventCount;
}

function countRecentRelationshipChanges(peopleWithRelationships, now) {
  const byId = new Map();
  for (const { relationships } of peopleWithRelationships) {
    for (const entry of relationships) {
      if (entry.link.relationship_type !== 'professional_relationship') continue;
      if (byId.has(entry.link.id)) continue;
      byId.set(entry.link.id, entry);
    }
  }
  let count = 0;
  for (const { link } of byId.values()) {
    if (isWithinLastDays(link.valid_from, now, RECENT_CHANGE_WINDOW_DAYS) || isWithinLastDays(link.valid_to, now, RECENT_CHANGE_WINDOW_DAYS)) {
      count += 1;
    }
  }
  return count;
}

/**
 * The 4 People Home signals — "descriptive rather than evaluative" per
 * SOURCE-BRIEF section 4. Signal definitions are Adam's explicit decisions
 * (delegated), implemented exactly:
 *
 * 1. active_relationships: deduped `professional_relationship` links,
 *    status 'current', classified 'active' or 'reactivated'.
 * 2. upcoming_interactions: Meetings + Events (unfiltered lists, passed in
 *    via the second argument) whose scheduled start falls within
 *    [now, now + UPCOMING_WINDOW_DAYS days].
 * 3. recent_relationship_changes: deduped `professional_relationship`
 *    links (any status) whose valid_from OR valid_to falls within the last
 *    RECENT_CHANGE_WINDOW_DAYS days.
 * 4. current_opportunity_windows: Phase 2 SIMPLIFIED PLACEHOLDER for
 *    Phase 4's richer multi-signal Opportunity layer (brief section 44 /
 *    BUILD-PLAN Phase 4 Feature 4.7) — deduped `professional_relationship`
 *    links currently classified 'reactivated'. The real Opportunity
 *    Windows logic needs event/project-overlap cross-referencing this
 *    aggregation has no inputs for; this is a deliberate scope cut, not an
 *    attempt at the real thing.
 *
 * `meetingsAndEvents` is `{ meetings, events }` — the unfiltered lists from
 * `meeting-repository.mjs#listMeetings`/`event-repository.mjs#listEvents`,
 * filtered to the upcoming window HERE rather than by a new
 * attendee-filtered repository method (out of scope for this task).
 *
 * Note: this module's signature deliberately adds the `meetingsAndEvents`
 * parameter beyond the plan's illustrative `computeSignals(peopleWithRelationships,
 * now)` sketch — signal 2 has no other input that could supply Meeting/
 * Event data, mirroring how `relationship-state.ts` itself already added
 * `previousMeaningfulInteraction` beyond its own illustrative shape for a
 * concrete, necessary reason.
 */
export function computeSignals(peopleWithRelationships, { meetings = [], events = [] } = {}, now = new Date()) {
  const classified = classifyCurrentProfessionalRelationships(peopleWithRelationships, now);

  const active_relationships = classified.filter((c) => c.state === 'active' || c.state === 'reactivated').length;
  const current_opportunity_windows = classified.filter((c) => c.state === 'reactivated').length;
  const upcoming_interactions = countUpcomingInteractions(meetings, events, now);
  const recent_relationship_changes = countRecentRelationshipChanges(peopleWithRelationships, now);

  return {
    active_relationships,
    upcoming_interactions,
    recent_relationship_changes,
    current_opportunity_windows
  };
}

function hasEarlierEndedSiblingForPair(link, byId) {
  const key = pairKey(link);
  for (const other of byId.values()) {
    if (other.link.id === link.id) continue;
    if (pairKey(other.link) !== key) continue;
    if (other.link.status !== 'ended' || !other.link.valid_to || !link.valid_from) continue;
    if (Date.parse(other.link.valid_to) <= Date.parse(link.valid_from)) return true;
  }
  return false;
}

/**
 * List version of signal #3 — "Recent relationship changes" People Today
 * module. Each entry cites the link, both people, and what changed:
 * 'opened' | 'closed' | 'role_changed'. `role_changed` is inferred, not
 * stored: `changeRole()` (universal-link-repository.mjs) implements a role
 * change by ending the old period link and opening a new one for the same
 * pair (per the relationship history model — "closes the previous ...
 * creates the next"), so a link whose `valid_from` falls in the window AND
 * whose pair already has an earlier `ended` sibling counts as a role
 * change rather than a fresh open.
 */
export function computeRecentRelationshipChanges(peopleWithRelationships, now) {
  const byId = new Map();
  for (const { relationships } of peopleWithRelationships) {
    for (const entry of relationships) {
      if (entry.link.relationship_type !== 'professional_relationship') continue;
      if (byId.has(entry.link.id)) continue;
      byId.set(entry.link.id, entry);
    }
  }
  const personById = buildPersonById(peopleWithRelationships);

  const changes = [];
  for (const { link } of byId.values()) {
    const openedRecently = isWithinLastDays(link.valid_from, now, RECENT_CHANGE_WINDOW_DAYS);
    const closedRecently = link.status === 'ended' && isWithinLastDays(link.valid_to, now, RECENT_CHANGE_WINDOW_DAYS);
    if (!openedRecently && !closedRecently) continue;

    const change_type = closedRecently ? 'closed' : (hasEarlierEndedSiblingForPair(link, byId) ? 'role_changed' : 'opened');

    changes.push({
      link_id: link.id,
      change_type,
      changed_at: closedRecently ? link.valid_to : link.valid_from,
      source: describePerson(link.source_ref, personById),
      target: describePerson(link.target_ref, personById),
      role: link.role,
      human_label: link.metadata?.human_label ?? null
    });
  }

  changes.sort((a, b) => Date.parse(b.changed_at) - Date.parse(a.changed_at));
  return changes.slice(0, RECENT_CHANGES_DISPLAY_CAP);
}

/**
 * "New connections" People Today module: Person records with `created_at`
 * within NEW_CONNECTION_WINDOW_DAYS, most-recent-first.
 */
export function computeNewConnections(peopleWithRelationships, now) {
  const entries = peopleWithRelationships
    .filter(({ person }) => isWithinLastDays(person.created_at, now, NEW_CONNECTION_WINDOW_DAYS))
    .map(({ person }) => ({ ref: person.ref, display_name: person.display_name, created_at: person.created_at }));

  entries.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return entries.slice(0, RECENT_CHANGES_DISPLAY_CAP);
}

/**
 * "Dormant relationships worth reviewing" People Today module: deduped
 * CURRENT `professional_relationship` links classified 'dormant'
 * specifically — NOT 'cooling' (that's Reconnect's territory, see
 * `computeReconnectSuggestions` below; this split is a deliberate design
 * decision, documented there and in PHASE-1-PROGRESS.md). Deliberately a
 * larger, browsable list (cap 20) distinct from Reconnect's small
 * actionable one (cap 5) — most-stale-first.
 */
export function computeDormantForReview(peopleWithRelationships, now) {
  const nowIso = toIso(now);
  const classified = classifyCurrentProfessionalRelationships(peopleWithRelationships, now);
  const personById = buildPersonById(peopleWithRelationships);

  const dormant = classified
    .filter((c) => c.state === 'dormant')
    .map((c) => ({
      link_id: c.link.id,
      source: describePerson(c.link.source_ref, personById),
      target: describePerson(c.link.target_ref, personById),
      role: c.link.role,
      human_label: c.link.metadata?.human_label ?? null,
      reasons: c.reasons,
      days_since_last_interaction: c.lastMeaningfulInteraction
        ? Math.round(daysBetween(c.lastMeaningfulInteraction, nowIso))
        : null
    }));

  dormant.sort((a, b) => (b.days_since_last_interaction ?? 0) - (a.days_since_last_interaction ?? 0));
  return dormant.slice(0, DORMANT_REVIEW_DISPLAY_CAP);
}

// The operator (is_self) is one side of most relationships; a Reconnect
// suggestion names the OTHER side as "the counterpart". When neither side
// (or both) is flagged is_self — two external contacts linked to each
// other, or a person missing from this scan — this defaults deterministically
// to the target side rather than guessing which one the suggestion is "for".
function pickCounterpart(link, personById) {
  const sourceId = personIdFromRef(link.source_ref);
  const targetId = personIdFromRef(link.target_ref);
  const sourcePerson = sourceId ? personById.get(sourceId) : null;
  const targetPerson = targetId ? personById.get(targetId) : null;
  if (sourcePerson?.is_self) return { ref: link.target_ref, person: targetPerson };
  if (targetPerson?.is_self) return { ref: link.source_ref, person: sourcePerson };
  return { ref: link.target_ref, person: targetPerson };
}

/**
 * "Reconnect" suggestions (SOURCE-BRIEF section 20): scoped to CURRENT
 * `professional_relationship` links classified 'cooling' ONLY — not
 * 'dormant' (brief section 20's own example, "Last meaningful interaction
 * was five months ago," sits within/near the cooling window, not deep
 * dormant). 'dormant' links get their own separate, larger "worth
 * reviewing" module (`computeDormantForReview` above) — this cooling/
 * dormant split is a deliberate decision made in this task, recorded in
 * PHASE-1-PROGRESS.md.
 *
 * Sorted by days-since-last-meaningful-interaction DESCENDING (most
 * overdue first), capped at RECONNECT_SUGGESTION_CAP (brief: "three to
 * five suggestions" — never a backlog, however many links qualify).
 *
 * Does NOT implement Dismiss/Snooze/Mark-dormant actions or their storage
 * — those need new persisted per-suggestion state (which relationship this
 * suggestion has been dismissed for, until when) that an aggregation
 * endpoint's scope doesn't cover. Deferred follow-up, likely Phase 3
 * territory.
 */
export function computeReconnectSuggestions(peopleWithRelationships, now) {
  const nowIso = toIso(now);
  const classified = classifyCurrentProfessionalRelationships(peopleWithRelationships, now);
  const personById = buildPersonById(peopleWithRelationships);

  const suggestions = classified
    .filter((c) => c.state === 'cooling')
    .map((c) => {
      const counterpart = pickCounterpart(c.link, personById);
      const daysSinceLast = c.lastMeaningfulInteraction
        ? Math.round(daysBetween(c.lastMeaningfulInteraction, nowIso))
        : null;
      return {
        link_id: c.link.id,
        person_ref: counterpart.ref,
        display_name: counterpart.person?.display_name ?? null,
        days_since_last_interaction: daysSinceLast,
        reasons: c.reasons,
        // Always 0 here — the same documented `activeSharedContexts`
        // simplification classification uses above. Cited per brief
        // section 20's example format whenever it becomes non-zero.
        active_shared_contexts: 0
      };
    });

  suggestions.sort((a, b) => (b.days_since_last_interaction ?? 0) - (a.days_since_last_interaction ?? 0));
  return suggestions.slice(0, RECONNECT_SUGGESTION_CAP);
}
