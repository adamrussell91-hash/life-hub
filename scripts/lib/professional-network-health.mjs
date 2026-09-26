/**
 * Read-only health report for Professional network JSON
 * (`people.json`, `organisations.json`, `relationships.json`).
 *
 * Never writes. Used by `scripts/professional-network-health.mjs`.
 */

import { nameKey } from './professional-people-import.mjs';

const ORG_LINK_TYPES = new Set(['employee_at', 'member_of']);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isIsoDateOrNull(value) {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function parseLastContacted(value) {
  if (value === null || value === undefined || value === '') {
    return { kind: 'empty' };
  }
  if (typeof value !== 'string') {
    return { kind: 'unparseable', raw: String(value) };
  }
  const trimmed = value.trim();
  if (!trimmed) return { kind: 'empty' };
  // Prefer ISO YYYY-MM-DD; also accept Date-parseable free text.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const t = Date.parse(trimmed);
    if (!Number.isNaN(t)) return { kind: 'date', iso: trimmed };
  }
  const t = Date.parse(trimmed);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return { kind: 'date', iso };
  }
  return { kind: 'unparseable', raw: trimmed };
}

function orgNameKeys(org) {
  const keys = new Set();
  if (isNonEmptyString(org.display_name)) keys.add(nameKey(org.display_name));
  for (const alias of Array.isArray(org.aliases) ? org.aliases : []) {
    if (isNonEmptyString(alias)) keys.add(nameKey(alias));
  }
  return keys;
}

/** Strip trailing Notion URL parentheticals from workplace export text. */
function workplaceLabel(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  // "Name (https://...)" or "Name (https://...), Other (https://...)"
  return text
    .split(',')
    .map((part) => part.replace(/\s*\(https?:\/\/[^)]+\)\s*$/i, '').trim())
    .filter(Boolean)
    .join(', ');
}

function workplaceSegments(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  // Split on "), " between multiple workplace URLs, else treat as one.
  if (/\(https?:\/\//i.test(text) && text.includes('),')) {
    return text.split(/\),\s*/).map((part) => {
      const withParen = part.endsWith(')') ? part : `${part})`;
      return workplaceLabel(withParen);
    }).filter(Boolean);
  }
  const label = workplaceLabel(text);
  return label ? [label] : [];
}

function classifyDroppedRelationship(row, peopleLegacyIds, orgLegacyIds) {
  if (!row || typeof row !== 'object') {
    return { reason: 'not_an_object' };
  }
  const type = row.relationship_type;
  if (type === 'professional_relationship') {
    if (!isNonEmptyString(row.person_legacy_id) || !peopleLegacyIds.has(row.person_legacy_id)) {
      return { reason: 'unknown_person_legacy_id', person_legacy_id: row.person_legacy_id ?? null };
    }
    if (!isNonEmptyString(row.other_person_legacy_id) || !peopleLegacyIds.has(row.other_person_legacy_id)) {
      return { reason: 'unknown_other_person_legacy_id', other_person_legacy_id: row.other_person_legacy_id ?? null };
    }
    if (row.role !== null && row.role !== undefined && typeof row.role !== 'string') {
      return { reason: 'bad_role' };
    }
    if (!isIsoDateOrNull(row.valid_from) || !isIsoDateOrNull(row.valid_to)) {
      return { reason: 'bad_date', valid_from: row.valid_from ?? null, valid_to: row.valid_to ?? null };
    }
    return null;
  }
  if (!ORG_LINK_TYPES.has(type)) {
    return { reason: 'unknown_type', relationship_type: type ?? null };
  }
  if (!isNonEmptyString(row.person_legacy_id) || !peopleLegacyIds.has(row.person_legacy_id)) {
    return { reason: 'unknown_person_legacy_id', person_legacy_id: row.person_legacy_id ?? null };
  }
  if (!isNonEmptyString(row.organisation_legacy_id) || !orgLegacyIds.has(row.organisation_legacy_id)) {
    return { reason: 'unknown_organisation_legacy_id', organisation_legacy_id: row.organisation_legacy_id ?? null };
  }
  if (row.role !== null && row.role !== undefined && typeof row.role !== 'string') {
    return { reason: 'bad_role' };
  }
  if (!isIsoDateOrNull(row.valid_from) || !isIsoDateOrNull(row.valid_to)) {
    return { reason: 'bad_date', valid_from: row.valid_from ?? null, valid_to: row.valid_to ?? null };
  }
  return null;
}

/**
 * @param {{ people: unknown, organisations: unknown, relationships: unknown }} data
 * @returns {object} JSON-serialisable health report
 */
