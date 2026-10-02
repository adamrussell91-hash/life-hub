import {
  IDENTITY_SCHEMA_VERSION,
  generatePositionId,
  generateUnitId,
  isValidOrganisationId,
  isValidPositionId,
  isValidUnitId,
  parsePositionRecord,
  parseUnitRecord,
  validatePositionCreateInput,
  validatePositionFieldUpdate,
  validateUnitCreateInput,
  validateUnitFieldUpdate
} from './identity-schema.mjs';
import { mapBounded } from './blobs-list.mjs';
import { createAccessContext } from './entity-access.mjs';
import { formatEntityRef, parseEntityRef } from './entity-ref.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import {
  defaultGetUniversalLinkStore,
  getJSON,
  orgStructureIndexKey,
  positionKey,
  setJSON,
  unitKey
} from './universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';

const STRUCTURE_LINK_TYPES = new Set([
  'member_of_unit',
  'holds_position',
  'part_of',
  'reports_to',
  'shares_authority_with',
  'works_with',
  'answers_to'
]);

const SYMMETRIC_TYPES = new Set(['shares_authority_with', 'works_with']);

/** Sort two refs so A⇄B and B⇄A share one equivalence hash. */
export function canonicalSymmetricPair(refA, refB) {
  return refA < refB ? [refA, refB] : [refB, refA];
}

function isActiveLink(link, nowMs) {
  if (!link || link.status === 'ended' || link.status === 'suppressed') return false;
  if (link.valid_to) {
    const end = Date.parse(link.valid_to);
    if (Number.isFinite(end) && end < nowMs) return false;
  }
  return true;
}

function nodeIdFromRef(ref) {
  return ref;
}

/**
 * Pure: derive reporting graph from units, positions and structure links.
 * Cycles are marked; never loops forever.
 */
