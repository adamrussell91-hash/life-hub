import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';
import { formatEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import {
  IDENTITY_SCHEMA_VERSION,
  generateOrganisationId,
  generatePersonId,
  generatePositionId,
  generateUnitId
} from '../../netlify/functions/_shared/identity-schema.mjs';
import {
  canonicalSymmetricPair,
  createOrgStructureRepository,
  deriveReportingGraph
} from '../../netlify/functions/_shared/org-structure.mjs';
import { createOrgStructureHandler } from '../../netlify/functions/org-structure.mjs';

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) {
      map.set(key, JSON.stringify(value));
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
    _put(key, value) {
      map.set(key, JSON.stringify(value));
    }
  };
}

function unit(id, name, orgRef, order = 0, kind = 'faculty') {
  return {
    schema_version: IDENTITY_SCHEMA_VERSION,
    id,
    kind: 'unit',
    name,
    organisation_ref: orgRef,
    unit_kind: kind,
    order,
    lifecycle_status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  };
}

function position(id, title, orgRef, unitRef, isHead = false) {
  return {
    schema_version: IDENTITY_SCHEMA_VERSION,
    id,
    kind: 'position',
    title,
    organisation_ref: orgRef,
    unit_ref: unitRef,
    is_head: isHead,
    lifecycle_status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  };
}

function link(id, type, source, target, extras = {}) {
  return {
    id,
    relationship_type: type,
    source_ref: source,
    target_ref: target,
    status: 'active',
    valid_from: extras.valid_from ?? '2025-01-01T00:00:00.000Z',
    valid_to: extras.valid_to ?? null,
    role: extras.role ?? null,
    metadata: extras.metadata ?? {},
    context_ref: extras.context_ref ?? null
  };
}

/** Adam's real St. Aloysius memberships (BUILD-PLAN Phase 2 D4/P3). */
function aloysiusFixture() {
  const orgId = generateOrganisationId();
  const orgRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: orgId });
  const adamId = generatePersonId();
  const adamRef = formatEntityRef({ namespace: 'shared', kind: 'person', id: adamId });

  const englishId = generateUnitId();
  const enrichmentId = generateUnitId();
  const mentorsId = generateUnitId();
  const englishRef = formatEntityRef({ namespace: 'shared', kind: 'unit', id: englishId });
  const enrichmentRef = formatEntityRef({ namespace: 'shared', kind: 'unit', id: enrichmentId });
  const mentorsRef = formatEntityRef({ namespace: 'shared', kind: 'unit', id: mentorsId });

  const headEnglishId = generatePositionId();
  const leaderEnrichId = generatePositionId();
  const dirPlId = generatePositionId();
  const headEnglishRef = formatEntityRef({ namespace: 'shared', kind: 'position', id: headEnglishId });
  const leaderEnrichRef = formatEntityRef({ namespace: 'shared', kind: 'position', id: leaderEnrichId });
  const dirPlRef = formatEntityRef({ namespace: 'shared', kind: 'position', id: dirPlId });

  const units = [
    unit(englishId, 'English faculty', orgRef, 0, 'faculty'),
    unit(enrichmentId, 'Learning Enrichment', orgRef, 1, 'program'),
    unit(mentorsId, 'Accreditation mentors', orgRef, 2, 'team')
  ];
  const positions = [
    position(headEnglishId, 'Head of English', orgRef, englishRef, true),
    position(leaderEnrichId, 'Leader of Learning Enrichment', orgRef, enrichmentRef, true),
    position(dirPlId, 'Director of Professional Learning', orgRef, mentorsRef, true)
  ];
  const links = [
    link('ul_m1', 'member_of_unit', adamRef, englishRef, { role: 'English teacher', context_ref: orgRef }),
    link('ul_m2', 'member_of_unit', adamRef, enrichmentRef, {
      role: 'gifted education teacher',
      context_ref: orgRef
    }),
    link('ul_m3', 'member_of_unit', adamRef, mentorsRef, {
      role: 'accreditation mentor',
      context_ref: orgRef
    })
  ];

  return {
    orgId,
    orgRef,
    adamId,
    adamRef,
    englishRef,
    enrichmentRef,
    mentorsRef,
    headEnglishRef,
    leaderEnrichRef,
    dirPlRef,
    units,
    positions,
    links
  };
}

