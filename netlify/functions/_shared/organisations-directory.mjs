import { formatEntityRef } from './entity-ref.mjs';
import { findActiveSelfPerson } from './career-overview.mjs';
import { cleanIdentityDisplayName } from './identity-display-name.mjs';
import { warmthFor, touchpointsFromOverview } from './warmth-score.mjs';

/**
 * Organisations redesign Phase 1 — directory rows + chip derivation (V4).
 * FIX-BRIEF-01 A1/A2/A7/A8: real first-link dates, People warmth source,
 * honest chips, header first-date wording.
 */

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

function isCurrentLink(link, nowMs) {
  if (link.status === 'ended' || link.status === 'archived') return false;
  if (link.valid_to) {
    const end = Date.parse(link.valid_to);
    if (Number.isFinite(end) && end < nowMs) return false;
  }
  return link.status === 'current' || !link.valid_to;
}

function yearFull(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return String(d.getUTCFullYear());
}

function yearSpan(from, to, nowMs) {
  const start = yearFull(from);
  if (!start) return '';
  if (!to) return `${start}–now`;
  const endMs = Date.parse(to);
  if (Number.isFinite(endMs) && endMs > nowMs) return `${start}–now`;
  const end = yearFull(to);
  return end ? `${start}–${end}` : `${start}–now`;
}