export function deriveReportingGraph({
  organisationRef,
  units = [],
  positions = [],
  links = [],
  peopleById = {},
  now = Date.now()
} = {}) {
  const nowMs = typeof now === 'number' ? now : Date.parse(now) || Date.now();
  const activeUnits = units.filter((u) => u && u.lifecycle_status === 'active');
  const activePositions = positions.filter((p) => p && p.lifecycle_status === 'active');
  const activeLinks = links.filter((l) => STRUCTURE_LINK_TYPES.has(l.relationship_type) && isActiveLink(l, nowMs));

  const unitByRef = new Map(
    activeUnits.map((u) => [formatEntityRef({ namespace: 'shared', kind: 'unit', id: u.id }), u])
  );
  const positionByRef = new Map(
    activePositions.map((p) => [formatEntityRef({ namespace: 'shared', kind: 'position', id: p.id }), p])
  );

  const nodes = [];
  const edges = [];
  const memberPersonIds = new Set();

  for (const unit of activeUnits) {
    const ref = formatEntityRef({ namespace: 'shared', kind: 'unit', id: unit.id });
    nodes.push({
      id: nodeIdFromRef(ref),
      kind: 'unit',
      ref,
      name: unit.name,
      unit_kind: unit.unit_kind,
      order: unit.order,
      organisation_ref: unit.organisation_ref
    });
  }

  for (const position of activePositions) {
    const ref = formatEntityRef({ namespace: 'shared', kind: 'position', id: position.id });
    nodes.push({
      id: nodeIdFromRef(ref),
      kind: 'position',
      ref,
      title: position.title,
      unit_ref: position.unit_ref,
      is_head: position.is_head,
      organisation_ref: position.organisation_ref,
      holder: null
    });
  }

  const headByUnitRef = new Map();
  for (const position of activePositions) {
    if (position.is_head && position.unit_ref) {
      headByUnitRef.set(position.unit_ref, formatEntityRef({ namespace: 'shared', kind: 'position', id: position.id }));
    }
  }

  const parentByUnitRef = new Map();
  for (const link of activeLinks) {
    if (link.relationship_type === 'part_of') {
      parentByUnitRef.set(link.source_ref, link.target_ref);
    }
  }

  const holdersByPosition = new Map();
  for (const link of activeLinks) {
    if (link.relationship_type === 'holds_position') {
      const list = holdersByPosition.get(link.target_ref) || [];
      list.push({ person_ref: link.source_ref, role: link.role || null, link_id: link.id });
      holdersByPosition.set(link.target_ref, list);
      const personId = parseEntityRef(link.source_ref)?.id;
      if (personId) memberPersonIds.add(personId);
    }
  }

  for (const node of nodes) {
    if (node.kind === 'position') {
      const holders = holdersByPosition.get(node.ref) || [];
      const first = holders[0] || null;
      if (first) {
        const personId = parseEntityRef(first.person_ref)?.id;
        const person = personId ? peopleById[personId] : null;
        node.holder = {
          person_ref: first.person_ref,
          display_name: person?.display_name || person?.display_label || null,
          role: first.role,
          warmth_band: person?.warmth_band || null
        };
      }
    }
  }

  const membersByUnit = new Map();
  for (const link of activeLinks) {
    if (link.relationship_type === 'member_of_unit') {
      const list = membersByUnit.get(link.target_ref) || [];
      list.push({ person_ref: link.source_ref, role: link.role || null, link_id: link.id });
      membersByUnit.set(link.target_ref, list);
      const personId = parseEntityRef(link.source_ref)?.id;
      if (personId) memberPersonIds.add(personId);
    }
  }

  const explicitReports = [];
  const replacesDefault = new Set();
  for (const link of activeLinks) {
    if (link.relationship_type === 'reports_to') {
      explicitReports.push(link);
      if (link.metadata?.replaces_default === true) {
        replacesDefault.add(link.source_ref);
      }
    }
  }

  // Derived: member of unit → unit's head
  for (const [unitRef, members] of membersByUnit) {
    const headRef = headByUnitRef.get(unitRef);
    if (!headRef) continue;
    for (const member of members) {
      // Person→head edges are represented as member→head via unit membership
      // for layout; flowchart draws person cards inside units.
      edges.push({
        id: `derived:member:${member.link_id}:${headRef}`,
        source: member.person_ref,
        target: headRef,
        kind: 'reports_to',
        flag: 'derived',
        via: unitRef
      });
    }
  }

  // Derived: head of unit → head of part_of parent
  for (const [unitRef, headRef] of headByUnitRef) {
    if (replacesDefault.has(headRef) || replacesDefault.has(unitRef)) continue;
    const parentUnitRef = parentByUnitRef.get(unitRef);
    if (!parentUnitRef) continue;
    const parentHead = headByUnitRef.get(parentUnitRef);
    if (!parentHead) continue;
    edges.push({
      id: `derived:head:${headRef}:${parentHead}`,
      source: headRef,
      target: parentHead,
      kind: 'reports_to',
      flag: 'derived'
    });
  }

  for (const link of explicitReports) {
    edges.push({
      id: link.id,
      source: link.source_ref,
      target: link.target_ref,
      kind: 'reports_to',
      flag: 'explicit',
      replaces_default: link.metadata?.replaces_default === true
    });
  }

  for (const link of activeLinks) {
    if (link.relationship_type === 'shares_authority_with') {
      edges.push({
        id: link.id,
        source: link.source_ref,
        target: link.target_ref,
        kind: 'shares_authority_with',
        flag: 'explicit'
      });
    } else if (link.relationship_type === 'works_with') {
      edges.push({
        id: link.id,
        source: link.source_ref,
        target: link.target_ref,
        kind: 'works_with',
        flag: 'explicit'
      });
    } else if (link.relationship_type === 'answers_to') {
      edges.push({
        id: link.id,
        source: link.source_ref,
        target: link.target_ref,
        kind: 'answers_to',
        flag: 'explicit'
      });
    }
  }

  // Cycle detection on reports_to edges (DFS); mark both sides of cycles.
  const reportsAdj = new Map();
  for (const edge of edges) {
    if (edge.kind !== 'reports_to') continue;
    if (!reportsAdj.has(edge.source)) reportsAdj.set(edge.source, []);
    reportsAdj.get(edge.source).push(edge);
  }
  const visiting = new Set();
  const visited = new Set();
  const cycleNodeIds = new Set();
  function dfs(node, stack) {
    if (visiting.has(node)) {
      const idx = stack.indexOf(node);
      for (const id of stack.slice(idx >= 0 ? idx : 0)) cycleNodeIds.add(id);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const edge of reportsAdj.get(node) || []) {
      dfs(edge.target, stack);
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of reportsAdj.keys()) dfs(node, []);
  for (const edge of edges) {
    if (edge.kind === 'reports_to' && (cycleNodeIds.has(edge.source) || cycleNodeIds.has(edge.target))) {
      edge.cycle = true;
    }
  }

  const membershipsByPerson = new Map();
  for (const [unitRef, members] of membersByUnit) {
    for (const member of members) {
      const list = membershipsByPerson.get(member.person_ref) || [];
      list.push({ unit_ref: unitRef, role: member.role, link_id: member.link_id });
      membershipsByPerson.set(member.person_ref, list);
    }
  }

  return {
    organisation_ref: organisationRef || null,
    nodes,
    edges,
    members_by_unit: Object.fromEntries(
      [...membersByUnit.entries()].map(([k, v]) => [k, v])
    ),
    memberships_by_person: Object.fromEntries(
      [...membershipsByPerson.entries()].map(([k, v]) => [k, v])
    ),
    member_person_ids: [...memberPersonIds],
    member_count: memberPersonIds.size,
    cycles: [...cycleNodeIds]
  };
}

const LAYOUT_REF_PATTERN = /^shared:(position|unit):[A-Za-z0-9_-]{1,80}$/;
const LAYOUT_LIMIT = 2000;
const LAYOUT_COORD_LIMIT = 100000;

/**
 * Pure: validate a diagram layout `{ [shared:position|unit ref]: { x, y } }`.
 * Only box positions the operator dragged — never structure or access data.
 */
/** Key for "this person with this title was taken off the chart". */
export function dismissKey(personRef, title) {
  return `${personRef}|${String(title ?? '').trim().toLowerCase()}`;
}

function sameTitle(a, b) {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

export function sanitizeDiagramLayout(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  let count = 0;
  for (const [ref, point] of Object.entries(raw)) {
    if (count >= LAYOUT_LIMIT) break;
    if (!LAYOUT_REF_PATTERN.test(ref)) continue;
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (Math.abs(x) > LAYOUT_COORD_LIMIT || Math.abs(y) > LAYOUT_COORD_LIMIT) continue;
    out[ref] = { x: Math.round(x), y: Math.round(y) };
    count += 1;
  }
  return out;
}

// Netlify Blobs reads are eventually consistent by default. The org index
// is one blob that every write loads, mutates and saves, so a stale read
// there silently drops whatever the previous write added (a new box
// vanished after "Saved." because the following link / layout write saved
// an index that predated it). Every index and record read is strong.
const STRONG = { consistency: 'strong' };
const READ_BATCH = 10;

async function loadOrgIndex(store, organisationId) {
  const raw = await getJSON(store, orgStructureIndexKey(organisationId), STRONG);
  if (!raw || typeof raw !== 'object') {
    return { unit_ids: [], position_ids: [], link_ids: [], diagram_layout: {}, sync_dismissed: [] };
  }
  return {
    unit_ids: Array.isArray(raw.unit_ids) ? raw.unit_ids.filter(isValidUnitId) : [],
    position_ids: Array.isArray(raw.position_ids) ? raw.position_ids.filter(isValidPositionId) : [],
    link_ids: Array.isArray(raw.link_ids) ? raw.link_ids.filter((id) => typeof id === 'string') : [],
    diagram_layout: sanitizeDiagramLayout(raw.diagram_layout),
    sync_dismissed: Array.isArray(raw.sync_dismissed)
      ? raw.sync_dismissed.filter((k) => typeof k === 'string').slice(-500)
      : []
  };
}

async function saveOrgIndex(store, organisationId, index) {
  await setJSON(store, orgStructureIndexKey(organisationId), {
    organisation_id: organisationId,
    unit_ids: index.unit_ids,
    position_ids: index.position_ids,
    link_ids: index.link_ids,
    // Every writer goes through load → mutate → save, so the dragged box
    // positions survive a unit/position/link write.
    diagram_layout: sanitizeDiagramLayout(index.diagram_layout),
    // Person + title pairs the operator took off the chart; the profile
    // sync never re-adds those (a new title is a new pair).
    sync_dismissed: Array.isArray(index.sync_dismissed) ? index.sync_dismissed.slice(-500) : [],
    updated_at: new Date().toISOString()
  });
}

export function createOrgStructureRepository(deps = {}) {
  const getStore = deps.getContentStore ?? defaultGetUniversalLinkStore;
  const now = deps.now ?? (() => new Date().toISOString());
  const createLinks = deps.createUniversalLinkRepository ?? createUniversalLinkRepository;
  const resolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const accessContext = deps.accessContext ?? createAccessContext({ workflow: 'professional' });

  async function withStore(store) {
    const resolved = store ?? (await getStore());
    const linksRepo = createLinks({ store: resolved, now, resolveEntity });

    async function loadStructure(organisationId) {
      if (!isValidOrganisationId(organisationId)) {
        throw Object.assign(new Error('Invalid organisation id.'), { status: 400, code: 'invalid_organisation_id' });
      }
      const index = await loadOrgIndex(resolved, organisationId);
      const [unitRecords, positionRecords, linkRecords] = await Promise.all([
        mapBounded(index.unit_ids, READ_BATCH, async (id) =>
          parseUnitRecord(await getJSON(resolved, unitKey(id), STRONG))
        ),
        mapBounded(index.position_ids, READ_BATCH, async (id) =>
          parsePositionRecord(await getJSON(resolved, positionKey(id), STRONG))
        ),
        mapBounded(index.link_ids, READ_BATCH, async (id) => {
          try {
            // Must pass the access context: without it every link fails the
            // visibility check and the chart silently loses all its lines.
            return await linksRepo.getLink(id, accessContext, STRONG);
          } catch {
            return null; /* missing link — skip */
          }
        })
      ]);
      const units = unitRecords.filter(Boolean);
      const positions = positionRecords.filter(Boolean);
      const links = linkRecords.filter(Boolean);
      // Also pull active structure links by listing for each unit/position
      // when index is incomplete (repair path).
      return { units, positions, links, index };
    }

    async function createUnit(input) {
      const fields = validateUnitCreateInput(input);
      const orgId = fields.organisation_ref.slice('shared:organisation:'.length);
      const id = generateUnitId();
      const timestamp = now();
      const record = {
        schema_version: IDENTITY_SCHEMA_VERSION,
        id,
        kind: 'unit',
        name: fields.name,
        organisation_ref: fields.organisation_ref,
        unit_kind: fields.unit_kind,
        order: fields.order,
        lifecycle_status: 'active',
        created_at: timestamp,
        updated_at: timestamp
      };
      await setJSON(resolved, unitKey(id), record);
      const index = await loadOrgIndex(resolved, orgId);
      if (!index.unit_ids.includes(id)) index.unit_ids.push(id);
      await saveOrgIndex(resolved, orgId, index);
      return record;
    }

    async function updateUnit(unitId, patch) {
      if (!isValidUnitId(unitId)) {
        throw Object.assign(new Error('Invalid unit id.'), { status: 400, code: 'invalid_unit_id' });
      }
      const existing = parseUnitRecord(await getJSON(resolved, unitKey(unitId), STRONG));
      if (!existing) {
        throw Object.assign(new Error('Unit not found.'), { status: 404, code: 'unit_not_found' });
      }
      const fields = validateUnitFieldUpdate(patch);
      const updated = { ...existing, ...fields, updated_at: now() };
      await setJSON(resolved, unitKey(unitId), updated);
      return updated;
    }

    async function createPosition(input) {
      const fields = validatePositionCreateInput(input);
      const orgId = fields.organisation_ref.slice('shared:organisation:'.length);
      const id = generatePositionId();
      const timestamp = now();
      const record = {
        schema_version: IDENTITY_SCHEMA_VERSION,
        id,
        kind: 'position',
        title: fields.title,
        organisation_ref: fields.organisation_ref,
        unit_ref: fields.unit_ref,
        is_head: fields.is_head,
        lifecycle_status: 'active',
        created_at: timestamp,
        updated_at: timestamp
      };
      await setJSON(resolved, positionKey(id), record);
      const index = await loadOrgIndex(resolved, orgId);
      if (!index.position_ids.includes(id)) index.position_ids.push(id);
      await saveOrgIndex(resolved, orgId, index);
      return record;
    }

    async function updatePosition(positionId, patch) {
      if (!isValidPositionId(positionId)) {
        throw Object.assign(new Error('Invalid position id.'), { status: 400, code: 'invalid_position_id' });
      }
      const existing = parsePositionRecord(await getJSON(resolved, positionKey(positionId), STRONG));
      if (!existing) {
        throw Object.assign(new Error('Position not found.'), { status: 404, code: 'position_not_found' });
      }
      const fields = validatePositionFieldUpdate(patch);
      const updated = { ...existing, ...fields, updated_at: now() };
      await setJSON(resolved, positionKey(positionId), updated);
      return updated;
    }

    async function createStructureLink({
      organisationRef,
      relationshipType,
      sourceRef,
      targetRef,
      role = null,
      validFrom = null,
      validTo = null,
      metadata = {}
    }) {
      if (!STRUCTURE_LINK_TYPES.has(relationshipType)) {
        throw Object.assign(new Error(`Unknown structure relationship: ${relationshipType}`), {
          status: 400,
          code: 'unknown_relationship_key'
        });
      }
      let source = sourceRef;
      let target = targetRef;
      if (SYMMETRIC_TYPES.has(relationshipType)) {
        [source, target] = canonicalSymmetricPair(sourceRef, targetRef);
      }
      const { link, created } = await linksRepo.createLink(
        {
          source_ref: source,
          target_ref: target,
          relationship_type: relationshipType,
          role,
          // Server clock by default: a client-stamped start that runs ahead
          // of the server would make an immediate "remove line" fail
          // (valid_to before valid_from).
          valid_from: validFrom ?? now(),
          context_ref: organisationRef,
          metadata,
          visibility: 'operator'
        },
        accessContext
      );
      // valid_to is set via endLink when memberships end — create path only
      // takes valid_from (UL repository period create).
      void validTo;
      const orgId = organisationRef.slice('shared:organisation:'.length);
      const index = await loadOrgIndex(resolved, orgId);
      if (!index.link_ids.includes(link.id)) index.link_ids.push(link.id);
      await saveOrgIndex(resolved, orgId, index);
      return { link, created };
    }

    function currentHoldsFor(links, positions, personRef) {
      const active = new Map(
        positions
          .filter((p) => p.lifecycle_status === 'active')
          .map((p) => [formatEntityRef({ namespace: 'shared', kind: 'position', id: p.id }), p])
      );
      return links
        .filter(
          (l) =>
            linkIsCurrent(l) &&
            l.relationship_type === 'holds_position' &&
            l.source_ref === personRef &&
            active.has(l.target_ref)
        )
        .map((l) => ({ link: l, position: active.get(l.target_ref) }));
    }

    /**
     * Profile → chart. Put this person on the chart in a role with this
     * title: rename the role they hold, fill a vacant role with the same
     * title, or add a new role. Returns what changed.
     */
    async function syncHolderFromProfile(organisationId, personRef, title, options = {}) {
      const clean = typeof title === 'string' ? title.trim() : '';
      if (!clean) return { changed: false };
      const key = dismissKey(personRef, clean);
      const { units, positions, links, index } = await loadStructure(organisationId);
      void units;
      if (options.respectDismissed && index.sync_dismissed.includes(key)) return { changed: false };
      if (!options.respectDismissed) await clearDismissed(organisationId, key);
      const orgRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: organisationId });
      const holds = currentHoldsFor(links, positions, personRef);
      if (holds.some((h) => sameTitle(h.position.title, clean))) return { changed: false };
      if (holds.length === 1) {
        await updatePosition(holds[0].position.id, { title: clean });
        return { changed: true, action: 'renamed', position_id: holds[0].position.id };
      }
      if (holds.length > 1) return { changed: false }; // ambiguous — leave their roles alone
      const heldRefs = new Set(
        links.filter((l) => linkIsCurrent(l) && l.relationship_type === 'holds_position').map((l) => l.target_ref)
      );
      const vacant = positions.find(
        (p) =>
          p.lifecycle_status === 'active' &&
          sameTitle(p.title, clean) &&
          !heldRefs.has(formatEntityRef({ namespace: 'shared', kind: 'position', id: p.id }))
      );
      const position = vacant ?? (await createPosition({ organisation_ref: orgRef, title: clean }));
      await createStructureLink({
        organisationRef: orgRef,
        relationshipType: 'holds_position',
        sourceRef: personRef,
        targetRef: formatEntityRef({ namespace: 'shared', kind: 'position', id: position.id })
      });
      return { changed: true, action: vacant ? 'filled' : 'added', position_id: position.id };
    }

    /** They left this organisation: take them out of their roles (the boxes stay, vacant). */
    async function releaseHolder(organisationId, personRef) {
      const { positions, links } = await loadStructure(organisationId);
      for (const { link } of currentHoldsFor(links, positions, personRef)) {
        await endStructureLink(organisationId, link.id, { dismiss: false });
      }
    }

    /**
     * Chart load: everyone at this organisation with a job title gets a box.
     * Loads the structure once and only takes the per-person write path for
     * people whose box is missing or out of date (it used to reload the whole
     * structure once per person, which made every chart load take 10s+).
     */
    async function syncFromProfiles(organisationId, workplaces) {
      const candidates = (workplaces ?? []).filter((w) => w?.job_title && w.person_ref);
      if (!candidates.length) return 0;
      const { positions, links, index } = await loadStructure(organisationId);
      let changed = 0;
      for (const w of candidates) {
        const clean = String(w.job_title).trim();
        if (!clean || index.sync_dismissed.includes(dismissKey(w.person_ref, clean))) continue;
        const holds = currentHoldsFor(links, positions, w.person_ref);
        if (holds.some((h) => sameTitle(h.position.title, clean))) continue;
        if (holds.length > 1) continue;
        const result = await syncHolderFromProfile(organisationId, w.person_ref, w.job_title, {
          respectDismissed: true
        });
        if (result.changed) changed += 1;
      }
      return changed;
    }

    /**
     * Put back boxes an earlier stale index write dropped. A dropped position
     * still has its record and usually a saved layout entry, so any layout key
     * for an active position of this organisation that the index no longer
     * lists is re-added. Returns the number of boxes recovered.
     */
    async function repairDroppedPositions(organisationId) {
      const index = await loadOrgIndex(resolved, organisationId);
      const listed = new Set(index.position_ids);
      const orgRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: organisationId });
      const candidates = Object.keys(index.diagram_layout ?? {})
        .map((ref) => parseEntityRef(ref))
        .filter((ref) => ref?.kind === 'position' && isValidPositionId(ref.id) && !listed.has(ref.id))
        .map((ref) => ref.id);
      if (!candidates.length) return 0;
      const records = await mapBounded(candidates, READ_BATCH, async (id) =>
        parsePositionRecord(await getJSON(resolved, positionKey(id), STRONG))
      );
      const recovered = records
        .filter((p) => p && p.organisation_ref === orgRef && p.lifecycle_status === 'active')
        .map((p) => p.id);
      if (!recovered.length) return 0;
      const fresh = await loadOrgIndex(resolved, organisationId);
      for (const id of recovered) if (!fresh.position_ids.includes(id)) fresh.position_ids.push(id);
      await saveOrgIndex(resolved, organisationId, fresh);
      return recovered.length;
    }

    /** Current holders of a position (for chart → profile). */
    async function holdersOf(organisationId, positionId) {
      const { links } = await loadStructure(organisationId);
      const ref = formatEntityRef({ namespace: 'shared', kind: 'position', id: positionId });
      return links
        .filter((l) => linkIsCurrent(l) && l.relationship_type === 'holds_position' && l.target_ref === ref)
        .map((l) => l.source_ref);
    }

    // Holder/member names for the chart. Resolved through the same
    // authorised resolver as every other endpoint; a hidden or missing
    // person simply stays unnamed rather than erroring the whole chart.
    async function resolvePeopleNames(links) {
      const refs = new Set();
      for (const link of links) {
        if (link?.relationship_type !== 'holds_position' && link?.relationship_type !== 'member_of_unit') continue;
        if (typeof link.source_ref === 'string' && link.source_ref.startsWith('shared:person:')) refs.add(link.source_ref);
      }
      const byId = {};
      const personAccess = createAccessContext({ workflow: 'life' });
      await mapBounded([...refs], READ_BATCH, async (ref) => {
        try {
          const endpoint = await resolveEntity(ref, personAccess);
          const id = parseEntityRef(ref)?.id;
          if (id && endpoint?.display_label) byId[id] = { display_name: endpoint.display_label };
        } catch {
          /* hidden or missing person — leave unnamed */
        }
      });
      return byId;
    }

    async function getDerivedGraph(organisationId, peopleById = null) {
      const organisationRef = formatEntityRef({
        namespace: 'shared',
        kind: 'organisation',
        id: organisationId
      });
      const { units, positions, links, index } = await loadStructure(organisationId);
      const names = peopleById ?? (await resolvePeopleNames(links));
      const graph = deriveReportingGraph({
        organisationRef,
        units,
        positions,
        links,
        peopleById: names,
        now: Date.parse(now()) || Date.now()
      });
      return {
        organisation_ref: organisationRef,
        units,
        positions,
        links,
        graph,
        layout: index.diagram_layout ?? {}
      };
    }

    async function saveLayout(organisationId, layout) {
      if (!isValidOrganisationId(organisationId)) {
        throw Object.assign(new Error('Invalid organisation id.'), { status: 400, code: 'invalid_organisation_id' });
      }
      const index = await loadOrgIndex(resolved, organisationId);
      index.diagram_layout = { ...index.diagram_layout, ...sanitizeDiagramLayout(layout) };
      await saveOrgIndex(resolved, organisationId, index);
      return index.diagram_layout;
    }

    function linkIsCurrent(link) {
      return link && link.status === 'current';
    }

    async function addDismissed(organisationId, keys) {
      const index = await loadOrgIndex(resolved, organisationId);
      const set = new Set(index.sync_dismissed);
      for (const key of keys) set.add(key);
      index.sync_dismissed = [...set];
      await saveOrgIndex(resolved, organisationId, index);
    }

    async function clearDismissed(organisationId, key) {
      const index = await loadOrgIndex(resolved, organisationId);
      if (!index.sync_dismissed.includes(key)) return;
      index.sync_dismissed = index.sync_dismissed.filter((k) => k !== key);
      await saveOrgIndex(resolved, organisationId, index);
    }

    async function endStructureLink(organisationId, linkId, options = {}) {
      const index = await loadOrgIndex(resolved, organisationId);
      if (!index.link_ids.includes(linkId)) {
        throw Object.assign(new Error('That line is not part of this organisation chart.'), {
          status: 404,
          code: 'structure_link_not_found'
        });
      }
      const link = await linksRepo.getLink(linkId, accessContext, STRONG);
      if (!linkIsCurrent(link)) return link;
      if (link.relationship_type === 'holds_position' && options.dismiss !== false) {
        const position = parsePositionRecord(
          await getJSON(resolved, positionKey(parseEntityRef(link.target_ref)?.id ?? ''), STRONG)
        );
        if (position) await addDismissed(organisationId, [dismissKey(link.source_ref, position.title)]);
      }
      if (link.temporal_mode !== 'period') {
        return linksRepo.suppressLink(linkId, 'org_chart_removed', createAccessContext({ workflow: 'administration' }));
      }
      return linksRepo.endLink(linkId, now(), accessContext);
    }

    // Remove a box from the chart: archive the position (history stays in
    // Blobs) and end every current line touching it — holder, reporting
    // lines, works-with — so no edge is left pointing at a missing box.
    async function archivePosition(organisationId, positionId) {
      if (!isValidPositionId(positionId)) {
        throw Object.assign(new Error('Invalid position id.'), { status: 400, code: 'invalid_position_id' });
      }
      const existing = parsePositionRecord(await getJSON(resolved, positionKey(positionId), STRONG));
      if (!existing) {
        throw Object.assign(new Error('Position not found.'), { status: 404, code: 'position_not_found' });
      }
      const orgRef = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: organisationId });
      if (existing.organisation_ref !== orgRef) {
        throw Object.assign(new Error('Position belongs to another organisation.'), {
          status: 400,
          code: 'position_organisation_mismatch'
        });
      }
      const positionRef = formatEntityRef({ namespace: 'shared', kind: 'position', id: positionId });
      const { links } = await loadStructure(organisationId);
      const ended = [];
      for (const link of links) {
        if (!linkIsCurrent(link)) continue;
        if (link.source_ref !== positionRef && link.target_ref !== positionRef) continue;
        // Ending the holder link records the dismissal, so the profile sync
        // won't put this person straight back in a new box.
        await endStructureLink(organisationId, link.id);
        ended.push(link.id);
      }
      const updated = { ...existing, lifecycle_status: 'archived', updated_at: now() };
      await setJSON(resolved, positionKey(positionId), updated);
      return { position: updated, ended_link_ids: ended };
    }

    return {
      loadStructure,
      createUnit,
      updateUnit,
      createPosition,
      updatePosition,
      createStructureLink,
      getDerivedGraph,
      saveLayout,
      endStructureLink,
      archivePosition,
      syncHolderFromProfile,
      releaseHolder,
      syncFromProfiles,
      repairDroppedPositions,
      holdersOf
    };
  }

  return {
    async loadStructure(organisationId) {
      return (await withStore()).loadStructure(organisationId);
    },
    async createUnit(input) {
      return (await withStore()).createUnit(input);
    },
    async updateUnit(unitId, patch) {
      return (await withStore()).updateUnit(unitId, patch);
    },
    async createPosition(input) {
      return (await withStore()).createPosition(input);
    },
    async updatePosition(positionId, patch) {
      return (await withStore()).updatePosition(positionId, patch);
    },
    async createStructureLink(input) {
      return (await withStore()).createStructureLink(input);
    },
    async getDerivedGraph(organisationId, peopleById) {
      return (await withStore()).getDerivedGraph(organisationId, peopleById);
    },
    async saveLayout(organisationId, layout) {
      return (await withStore()).saveLayout(organisationId, layout);
    },
    async endStructureLink(organisationId, linkId) {
      return (await withStore()).endStructureLink(organisationId, linkId);
    },
    async archivePosition(organisationId, positionId) {
      return (await withStore()).archivePosition(organisationId, positionId);
    },
    async syncHolderFromProfile(organisationId, personRef, title, options) {
      return (await withStore()).syncHolderFromProfile(organisationId, personRef, title, options);
    },
    async releaseHolder(organisationId, personRef) {
      return (await withStore()).releaseHolder(organisationId, personRef);
    },
    async syncFromProfiles(organisationId, workplaces) {
      return (await withStore()).syncFromProfiles(organisationId, workplaces);
    },
    async repairDroppedPositions(organisationId) {
      return (await withStore()).repairDroppedPositions(organisationId);
    },
    async holdersOf(organisationId, positionId) {
      return (await withStore()).holdersOf(organisationId, positionId);
    },
    /** Test helper: bind a store without reopening Blobs. */
    withStore
  };
}