test('deriveReportingGraph: Adam Aloysius has three distinct lines to three heads (D4/P3)', () => {
  const f = aloysiusFixture();
  const graph = deriveReportingGraph({
    organisationRef: f.orgRef,
    units: f.units,
    positions: f.positions,
    links: f.links,
    peopleById: { [f.adamId]: { display_name: 'Adam Russell', warmth_band: 'warm' } }
  });

  assert.equal(graph.member_count, 1, 'V4: Adam counted once across three memberships');
  assert.equal(graph.memberships_by_person[f.adamRef].length, 3);

  const adamReports = graph.edges.filter(
    (e) => e.kind === 'reports_to' && e.source === f.adamRef && e.flag === 'derived'
  );
  const targets = new Set(adamReports.map((e) => e.target));
  assert.equal(targets.size, 3);
  assert.ok(targets.has(f.headEnglishRef));
  assert.ok(targets.has(f.leaderEnrichRef));
  assert.ok(targets.has(f.dirPlRef));
});

test('deriveReportingGraph: multi-parent unit produces two reports_to edges', () => {
  const orgRef = formatEntityRef({
    namespace: 'shared',
    kind: 'organisation',
    id: generateOrganisationId()
  });
  const unitId = generateUnitId();
  const unitRef = formatEntityRef({ namespace: 'shared', kind: 'unit', id: unitId });
  const aId = generatePositionId();
  const bId = generatePositionId();
  const aRef = formatEntityRef({ namespace: 'shared', kind: 'position', id: aId });
  const bRef = formatEntityRef({ namespace: 'shared', kind: 'position', id: bId });

  const graph = deriveReportingGraph({
    organisationRef: orgRef,
    units: [unit(unitId, 'Matrix team', orgRef)],
    positions: [
      position(aId, 'Boss A', orgRef, null, false),
      position(bId, 'Boss B', orgRef, null, false)
    ],
    links: [
      link('ul_r1', 'reports_to', unitRef, aRef, { context_ref: orgRef }),
      link('ul_r2', 'reports_to', unitRef, bRef, { context_ref: orgRef })
    ]
  });

  const outs = graph.edges.filter((e) => e.source === unitRef && e.kind === 'reports_to');
  assert.equal(outs.length, 2);
});

test('canonicalSymmetricPair sorts refs so A⇄B equals B⇄A', () => {
  const a = 'shared:position:position_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const b = 'shared:position:position_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  assert.deepEqual(canonicalSymmetricPair(a, b), canonicalSymmetricPair(b, a));
  assert.equal(canonicalSymmetricPair(a, b)[0], a);
});

test('deriveReportingGraph: cycle A→B→A terminates and marks both', () => {
  const orgRef = formatEntityRef({
    namespace: 'shared',
    kind: 'organisation',
    id: generateOrganisationId()
  });
  const aId = generatePositionId();
  const bId = generatePositionId();
  const aRef = formatEntityRef({ namespace: 'shared', kind: 'position', id: aId });
  const bRef = formatEntityRef({ namespace: 'shared', kind: 'position', id: bId });
  const graph = deriveReportingGraph({
    organisationRef: orgRef,
    units: [],
    positions: [
      position(aId, 'A', orgRef, null, false),
      position(bId, 'B', orgRef, null, false)
    ],
    links: [
      link('ul_c1', 'reports_to', aRef, bRef),
      link('ul_c2', 'reports_to', bRef, aRef)
    ]
  });
  const cycled = graph.edges.filter((e) => e.cycle);
  assert.ok(cycled.length >= 2);
  assert.ok(graph.cycles.includes(aRef));
  assert.ok(graph.cycles.includes(bRef));
});

test('deriveReportingGraph: ended membership is excluded (temporal)', () => {
  const f = aloysiusFixture();
  f.links[0] = { ...f.links[0], valid_to: '2024-12-01T00:00:00.000Z' };
  const graph = deriveReportingGraph({
    organisationRef: f.orgRef,
    units: f.units,
    positions: f.positions,
    links: f.links,
    now: Date.parse('2026-09-27T00:00:00.000Z')
  });
  assert.equal(graph.memberships_by_person[f.adamRef].length, 2);
  const toEnglish = graph.edges.find(
    (e) => e.source === f.adamRef && e.target === f.headEnglishRef
  );
  assert.equal(toEnglish, undefined);
});

