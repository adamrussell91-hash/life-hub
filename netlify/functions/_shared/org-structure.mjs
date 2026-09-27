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

async function loadOrgIndex(store, organisationId) {
  const raw = await getJSON(store, orgStructureIndexKey(organisationId));
  if (!raw || typeof raw !== 'object') return { unit_ids: [], position_ids: [], link_ids: [] };
  return {
    unit_ids: Array.isArray(raw.unit_ids) ? raw.unit_ids.filter(isValidUnitId) : [],
    position_ids: Array.isArray(raw.position_ids) ? raw.position_ids.filter(isValidPositionId) : [],
    link_ids: Array.isArray(raw.link_ids) ? raw.link_ids.filter((id) => typeof id === 'string') : []
  };
}

async function saveOrgIndex(store, organisationId, index) {
  await setJSON(store, orgStructureIndexKey(organisationId), {
    organisation_id: organisationId,
    unit_ids: index.unit_ids,
    position_ids: index.position_ids,
    link_ids: index.link_ids,
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
      const units = [];
      for (const id of index.unit_ids) {
        const raw = await getJSON(resolved, unitKey(id));
        const parsed = parseUnitRecord(raw);
        if (parsed) units.push(parsed);
      }
      const positions = [];
      for (const id of index.position_ids) {
        const raw = await getJSON(resolved, positionKey(id));
        const parsed = parsePositionRecord(raw);
        if (parsed) positions.push(parsed);
      }
      const links = [];
      for (const id of index.link_ids) {
        try {
          const link = await linksRepo.getLink(id);
          if (link) links.push(link);
        } catch {
          /* missing link — skip */
        }
      }
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
      const existing = parseUnitRecord(await getJSON(resolved, unitKey(unitId)));
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
      const existing = parsePositionRecord(await getJSON(resolved, positionKey(positionId)));
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
          valid_from: validFrom,
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

    async function getDerivedGraph(organisationId, peopleById = {}) {
      const organisationRef = formatEntityRef({
        namespace: 'shared',
        kind: 'organisation',
        id: organisationId
      });
      const { units, positions, links } = await loadStructure(organisationId);
      const graph = deriveReportingGraph({
        organisationRef,
        units,
        positions,
        links,
        peopleById,
        now: Date.parse(now()) || Date.now()
      });
      return { organisation_ref: organisationRef, units, positions, links, graph };
    }

    return {
      loadStructure,
      createUnit,
      updateUnit,
      createPosition,
      updatePosition,
      createStructureLink,
      getDerivedGraph
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
    /** Test helper: bind a store without reopening Blobs. */
    withStore
  };
}