export function buildProfessionalNetworkHealthReport(data) {
  const people = Array.isArray(data?.people) ? data.people : [];
  const organisations = Array.isArray(data?.organisations) ? data.organisations : [];
  const relationships = Array.isArray(data?.relationships) ? data.relationships : [];

  const peopleLegacyIds = new Set(
    people.filter((p) => p && isNonEmptyString(p.legacy_id)).map((p) => p.legacy_id)
  );
  const orgLegacyIds = new Set(
    organisations.filter((o) => o && isNonEmptyString(o.legacy_id)).map((o) => o.legacy_id)
  );

  const relationshipsByType = {};
  for (const row of relationships) {
    const type = row?.relationship_type ?? '(missing)';
    relationshipsByType[type] = (relationshipsByType[type] ?? 0) + 1;
  }

  const linkedPeople = new Set();
  for (const row of relationships) {
    if (row && isNonEmptyString(row.person_legacy_id)) linkedPeople.add(row.person_legacy_id);
    if (row?.relationship_type === 'professional_relationship' && isNonEmptyString(row.other_person_legacy_id)) {
      linkedPeople.add(row.other_person_legacy_id);
    }
  }

  const zeroRelationshipPeople = people
    .filter((p) => p && isNonEmptyString(p.legacy_id) && !linkedPeople.has(p.legacy_id))
    .map((p) => p.display_name ?? p.legacy_id);

  const personHasOrgLink = new Set();
  for (const row of relationships) {
    if (!row || !ORG_LINK_TYPES.has(row.relationship_type)) continue;
    if (!isNonEmptyString(row.person_legacy_id)) continue;
    // Current links only (no valid_to), matching "current employee_at/member_of".
    if (row.valid_to) continue;
    personHasOrgLink.add(row.person_legacy_id);
  }

  const workplaceCounts = new Map();
  const workplaceTextNoLink = [];
  for (const person of people) {
    if (!person || !isNonEmptyString(person.legacy_id)) continue;
    const cw = person.professional_profile?.current_workplace;
    const texts = Array.isArray(cw) ? cw.filter((t) => typeof t === 'string' && t.trim()) : [];
    if (!texts.length) continue;
    if (personHasOrgLink.has(person.legacy_id)) continue;
    workplaceTextNoLink.push(person);
    for (const raw of texts) {
      for (const segment of workplaceSegments(raw)) {
        workplaceCounts.set(segment, (workplaceCounts.get(segment) ?? 0) + 1);
      }
      // Also count the raw string if segmentation failed to produce anything.
      if (!workplaceSegments(raw).length) {
        workplaceCounts.set(raw.trim(), (workplaceCounts.get(raw.trim()) ?? 0) + 1);
      }
    }
  }

  const orgKeys = new Map(); // nameKey -> display_name
  for (const org of organisations) {
    if (!org) continue;
    for (const key of orgNameKeys(org)) {
      if (!orgKeys.has(key)) orgKeys.set(key, org.display_name);
    }
  }

  const workplacesMatchingOrg = [];
  const workplacesMatchingNone = [];
  for (const [text, count] of [...workplaceCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    const key = nameKey(text);
    const matched = key && orgKeys.has(key) ? orgKeys.get(key) : null;
    const entry = { workplace: text, count, matched_organisation: matched };
    if (matched) workplacesMatchingOrg.push(entry);
    else workplacesMatchingNone.push(entry);
  }

  const dropped = [];
  for (const row of relationships) {
    // Rows the bridge keeps: employee_at/member_of with resolvable ids and
    // ok dates, plus professional_relationship with two resolvable people.
    if (
      row &&
      ORG_LINK_TYPES.has(row.relationship_type) &&
      peopleLegacyIds.has(row.person_legacy_id) &&
      orgLegacyIds.has(row.organisation_legacy_id) &&
      (row.role === null || row.role === undefined || typeof row.role === 'string') &&
      isIsoDateOrNull(row.valid_from) &&
      isIsoDateOrNull(row.valid_to)
    ) {
      continue;
    }
    if (
      row &&
      row.relationship_type === 'professional_relationship' &&
      peopleLegacyIds.has(row.person_legacy_id) &&
      peopleLegacyIds.has(row.other_person_legacy_id) &&
      (row.role === null || row.role === undefined || typeof row.role === 'string') &&
      isIsoDateOrNull(row.valid_from) &&
      isIsoDateOrNull(row.valid_to)
    ) {
      continue;
    }
    const why = classifyDroppedRelationship(row, peopleLegacyIds, orgLegacyIds);
    dropped.push({
      relationship_type: row?.relationship_type ?? null,
      person_legacy_id: row?.person_legacy_id ?? null,
      organisation_legacy_id: row?.organisation_legacy_id ?? null,
      other_person_legacy_id: row?.other_person_legacy_id ?? null,
      reason: why?.reason ?? 'unknown',
      detail: why
    });
  }

  const selfRows = people.filter((p) => p && p.is_self === true);
  const isSelf = {
    count: selfRows.length,
    name: selfRows.length === 1 ? (selfRows[0].display_name ?? null) : null
  };

  let lastEmpty = 0;
  let lastDate = 0;
  let lastUnparseable = 0;
  const unparseableExamples = [];
  for (const person of people) {
    const raw = person?.professional_profile?.last_contacted;
    const parsed = parseLastContacted(raw);
    if (parsed.kind === 'empty') lastEmpty += 1;
    else if (parsed.kind === 'date') lastDate += 1;
    else {
      lastUnparseable += 1;
      if (unparseableExamples.length < 10) {
        unparseableExamples.push({
          display_name: person?.display_name ?? null,
          last_contacted: parsed.raw
        });
      }
    }
  }

  return {
    counts: {
      people: people.length,
      organisations: organisations.length,
      relationships: relationships.length,
      relationships_by_type: relationshipsByType
    },
    people_with_zero_relationships: {
      count: zeroRelationshipPeople.length,
      sample_display_names: zeroRelationshipPeople.slice(0, 20)
    },
    workplace_text_without_org_link: {
      count: workplaceTextNoLink.length,
      distinct_workplaces: [...workplaceCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([workplace, count]) => ({ workplace, count })),
      matching_existing_organisation: workplacesMatchingOrg,
      matching_none: workplacesMatchingNone
    },
    relationships_bridge_would_drop: {
      count: dropped.length,
      rows: dropped
    },
    is_self: isSelf,
    last_contacted: {
      empty: lastEmpty,
      parse_as_date: lastDate,
      unparseable: lastUnparseable,
      unparseable_examples: unparseableExamples
    }
  };
}
