/**
 * Compare bridges — pure (BUILD-PLAN Phase 7).
 *
 * Candidates:
 * - moved: employee_at in both organisations
 * - know_each_other: professional_relationship between a person in each
 * - met_at_event: shared attendee on one event
 *
 * Useful-link rule: show only if at least one of:
 * 1. far end cold/never met, near end warm (route in)
 * 2. either end tied to an open opportunity at either organisation
 * 3. Adam's own move and an upcoming event includes cold former colleagues
 *
 * Everything else counts as hidden ("N more hidden").
 */

const WARM_BANDS = new Set(['warm']);
const COLD_OR_UNKNOWN = new Set(['cold', 'never_met', null, undefined, '']);

function personId(refOrId) {
  if (!refOrId) return null;
  if (typeof refOrId !== 'string') return null;
  if (refOrId.startsWith('shared:person:')) return refOrId.slice('shared:person:'.length);
  return refOrId;
}

function warmthOf(person, warmthByPerson = {}) {
  const id = personId(person?.id || person?.person_id || person?.ref || person);
  if (!id) return null;
  return warmthByPerson[id] ?? person?.warmth_band ?? person?.warmth ?? null;
}

function isWarm(band) {
  return WARM_BANDS.has(band);
}

function isColdOrNeverMet(band) {
  return COLD_OR_UNKNOWN.has(band) || band === 'never_met';
}

/**
 * Build bridge candidates from two (or three) organisation people/link sets.
 *
 * @param {object} input
 * @param {object} input.orgA { ref, people: [{id, warmth_band?}], employeeIds?: Set|string[] }
 * @param {object} input.orgB same shape
 * @param {object} [input.orgC] optional third
 * @param {Array} [input.professionalRelationships] { source_ref|source_id, target_ref|target_id }
 * @param {Array} [input.sharedEventAttendances] { event_ref, event_title?, person_ids: string[], starts_at? }
 * @param {object} [input.warmthByPerson] id → band
 * @param {string|null} [input.selfPersonId] Adam
 * @param {Array} [input.openOpportunityPersonIds] person ids tied to open opps at either org
 * @param {Array} [input.upcomingEvents] { event_ref, person_ids, starts_at }
 */
export function findBridgeCandidates(input = {}) {
  const orgs = [input.orgA, input.orgB, input.orgC].filter(Boolean);
  if (orgs.length < 2) return [];

  const warmthByPerson = input.warmthByPerson ?? {};
  const candidates = [];
  const seen = new Set();

  function push(candidate) {
    const key = [
      candidate.kind,
      candidate.person_a_id,
      candidate.person_b_id || '',
      candidate.org_a_ref,
      candidate.org_b_ref,
      candidate.event_ref || ''
    ].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  }

  function employeeIdSet(org) {
    if (org.employeeIds) {
      return new Set([...org.employeeIds].map(personId).filter(Boolean));
    }
    return new Set(
      (org.people ?? [])
        .filter((p) => p.employee_at !== false)
        .map((p) => personId(p.id || p))
        .filter(Boolean)
    );
  }

  // moved: same person employee_at in both orgs
  for (let i = 0; i < orgs.length; i += 1) {
    for (let j = i + 1; j < orgs.length; j += 1) {
      const a = orgs[i];
      const b = orgs[j];
      const aSet = employeeIdSet(a);
      const bSet = employeeIdSet(b);
      for (const id of aSet) {
        if (!bSet.has(id)) continue;
        push({
          kind: 'moved',
          person_a_id: id,
          person_b_id: id,
          org_a_ref: a.ref,
          org_b_ref: b.ref,
          display_name:
            (a.people ?? []).find((p) => personId(p.id) === id)?.display_name ||
            (b.people ?? []).find((p) => personId(p.id) === id)?.display_name ||
            null
        });
      }
    }
  }

  // know_each_other: professional_relationship across orgs
  const peopleByOrg = orgs.map((org) => ({
    ref: org.ref,
    ids: new Set((org.people ?? []).map((p) => personId(p.id || p)).filter(Boolean))
  }));

  for (const rel of input.professionalRelationships ?? []) {
    const source = personId(rel.source_ref || rel.source_id || rel.a);
    const target = personId(rel.target_ref || rel.target_id || rel.b);
    if (!source || !target) continue;
    for (let i = 0; i < peopleByOrg.length; i += 1) {
      for (let j = i + 1; j < peopleByOrg.length; j += 1) {
        const inI = peopleByOrg[i].ids.has(source) && peopleByOrg[j].ids.has(target);
        const inJ = peopleByOrg[j].ids.has(source) && peopleByOrg[i].ids.has(target);
        if (!inI && !inJ) continue;
        const personA = inI ? source : target;
        const personB = inI ? target : source;
        push({
          kind: 'know_each_other',
          person_a_id: personA,
          person_b_id: personB,
          org_a_ref: peopleByOrg[i].ref,
          org_b_ref: peopleByOrg[j].ref,
          relationship_role: rel.role ?? null
        });
      }
    }
  }

  // met_at_event: shared attendee
  for (const event of input.sharedEventAttendances ?? []) {
    const attendees = (event.person_ids ?? []).map(personId).filter(Boolean);
    for (let i = 0; i < peopleByOrg.length; i += 1) {
      for (let j = i + 1; j < peopleByOrg.length; j += 1) {
        const fromA = attendees.filter((id) => peopleByOrg[i].ids.has(id));
        const fromB = attendees.filter((id) => peopleByOrg[j].ids.has(id));
        for (const personA of fromA) {
          for (const personB of fromB) {
            if (personA === personB) continue;
            push({
              kind: 'met_at_event',
              person_a_id: personA,
              person_b_id: personB,
              org_a_ref: peopleByOrg[i].ref,
              org_b_ref: peopleByOrg[j].ref,
              event_ref: event.event_ref ?? null,
              event_title: event.event_title ?? null
            });
          }
        }
      }
    }
  }

  // Attach warmth for rule evaluation
  for (const c of candidates) {
    c.warmth_a = warmthByPerson[c.person_a_id] ?? null;
    c.warmth_b = c.person_b_id ? warmthByPerson[c.person_b_id] ?? null : c.warmth_a;
  }

  return candidates;
}