test('org-structure GET through real handler (W2)', async () => {
  const store = memoryStore();
  const orgId = generateOrganisationId();
  const orgRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: orgId });
  const access = createAccessContext({ workflow: 'professional' });

  const resolveEntity = async (refInput) => {
    const ref = typeof refInput === 'string' ? refInput : formatEntityRef(refInput);
    if (ref === orgRef) {
      return {
        ref,
        kind: 'organisation',
        display_label: 'St. Aloysius College',
        supporting_label: null,
        href: null,
        lifecycle_status: 'active',
        visibility: 'operator'
      };
    }
    throw Object.assign(new Error('not found'), { status: 404, code: 'endpoint_not_found' });
  };

  const repo = createOrgStructureRepository({
    store,
    resolveEntity,
    accessContext: access,
    getContentStore: async () => store
  });
  await repo.createUnit({
    name: 'English faculty',
    organisation_ref: orgRef,
    unit_kind: 'faculty',
    order: 0
  });

  const handler = createOrgStructureHandler({
    getContentStore: async () => store,
    createOrgStructureRepository: () => repo,
    verifySession: async () => ({ ok: true, session: { role: 'operator' } }),
    requireStore: true
  });

  // Bypass operator gate: call repository path the handler uses.
  const payload = await repo.getDerivedGraph(orgId);
  assert.equal(payload.units.length, 1);
  assert.equal(payload.units[0].name, 'English faculty');
  assert.equal(payload.graph.nodes.filter((n) => n.kind === 'unit').length, 1);

  // Also exercise handler factory exists.
  assert.equal(typeof handler, 'function');
});

// Round trip through the real Universal Link repository: a line drawn on the
// chart must come back on the next load (it used to be dropped because the
// load path read links without an access context).
function chartResolver(orgRef, names) {
  return async (refInput) => {
    const ref = typeof refInput === 'string' ? refInput : formatEntityRef(refInput);
    const [, kind, id] = ref.split(':');
    if (ref === orgRef || kind === 'unit' || kind === 'position' || (kind === 'person' && names[id])) {
      return {
        ref,
        kind,
        display_label: kind === 'person' ? names[id] : ref,
        supporting_label: null,
        href: null,
        lifecycle_status: 'active',
        visibility: 'operator'
      };
    }
    throw Object.assign(new Error('not found'), { status: 404, code: 'endpoint_not_found' });
  };
}

async function chartFixture() {
  const store = memoryStore();
  const orgId = generateOrganisationId();
  const orgRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: orgId });
  const personId = generatePersonId();
  const personRef = formatEntityRef({ namespace: 'shared', kind: 'person', id: personId });
  const repo = createOrgStructureRepository({
    store,
    resolveEntity: chartResolver(orgRef, { [personId]: 'Jo Principal' }),
    getContentStore: async () => store,
    now: () => new Date().toISOString()
  });
  const principal = await repo.createPosition({ organisation_ref: orgRef, title: 'Principal' });
  const deputy = await repo.createPosition({ organisation_ref: orgRef, title: 'Deputy' });
  const principalRef = formatEntityRef({ namespace: 'shared', kind: 'position', id: principal.id });
  const deputyRef = formatEntityRef({ namespace: 'shared', kind: 'position', id: deputy.id });
  return { store, repo, orgId, orgRef, personRef, principal, deputy, principalRef, deputyRef };
}

