/**
 * Stage 1 — deterministic candidate pairs (pure). TIE-INFERENCE-BRIEF.
 */

import { TIE_DECLINED_REPROPOSE_FACTOR, TIE_RECORD_PEOPLE_CAP } from './constants.mjs';
import { sameSentenceNames } from './name-match.mjs';

/**
 * Sort two person refs into a stable unordered pair key.
 * @param {string} a
 * @param {string} b
 */
export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function pairRefs(key) {
  const [a, b] = String(key).split('|');
  return [a, b];
}

/**
 * @typedef {{ people: string[], how: string, record_ref: string, date?: string|null, text?: string, same_sentence?: boolean }} EvidenceItem
 * @typedef {{ ref: string, display_name: string, aliases?: string[], is_self?: boolean, org_refs?: string[], link_count?: number }} RosterPerson
 */

/**
 * Aggregate evidence into candidate pairs.
 *
 * @param {object} input
 * @param {EvidenceItem[]} input.evidence
 * @param {RosterPerson[]} input.roster — visible adults only
 * @param {string|null} [input.selfRef]
 * @param {Set<string>} [input.existingPairKeys] — already have professional_relationship
 * @param {Map<string, { count: number }>} [input.declinedPairs] — pairKey → { count at decline }
 * @param {number} [input.peopleCap]
 */