/**
 * Useful-link rule. Returns { useful: boolean, rule: 1|2|3|null, reason }.
 */
export function evaluateUsefulLink(candidate, options = {}) {
  const {
    warmthByPerson = {},
    selfPersonId = null,
    openOpportunityPersonIds = [],
    upcomingEvents = [],
    nearOrgRef = null
  } = options;

  const oppSet = new Set((openOpportunityPersonIds ?? []).map(personId).filter(Boolean));
  const selfId = personId(selfPersonId);
  const warmthA = candidate.warmth_a ?? warmthByPerson[candidate.person_a_id] ?? null;
  const warmthB = candidate.warmth_b ?? warmthByPerson[candidate.person_b_id] ?? null;

  // Orient near/far relative to nearOrgRef when provided.
  let nearId = candidate.person_a_id;
  let farId = candidate.person_b_id;
  let nearWarmth = warmthA;
  let farWarmth = warmthB;
  if (nearOrgRef && candidate.org_b_ref === nearOrgRef) {
    nearId = candidate.person_b_id;
    farId = candidate.person_a_id;
    nearWarmth = warmthB;
    farWarmth = warmthA;
  }

  // Rule 1: far cold/never met, near warm — a route in
  if (isWarm(nearWarmth) && isColdOrNeverMet(farWarmth) && nearId !== farId) {
    const name = options.displayNames?.[nearId] || 'Someone you know';
    const farName = options.displayNames?.[farId] || 'a cold contact';
    return {
      useful: true,
      rule: 1,
      reason: `${name} is your warmest way back to ${farName}, not you.`
    };
  }

  // Rule 2: either end tied to an open opportunity
  if (oppSet.has(candidate.person_a_id) || (candidate.person_b_id && oppSet.has(candidate.person_b_id))) {
    return {
      useful: true,
      rule: 2,
      reason: 'Tied to an open opportunity at one of these organisations.'
    };
  }

  // Rule 3: Adam's own move + upcoming event with cold former colleagues
  if (
    candidate.kind === 'moved' &&
    selfId &&
    candidate.person_a_id === selfId
  ) {
    const nowMs = Date.parse(options.now ?? new Date().toISOString()) || Date.now();
    for (const event of upcomingEvents ?? []) {
      const start = event.starts_at ? Date.parse(event.starts_at) : NaN;
      if (Number.isFinite(start) && start < nowMs) continue;
      const attendees = (event.person_ids ?? []).map(personId);
      const coldFormer = attendees.filter((id) => {
        if (id === selfId) return false;
        const band = warmthByPerson[id] ?? null;
        return isColdOrNeverMet(band);
      });
      if (coldFormer.length) {
        return {
          useful: true,
          rule: 3,
          reason: 'Your move, and an upcoming event includes cold former colleagues.'
        };
      }
    }
  }

  return { useful: false, rule: null, reason: null };
}

/**
 * Partition candidates into shown (with numbered reasons) and hidden count.
 */
export function selectUsefulBridges(candidates, options = {}) {
  const shown = [];
  let hidden = 0;
  let number = 1;
  for (const candidate of candidates) {
    const verdict = evaluateUsefulLink(candidate, options);
    if (verdict.useful) {
      shown.push({
        ...candidate,
        number,
        rule: verdict.rule,
        reason: verdict.reason
      });
      number += 1;
    } else {
      hidden += 1;
    }
  }
  return {
    bridges: shown,
    hidden_count: hidden,
    hidden_label: hidden > 0 ? `${hidden} more hidden` : null
  };
}

/** Convenience: find → evaluate → number in one call. */
export function buildOrgBridges(input = {}) {
  const candidates = findBridgeCandidates(input);
  return selectUsefulBridges(candidates, {
    warmthByPerson: input.warmthByPerson,
    selfPersonId: input.selfPersonId,
    openOpportunityPersonIds: input.openOpportunityPersonIds,
    upcomingEvents: input.upcomingEvents,
    nearOrgRef: input.nearOrgRef,
    displayNames: input.displayNames,
    now: input.now
  });
}