function monthYear(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Real first-link date only (D1 / A1). Never import `created_at`.
 * Prefer valid_from / occurred_at; then earliest meeting/event/comm touch
 * with that person when the caller supplies extras.
 * @param {object} link
 * @param {string|null} [extraIso]
 */
export function realFirstLinkAt(link, extraIso = null) {
  const primary = link?.valid_from || link?.occurred_at || null;
  if (primary) return primary;
  if (extraIso && Number.isFinite(Date.parse(extraIso))) return extraIso;
  return null;
}

/**
 * Derive relationship chips for one organisation from its links.
 * @param {Array<{ link: object, endpoint: object, direction: string }>} relationships
 * @param {{ selfPersonRef?: string|null, nowMs?: number, presentedYears?: string[] }} [options]
 */
export function deriveOrganisationChips(relationships, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const selfRef = options.selfPersonRef ?? null;
  const chips = [];

  let venueCount = 0;
  let providerCount = 0;
  let presentedYears = new Set();
  let appliedAt = null;

  for (const entry of relationships ?? []) {
    const { link, endpoint, direction } = entry;
    void direction;
    if (!link) continue;
    const type = link.relationship_type;

    if (type === 'employee_at' && endpoint?.kind === 'person') {
      const current = isCurrentLink(link, nowMs);
      const role = link.role ? `${link.role} · ` : '';
      chips.push({
        kind: current ? 'workplace' : 'workplace_former',
        label: 'Workplace',
        detail: `${role}${yearSpan(link.valid_from, link.valid_to, nowMs)}`.trim(),
        filterBucket: 'work',
        _selfOnly: selfRef ? endpoint.ref === selfRef : false,
        _personId: endpoint.ref?.split(':')[2] ?? null
      });
    }

    if (type === 'member_of' && endpoint?.kind === 'person') {
      const role = (link.role || '').toLowerCase();
      const isAccreditation = /accredit/.test(role);
      chips.push({
        kind: isAccreditation ? 'accreditation' : 'member',
        label: isAccreditation ? 'Accreditation' : 'Member',
        detail: link.role || (link.valid_from ? `since ${yearFull(link.valid_from)}` : ''),
        filterBucket: isAccreditation ? 'bodies' : 'bodies',
        _selfOnly: selfRef ? endpoint.ref === selfRef : false,
        _personId: endpoint.ref?.split(':')[2] ?? null
      });
    }

    if (type === 'studied_at' && endpoint?.kind === 'person') {
      chips.push({
        kind: 'studied',
        label: 'Studied',
        detail: `${link.role ? `${link.role} ` : ''}${yearSpan(link.valid_from, link.valid_to, nowMs)}`.trim(),
        filterBucket: 'study',
        _selfOnly: selfRef ? endpoint.ref === selfRef : false,
        _personId: endpoint.ref?.split(':')[2] ?? null
      });
    }

    if (type === 'placement_at' && endpoint?.kind === 'person') {
      chips.push({
        kind: 'placement',
        label: 'Placement',
        detail: yearSpan(link.valid_from, link.valid_to, nowMs) || yearFull(link.valid_from) || '',
        filterBucket: 'study',
        _selfOnly: selfRef ? endpoint.ref === selfRef : false,
        _personId: endpoint.ref?.split(':')[2] ?? null
      });
    }

    if (type === 'venue' && endpoint?.kind === 'event') {
      venueCount += 1;
    }
    if (type === 'provider' && endpoint?.kind === 'event') {
      providerCount += 1;
    }

    if (type === 'applies_to' && endpoint?.kind === 'application') {
      appliedAt = link.occurred_at || link.valid_from || appliedAt;
    }
  }

  if (options.presentedYears?.length) {
    for (const y of options.presentedYears) presentedYears.add(String(y));
  }

  const selfChips = chips.filter((c) => c._selfOnly);
  const out = selfChips.map(({ _selfOnly, _personId, ...rest }) => rest);

  if (venueCount > 0) {
    out.push({
      kind: 'event_venue',
      label: 'Event venue',
      detail: `${venueCount} event${venueCount === 1 ? '' : 's'}`,
      filterBucket: 'events'
    });
  }
  if (providerCount > 0) {
    out.push({
      kind: 'pd_provider',
      label: 'PD provider',
      detail: `${providerCount} course${providerCount === 1 ? '' : 's'}`,
      filterBucket: 'events'
    });
  }
  if (presentedYears.size > 0) {
    const years = [...presentedYears].sort();
    out.push({
      kind: 'you_presented',
      label: 'You presented',
      detail: years[years.length - 1],
      filterBucket: 'events'
    });
  }
  if (appliedAt) {
    out.push({
      kind: 'applied',
      label: 'Applied',
      detail: monthYear(appliedAt),
      filterBucket: 'prospects'
    });
  }

  const seen = new Set();
  return out.filter((c) => {
    const key = `${c.kind}:${c.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Build personId → { band, score } from People directory inputs (A2 / V4).
 * Same touchpoints + warmthFor path as assemblePeopleDirectory.
 * @param {Array<{ person: object, relationships: Array }>} peopleWithRelationships
 * @param {string} nowIso
 */
export function buildPersonWarmthById(peopleWithRelationships, nowIso) {
  const map = new Map();
  for (const { person, relationships } of peopleWithRelationships ?? []) {
    if (!person?.id) continue;
    if (person.is_self) continue;
    if (person.lifecycle_status === 'deleted' || person.lifecycle_status === 'deidentified') {
      continue;
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
    map.set(person.id, { band: warmthResult.band, score: warmthResult.score });
  }
  return map;
}

/**
 * @param {Array<{ organisation: object, relationships: Array }>} orgsWithRelationships
 * @param {{
 *   now?: Date|string,
 *   selfPerson?: object|null,
 *   personWarmthById?: Map<string,{band:string,score:number}>|Record<string,{band:string,score:number}>,
 *   personExtraFirstLinkAt?: Map<string,string>|Record<string,string>
 * }} [options]
 */
export function assembleOrganisationsDirectory(orgsWithRelationships, options = {}) {
  const nowIso =
    options.now instanceof Date ? options.now.toISOString() : options.now ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const selfPerson = options.selfPerson ?? null;
  const selfId = selfPerson?.id ?? null;
  const selfRef = selfPerson
    ? selfPerson.ref ??
      formatEntityRef({ namespace: 'shared', kind: 'person', id: selfPerson.id })
    : null;

  const warmthLookup = (personId) => {
    const src = options.personWarmthById;
    if (!src) return null;
    if (typeof src.get === 'function') return src.get(personId) ?? null;
    return src[personId] ?? null;
  };

  const extraFirstLink = (personId) => {
    const src = options.personExtraFirstLinkAt;
    if (!src) return null;
    if (typeof src.get === 'function') return src.get(personId) ?? null;
    return src[personId] ?? null;
  };

  const organisations = [];
  let totalPeople = new Set();

  for (const { organisation, relationships } of orgsWithRelationships ?? []) {
    if (!organisation) continue;
    if (
      organisation.lifecycle_status === 'deleted' ||
      organisation.lifecycle_status === 'deidentified'
    ) {
      continue;
    }

    const ref =
      organisation.ref ??
      formatEntityRef({ namespace: 'shared', kind: 'organisation', id: organisation.id });

    const chips = deriveOrganisationChips(relationships, { selfPersonRef: selfRef, nowMs });

    const peopleMap = new Map();
    const PERSON_TYPES = new Set([
      'employee_at',
      'member_of',
      'studied_at',
      'placement_at'
    ]);

    let youStartedAt = null;

    for (const entry of relationships ?? []) {
      const { link, endpoint } = entry;
      if (!link || !endpoint || endpoint.kind !== 'person') continue;
      if (!PERSON_TYPES.has(link.relationship_type)) continue;
      const personId = endpoint.ref?.split(':')[2];
      if (!personId) continue;
      totalPeople.add(personId);

      const fromPeople = warmthLookup(personId);
      let warmthBand;
      let warmthScore;
      if (fromPeople) {
        warmthBand = fromPeople.band;
        warmthScore = fromPeople.score;
      } else {
        // Fallback when People index not supplied (unit fixtures). Prefer
        // full-person path via personWarmthById in production (A2).
        const touchpoints = touchpointsFromOverview({
          relationships: [entry],
          timeline: [],
          linkedRecords: {}
        });
        const warmthResult = warmthFor({
          touchpoints,
          relationships: [entry],
          personCreatedAt: null,
          now: nowIso
        });
        warmthBand = warmthResult.band;
        warmthScore = warmthResult.score;
      }

      const firstLinkAt = realFirstLinkAt(link, extraFirstLink(personId));
      if (
        selfRef &&
        endpoint.ref === selfRef &&
        firstLinkAt &&
        (link.relationship_type === 'employee_at' ||
          link.relationship_type === 'studied_at' ||
          link.relationship_type === 'placement_at' ||
          link.relationship_type === 'member_of')
      ) {
        if (!youStartedAt || Date.parse(firstLinkAt) < Date.parse(youStartedAt)) {
          youStartedAt = firstLinkAt;
        }
      }

      const existing = peopleMap.get(personId);
      if (!existing) {
        peopleMap.set(personId, {
          id: personId,
          display_name: endpoint.display_label ?? 'Person',
          warmth_band: warmthBand,
          warmth: warmthScore,
          first_link_at: firstLinkAt
        });
      } else {
        const order = { warm: 0, cooling: 1, cold: 2 };
        if (order[warmthBand] < order[existing.warmth_band]) {
          existing.warmth_band = warmthBand;
          existing.warmth = warmthScore;
        }
        if (
          firstLinkAt &&
          (!existing.first_link_at || Date.parse(firstLinkAt) < Date.parse(existing.first_link_at))
        ) {
          existing.first_link_at = firstLinkAt;
        }
      }
    }

    // Self person is not in People warmth map (people-directory skips is_self).
    // Keep them in the people list for counts; band stays cold unless dated work.
    if (selfId && selfRef) {
      // already added via employee_at etc. if linked
    }

    const people = [...peopleMap.values()];
    const warmthSpread = { warm: 0, cooling: 0, cold: 0, total: people.length };
    for (const p of people) {
      warmthSpread[p.warmth_band] += 1;
    }

    const undatedPeopleCount = people.filter((p) => !p.first_link_at).length;
    const peopleSteps = people
      .filter((p) => p.first_link_at)
      .sort((a, b) => Date.parse(a.first_link_at) - Date.parse(b.first_link_at));
    const seen = new Set();
    const arcPoints = [];
    for (const p of peopleSteps) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      // No per-point label (A1) — spark uses cumulative count from order.
      arcPoints.push({ id: p.id, at: p.first_link_at });
    }

    const isCurrentWorkplace = chips.some((c) => c.kind === 'workplace');

    // A8: earliest real person date, or null when everyone is undated.
    const firstTouchAt = peopleSteps[0]?.first_link_at ?? null;
    const otherDated = peopleSteps.filter((p) => p.id !== selfId);
    let firstTouchKind = null;
    if (otherDated.length > 0) {
      firstTouchKind = 'first_contact';
    } else if (youStartedAt) {
      firstTouchKind = 'you_started';
    } else if (firstTouchAt) {
      firstTouchKind = 'first_contact';
    }

    const timelineLanes = [];
    for (const entry of relationships ?? []) {
      const { link, endpoint } = entry;
      if (!link) continue;
      if (
        selfRef &&
        endpoint?.kind === 'person' &&
        endpoint.ref === selfRef &&
        (link.relationship_type === 'employee_at' ||
          link.relationship_type === 'studied_at' ||
          link.relationship_type === 'placement_at' ||
          link.relationship_type === 'member_of')
      ) {
        timelineLanes.push({
          id: link.id,
          kind: link.relationship_type === 'member_of' ? 'roles' : 'work_study',
          label: link.role || link.relationship_type.replace(/_/g, ' '),
          start: link.valid_from || organisation.created_at || nowIso,
          end: link.valid_to || null
        });
      }
      if (
        (link.relationship_type === 'venue' || link.relationship_type === 'provider') &&
        endpoint?.kind === 'event'
      ) {
        const at = link.occurred_at || link.valid_from || null;
        if (at) {
          timelineLanes.push({
            id: link.id,
            kind: 'events',
            label: endpoint.display_label || 'Event',
            start: at,
            end: null
          });
        }
      }
    }

    const displayName =
      cleanIdentityDisplayName(organisation.display_name) || organisation.display_name;

    organisations.push({
      id: organisation.id,
      ref,
      display_name: displayName,
      legal_name: organisation.legal_name ?? null,
      logo_key: organisation.logo_key ?? null,
      monogram: orgMonogram(displayName),
      chips,
      people_count: people.length,
      people,
      undated_people_count: undatedPeopleCount,
      warmth_spread: warmthSpread,
      arc_points: arcPoints,
      is_current_workplace: isCurrentWorkplace,
      first_touch_at: firstTouchKind === 'you_started' ? youStartedAt : firstTouchAt,
      first_touch_kind: firstTouchKind,
      you_started_at: youStartedAt,
      last_activity_at: organisation.updated_at ?? nowIso,
      timeline_lanes: timelineLanes,
      created_at: organisation.created_at,
      updated_at: organisation.updated_at
    });
  }

  organisations.sort((a, b) => {
    if (a.is_current_workplace !== b.is_current_workplace) {
      return a.is_current_workplace ? -1 : 1;
    }
    return (b.people_count || 0) - (a.people_count || 0);
  });

  return {
    organisations,
    counts: {
      organisations: organisations.length,
      people: totalPeople.size
    }
  };
}

export { yearSpan, monthYear, orgMonogram, isCurrentLink };