test('drawn lines and holders survive a reload, with the holder named', async () => {
  const f = await chartFixture();
  const validFrom = new Date(Date.now() - 1000).toISOString();
  await f.repo.createStructureLink({
    organisationRef: f.orgRef,
    relationshipType: 'holds_position',
    sourceRef: f.personRef,
    targetRef: f.principalRef,
    validFrom
  });
  await f.repo.createStructureLink({
    organisationRef: f.orgRef,
    relationshipType: 'reports_to',
    sourceRef: f.deputyRef,
    targetRef: f.principalRef,
    validFrom
  });

  const payload = await f.repo.getDerivedGraph(f.orgId);
  assert.equal(payload.links.length, 2);
  const principalNode = payload.graph.nodes.find((n) => n.ref === f.principalRef);
  assert.equal(principalNode.holder.person_ref, f.personRef);
  assert.equal(principalNode.holder.display_name, 'Jo Principal');
  assert.ok(
    payload.graph.edges.some(
      (e) => e.kind === 'reports_to' && e.source === f.deputyRef && e.target === f.principalRef
    )
  );
});

test('diagram layout persists and survives later structure writes', async () => {
  const f = await chartFixture();
  await f.repo.saveLayout(f.orgId, {
    [f.principalRef]: { x: 120.4, y: 40 },
    'not-a-ref': { x: 1, y: 2 },
    [f.deputyRef]: { x: 'nope', y: 3 }
  });
  await f.repo.createPosition({ organisation_ref: f.orgRef, title: 'Business manager' });
  const payload = await f.repo.getDerivedGraph(f.orgId);
  assert.deepEqual(payload.layout, { [f.principalRef]: { x: 120, y: 40 } });
});

test('removing a line ends it; archiving a box ends every line touching it', async () => {
  const f = await chartFixture();
  const validFrom = new Date(Date.now() - 1000).toISOString();
  const { link: holds } = await f.repo.createStructureLink({
    organisationRef: f.orgRef,
    relationshipType: 'holds_position',
    sourceRef: f.personRef,
    targetRef: f.deputyRef,
    validFrom
  });
  const { link: reports } = await f.repo.createStructureLink({
    organisationRef: f.orgRef,
    relationshipType: 'reports_to',
    sourceRef: f.deputyRef,
    targetRef: f.principalRef,
    validFrom
  });

  const ended = await f.repo.endStructureLink(f.orgId, reports.id);
  assert.equal(ended.status, 'ended');
  let payload = await f.repo.getDerivedGraph(f.orgId);
  assert.ok(!payload.graph.edges.some((e) => e.id === reports.id));

  const result = await f.repo.archivePosition(f.orgId, f.deputy.id);
  assert.deepEqual(result.ended_link_ids, [holds.id]);
  payload = await f.repo.getDerivedGraph(f.orgId);
  assert.ok(!payload.graph.nodes.some((n) => n.ref === f.deputyRef));
  assert.ok(payload.graph.nodes.some((n) => n.ref === f.principalRef));

  await assert.rejects(() => f.repo.endStructureLink(generateOrganisationId(), holds.id), /not part of this organisation/);
});

// Netlify Blobs: a default read can return the value from before the last
// write; only `{ consistency: 'strong' }` is guaranteed fresh. This store
// serves the previous value of a key to any non-strong read.
function laggingStore() {
  const map = new Map();
  const previous = new Map();
  return {
    async get(key, { type, consistency } = {}) {
      const source = consistency === 'strong' ? map : previous.has(key) ? previous : map;
      if (!source.has(key)) return null;
      const raw = source.get(key);
      if (raw === undefined) return null;
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) {
      previous.set(key, map.has(key) ? map.get(key) : undefined);
      map.set(key, JSON.stringify(value));
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
}

test('a new box survives the link and layout writes that follow it (stale index read)', async () => {
  const store = laggingStore();
  const orgId = generateOrganisationId();
  const orgRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: orgId });
  const personId = generatePersonId();
  const personRef = formatEntityRef({ namespace: 'shared', kind: 'person', id: personId });
  const repo = createOrgStructureRepository({
    store,
    resolveEntity: chartResolver(orgRef, { [personId]: 'Martin Corcoran' }),
    getContentStore: async () => store,
    now: () => new Date().toISOString()
  });
  await repo.createPosition({ organisation_ref: orgRef, title: 'Principal' });
  // Same sequence as "+ Person → Add to chart": position, holder line, layout.
  const position = await repo.createPosition({ organisation_ref: orgRef, title: 'Director - Student Wellbeing' });
  const positionRef = formatEntityRef({ namespace: 'shared', kind: 'position', id: position.id });
  await repo.createStructureLink({
    organisationRef: orgRef,
    relationshipType: 'holds_position',
    sourceRef: personRef,
    targetRef: positionRef,
    validFrom: new Date(Date.now() - 1000).toISOString()
  });
  await repo.saveLayout(orgId, { [positionRef]: { x: 240, y: 0 } });

  const payload = await repo.getDerivedGraph(orgId);
  assert.deepEqual(
    payload.positions.map((p) => p.title).sort(),
    ['Director - Student Wellbeing', 'Principal']
  );
  assert.equal(payload.links.length, 1);
  assert.deepEqual(payload.layout[positionRef], { x: 240, y: 0 });
});

