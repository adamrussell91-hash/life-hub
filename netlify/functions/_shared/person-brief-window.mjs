import { parseEntityRef } from './entity-ref.mjs';

// "Since you last spoke" window computation (Phase 3, Feature 3.2). Pure,
// I/O-free functions over already-fetched data — the caller
// (`person-brief-generation.mjs`'s structured-input assembly) fetches
// `assembleEntityOverview`'s timeline, `listObservationsForAboutRef`'s
// observations, and `current_relationships`/`historical_relationships`, and
// hands them here as plain arrays. Nothing in this module ever touches
// storage, the network, or the Anthropic API — it is trivially testable
// against fixtures alone.
//
// `timeline` here is `assembleEntityOverview`'s own timeline entry shape
// (`entity-overview.mjs`'s `baseTimelineEntry`): `{ id, kind, date, end_date,
// label, context_key, source_ref, target_ref, href, context_href }`. This
// module never re-derives timeline logic of its own — it only classifies
// and filters entries `assembleEntityOverview` already produced, per this
// feature's explicit instruction to reuse that assembler rather than
// re-deriving timeline logic independently.
//
// `observations` is `listObservationsForAboutRef`'s projection:
// `{ id, about_ref, text, occurred_at, source, linked_ref, created_at,
// updated_at }` (`observation-schema.mjs`'s `projectObservation`).
//
// `relationshipLinks` (collectChangesSince only) is the concatenation of
// `assembleEntityOverview`'s own `current_relationships` and
// `historical_relationships` arrays — each entry `{ link, endpoint }`, where
// `link` carries `relationship_type`/`status`/`valid_from`/`valid_to`/`role`/
// `metadata` and `endpoint` carries `ref`/`display_label`/`href`/`kind`.

const RELATIONSHIP_CHANGE_TYPES = new Set(['professional_relationship', 'employee_at', 'member_of']);

// Every relationship type that can produce a Communication/Meeting/Event
// -sourced timeline entry for a Person (`recipient`, `about_person`,
// `attendee` — relationship-registry.mjs) declares that record as its
// `source_ref`, with the Person as `target_ref`. So the "other side"'s kind
// is always recoverable from `source_ref` alone, without needing the raw
// `relationship_type` (which `baseTimelineEntry` does not expose — only the
// already-composed `label` string is available there).
function timelineOtherKind(entry) {
  const parsed = parseEntityRef(entry?.source_ref);
  return parsed?.kind ?? null;
}

function toMillis(value) {
  if (!value) return NaN;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? NaN : ms;
}

// Tags a raw timeline entry with which "meaningful interaction" category (if
// any) it belongs to. `null` = not a category this module cares about — most
// importantly, an `employee_at`/`member_of`/`professional_relationship`
// timeline entry (a relationship-state change) is deliberately excluded
// here; those are "since then" facts collected separately by
// `collectChangesSince`, never a meaningful-interaction anchor.
function classifyTimelineEntry(entry) {
  const kind = timelineOtherKind(entry);
  if (kind === 'communication' || kind === 'meeting' || kind === 'event') {
    return { kind, date: entry.date };
  }
  return null;
}

/**
 * "Meaningful interaction" (Adam's decision, delegated and implemented
 * exactly): the most recent of —
 *   - a Communication-derived timeline entry (any relationship_type sourced
 *     from `professional:communication` — today `recipient`/`about_person`),
 *   - a PAST Meeting/Event-derived timeline entry (an `attendee` link whose
 *     meeting/event has already happened — `entry.date` is the meeting's
 *     `scheduled_start`, which `meeting-repository.mjs`'s `createMeeting`
 *     defaults onto the `attendee` link's `occurred_at` at creation time; a
 *     FUTURE meeting/event is explicitly excluded here, since it hasn't
 *     happened yet — that is the header's "next interaction", not a past
 *     one),
 *   - or an Observation's `occurred_at`.
 *
 * A pure relationship-state change (`employee_at`/`member_of`/
 * `professional_relationship` opening or closing) is deliberately NOT
 * considered a meaningful interaction — those are exactly the "since then"
 * facts `collectChangesSince` collects separately, never the anchor itself.
 *
 * Returns `null` when nothing qualifies (a brand-new person with no
 * recorded interaction at all) — this function is never given the person
 * record, so the documented fallback to the person's own `created_at` is the
 * CALLER's responsibility (see `person-brief-generation.mjs`'s
 * `assembleSinceLastSpokeContext`), not this function's.
 *
 * Returns `{ date, kind, id, ref, href, label }` rather than a bare ISO
 * string: the caller needs to know not just *when* but *what* the last
 * meaningful interaction was (a meeting title, an event name, ...) to build
 * the Brief's deterministic opening line without asking the LLM to invent or
 * restate a fact this function already knows precisely. `kind` is one of
 * `'communication' | 'meeting' | 'event' | 'observation'`.
 */