export function buildCandidatePairs(input) {
  const rosterByRef = new Map((input.roster ?? []).map((p) => [p.ref, p]));
  const selfRef = input.selfRef ?? null;
  const existing = input.existingPairKeys ?? new Set();
  const declined = input.declinedPairs ?? new Map();
  const peopleCap = input.peopleCap ?? TIE_RECORD_PEOPLE_CAP;

  /** @type {Map<string, object>} */
  const aggregates = new Map();
  let skippedTooLarge = 0;
  let skippedSelfOnly = 0;

  for (const item of input.evidence ?? []) {
    if (!item || !Array.isArray(item.people)) continue;
    let people = [...new Set(item.people.filter((r) => typeof r === 'string' && r))];
    if (selfRef) people = people.filter((r) => r !== selfRef);
    people = people.filter((r) => rosterByRef.has(r));
    if (people.length < 2) {
      skippedSelfOnly += 1;
      continue;
    }
    if (people.length > peopleCap) {
      skippedTooLarge += 1;
      continue;
    }

    const date = item.date ?? null;
    const how = item.how ?? 'named';
    const record_ref = item.record_ref ?? null;
    if (!record_ref) continue;

    // Unordered pairs within the item
    for (let i = 0; i < people.length; i += 1) {
      for (let j = i + 1; j < people.length; j += 1) {
        const a = people[i];
        const b = people[j];
        const key = pairKey(a, b);
        let agg = aggregates.get(key);
        if (!agg) {
          const personA = rosterByRef.get(a);
          const personB = rosterByRef.get(b);
          const shared_org_refs = [...new Set(
            (personA?.org_refs ?? []).filter((o) => (personB?.org_refs ?? []).includes(o))
          )];
          agg = {
            pair: a < b ? [a, b] : [b, a],
            records: [],
            record_keys: new Set(),
            count: 0,
            first_date: null,
            last_date: null,
            shared_org_refs,
            hows: new Set(),
            sources: new Set(),
            same_sentence: false,
            profile_mentions: false,
            texts: []
          };
          aggregates.set(key, agg);
        }

        const recordKey = `${record_ref}|${how}`;
        if (!agg.record_keys.has(recordKey)) {
          agg.record_keys.add(recordKey);
          agg.records.push({
            ref: record_ref,
            kind: how,
            date,
            how,
            text: typeof item.text === 'string' ? item.text : ''
          });
          agg.count += 1;
          agg.hows.add(how);
          const sourceId = sourceIdFromHow(how, record_ref);
          if (sourceId) agg.sources.add(sourceId);
        }

        if (how === 'profile_mentions') agg.profile_mentions = true;
        if (how === 'shared_org') {
          /* context only — never alone makes a candidate */
        }
        if (item.same_sentence === true) agg.same_sentence = true;
        else if (item.text && !agg.same_sentence) {
          const personA = rosterByRef.get(a);
          const personB = rosterByRef.get(b);
          if (personA && personB && sameSentenceNames(item.text, personA, personB)) {
            agg.same_sentence = true;
          }
        }

        if (date) {
          if (!agg.first_date || date < agg.first_date) agg.first_date = date;
          if (!agg.last_date || date > agg.last_date) agg.last_date = date;
        }
        if (item.text && agg.texts.length < 12) {
          agg.texts.push({ ref: record_ref, how, date, text: item.text });
        }
      }
    }
  }

  const candidates = [];
  const skipped = {
    already_linked: 0,
    declined: 0,
    not_in_roster: 0,
    shared_org_only: 0,
    below_threshold: 0,
    too_large_records: skippedTooLarge
  };

  const byRule = {
    count_ge_2: 0,
    same_sentence: 0,
    profile_mentions: 0
  };
  const sourceSpread = { one: 0, two: 0, three_plus: 0 };

  for (const [key, agg] of aggregates) {
    const [refA, refB] = agg.pair;
    if (!rosterByRef.has(refA) || !rosterByRef.has(refB)) {
      skipped.not_in_roster += 1;
      continue;
    }
    if (existing.has(key)) {
      skipped.already_linked += 1;
      continue;
    }

    const declinedMeta = declined.get(key);
    if (declinedMeta) {
      const declinedCount = Number(declinedMeta.count) || 0;
      if (agg.count < declinedCount * TIE_DECLINED_REPROPOSE_FACTOR) {
        skipped.declined += 1;
        continue;
      }
    }

    // Strip shared_org-only evidence for candidacy test
    const nonOrgRecords = agg.records.filter((r) => r.how !== 'shared_org');
    const nonOrgCount = nonOrgRecords.length;
    const howsWithoutOrg = new Set(nonOrgRecords.map((r) => r.how));

    const byCount = nonOrgCount >= 2;
    const bySentence = agg.same_sentence === true && nonOrgCount >= 1;
    const byProfile = howsWithoutOrg.has('profile_mentions');

    if (!byCount && !bySentence && !byProfile) {
      if (agg.records.every((r) => r.how === 'shared_org') && agg.records.length > 0) {
        skipped.shared_org_only += 1;
      } else {
        skipped.below_threshold += 1;
      }
      continue;
    }

    if (byCount) byRule.count_ge_2 += 1;
    if (bySentence) byRule.same_sentence += 1;
    if (byProfile) byRule.profile_mentions += 1;

    const sourceCount = new Set(
      nonOrgRecords.map((r) => sourceIdFromHow(r.how, r.ref)).filter(Boolean)
    ).size;
    if (sourceCount <= 1) sourceSpread.one += 1;
    else if (sourceCount === 2) sourceSpread.two += 1;
    else sourceSpread.three_plus += 1;

    candidates.push({
      pair: agg.pair,
      pair_key: key,
      records: nonOrgRecords.length ? nonOrgRecords : agg.records,
      count: nonOrgCount || agg.count,
      first_date: agg.first_date,
      last_date: agg.last_date,
      shared_org_refs: agg.shared_org_refs,
      hows: [...howsWithoutOrg.size ? howsWithoutOrg : agg.hows],
      sources: [...agg.sources],
      same_sentence: agg.same_sentence,
      profile_mentions: agg.profile_mentions,
      texts: agg.texts,
      rules: { byCount, bySentence, byProfile }
    });
  }

  // Strongest evidence first (count desc, then last_date desc)
  candidates.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return String(b.last_date ?? '').localeCompare(String(a.last_date ?? ''));
  });

  return {
    candidates,
    aggregates_size: aggregates.size,
    skipped,
    by_rule: byRule,
    source_spread: sourceSpread
  };
}

function sourceIdFromHow(how, recordRef) {
  if (how === 'profile_mentions') return 'profiles';
  if (how === 'shared_org') return 'organisations';
  if (how === 'co_recipient' || how === 'recipient_about') return 'comms';
  if (how === 'co_attendee' && String(recordRef).includes(':meeting:')) return 'meetings';
  if (how === 'co_attendee' && String(recordRef).includes(':event:')) return 'events';
  if (how === 'co_thread') return 'threads';
  if (how === 'co_referee') return 'applications';
  if (how === 'named') {
    const ref = String(recordRef);
    if (ref.includes(':communication:')) return 'comms';
    if (ref.includes(':meeting:')) return 'meetings';
    if (ref.includes(':event:')) return 'events';
    if (ref.includes('tasks:')) return 'tasks';
    if (ref.includes('knowledge:') || ref.includes(':page:')) return 'knowledge';
    if (ref.includes('ledger') || ref.includes('promise')) return 'promises';
    return 'named';
  }
  return how || null;
}