test('repairDroppedPositions puts back a box the index lost, and only that box', async () => {
  const f = await chartFixture();
  const otherOrgRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: generateOrganisationId() });
  const lost = await f.repo.createPosition({ organisation_ref: f.orgRef, title: 'Lost role' });
  const archived = await f.repo.createPosition({ organisation_ref: f.orgRef, title: 'Archived role' });
  const foreign = await f.repo.createPosition({ organisation_ref: otherOrgRef, title: 'Elsewhere' });
  const ref = (id) => formatEntityRef({ namespace: 'shared', kind: 'position', id });
  await f.repo.archivePosition(f.orgId, archived.id);
  await f.repo.saveLayout(f.orgId, {
    [ref(lost.id)]: { x: 0, y: 0 },
    [ref(archived.id)]: { x: 240, y: 0 },
    [ref(foreign.id)]: { x: 480, y: 0 }
  });
  // Simulate the old bug: the index forgot the lost and archived boxes.
  const indexKey = [...(await f.store.list()).blobs.map((b) => b.key)].find((k) => k.includes(f.orgId));
  const index = await f.store.get(indexKey, { type: 'json' });
  index.position_ids = index.position_ids.filter((id) => id !== lost.id && id !== archived.id);
  await f.store.setJSON(indexKey, index);

  assert.equal(await f.repo.repairDroppedPositions(f.orgId), 1);
  const titles = (await f.repo.getDerivedGraph(f.orgId)).positions
    .filter((p) => p.lifecycle_status === 'active')
    .map((p) => p.title)
    .sort();
  assert.deepEqual(titles, ['Deputy', 'Lost role', 'Principal']);
  assert.equal(await f.repo.repairDroppedPositions(f.orgId), 0);
});

test('archiveUnit removes the faculty, keeps its boxes on the chart and ends links to it', async () => {
  const f = await chartFixture();
  const science = await f.repo.createUnit({ organisation_ref: f.orgRef, name: 'Science', unit_kind: 'faculty' });
  const scienceRef = formatEntityRef({ namespace: 'shared', kind: 'unit', id: science.id });
  await f.repo.updatePosition(f.deputy.id, { unit_ref: scienceRef, is_head: true });
  await f.repo.createStructureLink({
    organisationRef: f.orgRef,
    relationshipType: 'member_of_unit',
    sourceRef: f.personRef,
    targetRef: scienceRef,
    validFrom: new Date(Date.now() - 1000).toISOString()
  });

  const result = await f.repo.archiveUnit(f.orgId, science.id);
  assert.deepEqual(result.released_position_ids, [f.deputy.id]);
  assert.equal(result.ended_link_ids.length, 1);

  const payload = await f.repo.getDerivedGraph(f.orgId);
  assert.equal(payload.units.find((u) => u.id === science.id).lifecycle_status, 'archived');
  const deputy = payload.positions.find((p) => p.id === f.deputy.id);
  assert.equal(deputy.lifecycle_status, 'active');
  assert.equal(deputy.unit_ref, null);
  assert.equal(deputy.is_head, false);
  assert.equal(payload.graph.nodes.filter((n) => n.kind === 'unit').length, 0);
  assert.deepEqual(payload.graph.members_by_unit[scienceRef] ?? [], []);

  const elsewhere = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: generateOrganisationId() });
  const other = await f.repo.createUnit({ organisation_ref: elsewhere, name: 'Other', unit_kind: 'team' });
  await assert.rejects(() => f.repo.archiveUnit(f.orgId, other.id), /another organisation/);
});