export function findLastMeaningfulInteraction(timeline, observations, now) {
  const nowMs = toMillis(now);
  const candidates = [];

  for (const entry of timeline ?? []) {
    const classified = classifyTimelineEntry(entry);
    if (!classified) continue;
    const dateMs = toMillis(classified.date);
    if (Number.isNaN(dateMs)) continue;
    // Communications are inherently already-sent, point-in-time messages —
    // there is no "future communication" concept — but a meeting/event must
    // actually be in the past to count as an interaction that has happened.
    if (Number.isFinite(nowMs) && dateMs > nowMs) continue;
    candidates.push({
      date: classified.date,
      kind: classified.kind,
      id: entry.id,
      ref: entry.source_ref ?? null,
      href: entry.href ?? null,
      label: entry.label ?? null,
      _dateMs: dateMs
    });
  }

  for (const observation of observations ?? []) {
    const dateMs = toMillis(observation?.occurred_at);
    if (Number.isNaN(dateMs)) continue;
    if (Number.isFinite(nowMs) && dateMs > nowMs) continue;
    candidates.push({
      date: observation.occurred_at,
      kind: 'observation',
      id: observation.id,
      ref: null,
      href: null,
      label: observation.text ?? null,
      _dateMs: dateMs
    });
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (a._dateMs !== b._dateMs) return b._dateMs - a._dateMs;
    // Deterministic tie-break only — ordering has no product meaning when
    // two interactions land on the exact same timestamp.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const { _dateMs, ...winner } = candidates[0];
  return winner;
}

// Strictly after `sinceMs` (excludes the anchor's own instant — the
// meaningful interaction that established `sinceIso` is not itself a "since
// then" fact) and no later than `nowMs`.
function inWindow(dateValue, sinceMs, nowMs) {
  const ms = toMillis(dateValue);
  if (Number.isNaN(ms)) return false;
  if (ms <= sinceMs) return false;
  if (Number.isFinite(nowMs) && ms > nowMs) return false;
  return true;
}

const EMPTY_CHANGES = Object.freeze({
  new_observations: [],
  new_communications: [],
  new_meetings_events: [],
  relationship_changes: []
});

/**
 * "Since then" facts (Adam's decision, implemented exactly): every
 * Observation, Communication, and Meeting/Event-derived timeline entry
 * strictly after `sinceIso` and up to `now`, plus every
 * `professional_relationship`/`employee_at`/`member_of` link that opened or
 * closed in that same window. Returns a plain structured object — NOT
 * prose — every field traced to a real record field, nothing synthesised.
 * This return value is handed to the LLM as its entire prompt input
 * (`person-brief-generation.mjs`'s `buildGenerationPrompt`) — it must never
 * carry a field that isn't a direct projection of a real stored value.
 *
 * Note on `new_observations`/`new_communications`/`new_meetings_events`:
 * under the current "meaningful interaction" definition above (the max
 * across these very same three categories), these will typically resolve to
 * empty arrays whenever `sinceIso` is the value `findLastMeaningfulInteraction`
 * itself returned — nothing in those categories can be newer than the
 * anchor it already picked as the most recent. They are still computed here
 * (not hard-coded to `[]`) for two reasons: (1) `sinceIso` may instead be
 * the person's own `created_at` fallback, which carries no such guarantee;
 * (2) keeping the contract honest and complete means it stays correct if
 * `findLastMeaningfulInteraction`'s definition ever narrows in a future
 * revision.
 */
export function collectChangesSince(timeline, observations, relationshipLinks, sinceIso, now) {
  const sinceMs = toMillis(sinceIso);
  const nowMs = toMillis(now);
  if (Number.isNaN(sinceMs)) return { ...EMPTY_CHANGES };

  const new_observations = [];
  const new_communications = [];
  const new_meetings_events = [];

  for (const entry of timeline ?? []) {
    const classified = classifyTimelineEntry(entry);
    if (!classified) continue;
    if (!inWindow(classified.date, sinceMs, nowMs)) continue;
    const item = { id: entry.id, date: entry.date, label: entry.label ?? null, href: entry.href ?? null };
    if (classified.kind === 'communication') new_communications.push(item);
    else new_meetings_events.push({ ...item, kind: classified.kind });
  }

  for (const observation of observations ?? []) {
    if (!observation || !inWindow(observation.occurred_at, sinceMs, nowMs)) continue;
    new_observations.push({
      id: observation.id,
      occurred_at: observation.occurred_at,
      text: observation.text,
      source: observation.source
    });
  }

  const relationship_changes = [];
  for (const entry of relationshipLinks ?? []) {
    const link = entry?.link;
    const endpoint = entry?.endpoint;
    if (!link || !endpoint) continue;
    if (!RELATIONSHIP_CHANGE_TYPES.has(link.relationship_type)) continue;

    if (link.valid_from && inWindow(link.valid_from, sinceMs, nowMs)) {
      relationship_changes.push({
        type: 'opened',
        relationship_type: link.relationship_type,
        counterpart_ref: endpoint.ref,
        counterpart_name: endpoint.display_label,
        date: link.valid_from
      });
    }
    if (link.valid_to && inWindow(link.valid_to, sinceMs, nowMs)) {
      relationship_changes.push({
        type: 'closed',
        relationship_type: link.relationship_type,
        counterpart_ref: endpoint.ref,
        counterpart_name: endpoint.display_label,
        date: link.valid_to
      });
    }
  }

  return { new_observations, new_communications, new_meetings_events, relationship_changes };
}
