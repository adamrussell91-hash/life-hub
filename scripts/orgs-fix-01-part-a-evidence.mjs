/**
 * Fix 01 Part A — assemble real org directory from life-hub-data
 * (same rules as github-professional-data + assembleOrganisationsDirectory).
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  assembleOrganisationsDirectory,
  buildPersonWarmthById
} from '../netlify/functions/_shared/organisations-directory.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = '/agent/repos/life-hub-data/data/professional';
const OUT = join(
  __dirname,
  '../docs/professional-hub/organisations-redesign/screens/fix-01'
);
const ARTIFACTS = '/opt/cursor/artifacts/organisations-fix-01';

const LEGACY_IMPORT_TIMESTAMP = '2026-09-15T00:00:00.000Z';

function deriveIdentityId(prefix, legacyId) {
  const digest = createHash('sha256').update(`${prefix}:${legacyId}`).digest('hex').slice(0, 32);
  const grouped = [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32)
  ];
  return `${prefix}_${grouped.join('-')}`;
}

function loadJson(name) {
  return JSON.parse(readFileSync(join(DATA, name), 'utf8'));
}

function formatRef(kind, id) {
  return `shared:${kind}:${id}`;
}

const rawOrgs = loadJson('organisations.json');
const rawPeople = loadJson('people.json');
const rawRels = loadJson('relationships.json');

const orgs = rawOrgs.map((o) => {
  const id = deriveIdentityId('organisation', o.legacy_id);
  return {
    ...o,
    id,
    ref: formatRef('organisation', id),
    lifecycle_status: 'active',
    created_at: LEGACY_IMPORT_TIMESTAMP,
    updated_at: LEGACY_IMPORT_TIMESTAMP
  };
});
const orgByLegacy = new Map(orgs.map((o) => [o.legacy_id, o]));

const people = rawPeople.map((p) => {
  const id = deriveIdentityId('person', p.legacy_id);
  return {
    ...p,
    id,
    ref: formatRef('person', id),
    lifecycle_status: 'active',
    created_at: LEGACY_IMPORT_TIMESTAMP,
    updated_at: LEGACY_IMPORT_TIMESTAMP
  };
});
const peopleByLegacy = new Map(people.map((p) => [p.legacy_id, p]));

const self = people.find((p) => p.is_self) ?? people.find((p) => /adam russell/i.test(p.display_name));

const byOrg = new Map(orgs.map((o) => [o.id, { organisation: o, relationships: [] }]));
const byPerson = new Map(
  people
    .filter((p) => !p.is_self)
    .map((p) => [p.id, { person: p, relationships: [] }])
);

for (const raw of rawRels) {
  const type = raw.relationship_type;
  if (type !== 'employee_at' && type !== 'member_of') continue;
  const person = peopleByLegacy.get(raw.person_legacy_id);
  const org = orgByLegacy.get(raw.organisation_legacy_id);
  if (!person || !org) continue;
  const digest = createHash('sha256')
    .update(
      [
        raw.person_legacy_id,
        raw.organisation_legacy_id,
        type,
        raw.valid_from ?? '',
        raw.role ?? ''
      ].join('|')
    )
    .digest('hex');
  const link = {
    id: `ul_${digest}`,
    relationship_type: type,
    status: raw.valid_to ? 'ended' : 'current',
    valid_from: raw.valid_from ?? null,
    valid_to: raw.valid_to ?? null,
    occurred_at: null,
    role: raw.role ?? null,
    created_at: LEGACY_IMPORT_TIMESTAMP
  };
  byOrg.get(org.id).relationships.push({
    link,
    endpoint: {
      kind: 'person',
      ref: person.ref,
      display_label: person.display_name
    },
    direction: 'incoming'
  });
  const prow = byPerson.get(person.id);
  if (prow) {
    prow.relationships.push({
      link,
      endpoint: {
        kind: 'organisation',
        ref: org.ref,
        display_label: org.display_name
      },
      direction: 'outgoing'
    });
  }
}

const now = new Date().toISOString();
const warmth = buildPersonWarmthById([...byPerson.values()], now);
const directory = assembleOrganisationsDirectory([...byOrg.values()], {
  now,
  selfPerson: self ? { id: self.id, ref: self.ref, is_self: true } : null,
  personWarmthById: warmth
});

const aloysius = directory.organisations.find((o) => /aloysius/i.test(o.display_name));
const trinity = directory.organisations.find((o) => /trinity/i.test(o.display_name));
const halt = directory.organisations.find((o) => /halt/i.test(o.display_name));

mkdirSync(OUT, { recursive: true });
mkdirSync(ARTIFACTS, { recursive: true });

const summary = {
  counts: directory.counts,
  self: self && { id: self.id, name: self.display_name },
  aloysius: aloysius && {
    id: aloysius.id,
    people_count: aloysius.people_count,
    undated_people_count: aloysius.undated_people_count,
    warmth_spread: aloysius.warmth_spread,
    arc_points_len: aloysius.arc_points.length,
    arc_points: aloysius.arc_points,
    first_touch_at: aloysius.first_touch_at,
    first_touch_kind: aloysius.first_touch_kind,
    you_started_at: aloysius.you_started_at,
    chips: aloysius.chips,
    timeline_lanes: aloysius.timeline_lanes
  },
  trinity: trinity && {
    id: trinity.id,
    people_count: trinity.people_count,
    undated_people_count: trinity.undated_people_count,
    warmth_spread: trinity.warmth_spread,
    arc_points_len: trinity.arc_points.length,
    first_touch_at: trinity.first_touch_at,
    first_touch_kind: trinity.first_touch_kind,
    chips: trinity.chips
  },
  halt: halt && { name: halt.display_name, chips: halt.chips }
};

writeFileSync(join(ARTIFACTS, 'part-a-real-directory.json'), JSON.stringify(summary, null, 2));
writeFileSync(join(OUT, 'part-a-real-directory.json'), JSON.stringify(summary, null, 2));

// Full rows for screenshot HTML
writeFileSync(
  join(ARTIFACTS, 'part-a-directory-rows.json'),
  JSON.stringify(
    {
      aloysius,
      trinity,
      halt,
      now
    },
    null,
    2
  )
);

console.log(JSON.stringify(summary, null, 2));
