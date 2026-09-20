export const HUB_MAP_PATH = 'data/hub-map/hub-map.json';
export const CENTRAL_ID = 'life-hub';
export const HUB_IDS = ['central', 'life', 'teaching', 'knowledge', 'tasks', 'professional'];
export const NODE_KINDS = ['hub', 'page', 'section', 'page-type'];
export const NODE_STATUSES = ['unreviewed', 'not-started', 'partial', 'built'];
export const EDGE_TYPES = ['structure', 'link'];

export const HUB_LABELS = {
  central: 'Life Hub',
  life: 'Life',
  teaching: 'Teaching',
  knowledge: 'Knowledge',
  tasks: 'Tasks',
  professional: 'Professional'
};
export const KIND_LABELS = { hub: 'Hub', page: 'Page', section: 'Section', 'page-type': 'Page type' };
export const STATUS_LABELS = {
  unreviewed: 'Unreviewed',
  'not-started': 'Not started',
  partial: 'Partial',
  built: 'Built'
};

const LIMITS = { nodes: 400, edges: 1200, id: 80, name: 80, route: 120, label: 60, feature: 160, plan: 240, notes: 2000, items: 40 };
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const PATCHABLE = ['name', 'route', 'status', 'features', 'plans', 'notes'];

function trimmed(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length <= max ? text : null;
}

function normalizeList(value, max) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > LIMITS.items) return null;
  const out = [];
  for (const item of value) {
    const text = trimmed(item, max);
    if (text === null) return null;
    if (text) out.push(text);
  }
  return out;
}

function normalizePlans(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > LIMITS.items) return null;
  const out = [];
  for (const item of value) {
    const text = trimmed(item?.text, LIMITS.plan);
    if (text === null) return null;
    if (text) out.push({ text, done: item.done === true });
  }
  return out;
}

function normalizeNode(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = trimmed(raw.id, LIMITS.id);
  const name = trimmed(raw.name, LIMITS.name);
  if (!id || !ID_PATTERN.test(id) || !name) return null;
  if (!HUB_IDS.includes(raw.hub) || !NODE_KINDS.includes(raw.kind) || !NODE_STATUSES.includes(raw.status)) return null;
  const route = raw.route === undefined || raw.route === null ? '' : trimmed(raw.route, LIMITS.route);
  const features = normalizeList(raw.features, LIMITS.feature);
  const plans = normalizePlans(raw.plans);
  const notes = raw.notes === undefined || raw.notes === null
    ? ''
    : (typeof raw.notes === 'string' && raw.notes.length <= LIMITS.notes ? raw.notes : null);
  if (route === null || !features || !plans || notes === null) return null;
  return { id, name, hub: raw.hub, kind: raw.kind, route, status: raw.status, features, plans, notes };
}

function normalizeEdge(raw) {
  if (!raw || typeof raw !== 'object' || !EDGE_TYPES.includes(raw.type)) return null;
  const from = trimmed(raw.from, LIMITS.id);
  const to = trimmed(raw.to, LIMITS.id);
  const label = raw.label === undefined || raw.label === null ? '' : trimmed(raw.label, LIMITS.label);
  if (!from || !to || label === null) return null;
  return { from, to, type: raw.type, label };
}

export function validateMap(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return { ok: false, errors: ['version must be 1'] };
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return { ok: false, errors: ['nodes and edges must be arrays'] };
  if (raw.nodes.length > LIMITS.nodes || raw.edges.length > LIMITS.edges) return { ok: false, errors: ['map is too large'] };

  const errors = [];
  const nodes = [];
  const ids = new Set();
  raw.nodes.forEach((entry, index) => {
    const node = normalizeNode(entry);
    if (!node) { errors.push(`node ${index} is invalid`); return; }
    if (ids.has(node.id)) { errors.push(`duplicate node id ${node.id}`); return; }
    ids.add(node.id);
    nodes.push(node);
  });
  const central = nodes.find(node => node.id === CENTRAL_ID);
  if (!central || central.kind !== 'hub' || central.hub !== 'central') {
    errors.push(`${CENTRAL_ID} must be the central hub node`);
  }

  const edges = [];
  const seen = new Set();
  const parent = new Map();
  raw.edges.forEach((entry, index) => {
    const edge = normalizeEdge(entry);
    if (!edge) { errors.push(`edge ${index} is invalid`); return; }
    if (!ids.has(edge.from) || !ids.has(edge.to)) { errors.push(`edge ${index} points at a missing node`); return; }
    if (edge.from === edge.to) { errors.push(`edge ${index} links a node to itself`); return; }
    const key = `${edge.type}:${edge.from}>${edge.to}`;
    if (seen.has(key)) { errors.push(`duplicate edge ${key}`); return; }
    seen.add(key);
    if (edge.type === 'link' && (edge.from === CENTRAL_ID || edge.to === CENTRAL_ID)) {
      errors.push('links cannot touch the central node');
      return;
    }
    if (edge.type === 'structure') {
      if (parent.has(edge.to)) { errors.push(`${edge.to} has more than one parent`); return; }
      parent.set(edge.to, edge.from);
    }
    edges.push(edge);
  });

  for (const node of nodes) {
    if (node.id === CENTRAL_ID) {
      if (parent.has(node.id)) errors.push('the central node cannot have a parent');
      continue;
    }
    if (!parent.has(node.id)) { errors.push(`${node.id} has no parent`); continue; }
    let cursor = node.id;
    let steps = 0;
    while (cursor && cursor !== CENTRAL_ID && steps <= nodes.length) {
      cursor = parent.get(cursor);
      steps += 1;
    }
    if (cursor !== CENTRAL_ID) errors.push(`${node.id} does not reach the central node`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, map: { version: 1, nodes, edges } };
}

export function parseMap(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const result = validateMap(raw);
  return result.ok ? result.map : null;
}

function commit(map, nodes, edges) {
  const result = validateMap({ version: 1, nodes, edges });
  return result.ok ? result.map : null;
}

export function updateNode(map, id, patch) {
  const node = map.nodes.find(entry => entry.id === id);
  if (!node || !patch || typeof patch !== 'object') return null;
  const next = { ...node };
  for (const key of PATCHABLE) if (key in patch) next[key] = patch[key];
  return commit(map, map.nodes.map(entry => (entry.id === id ? next : entry)), map.edges);
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

export function addNode(map, { parentId, name, kind = 'page' }) {
  const parent = map.nodes.find(entry => entry.id === parentId);
  const label = trimmed(name, LIMITS.name);
  if (!parent || parent.id === CENTRAL_ID || !label || !['page', 'section', 'page-type'].includes(kind)) return null;
  const base = slug(label);
  if (!base) return null;
  let id = base;
  let suffix = 2;
  while (map.nodes.some(entry => entry.id === id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  const node = { id, name: label, hub: parent.hub, kind, route: '', status: 'not-started', features: [], plans: [], notes: '' };
  const next = commit(map, [...map.nodes, node], [...map.edges, { from: parent.id, to: id, type: 'structure', label: '' }]);
  return next ? { map: next, id } : null;
}

export function removeNode(map, id) {
  const node = map.nodes.find(entry => entry.id === id);
  if (!node || node.kind === 'hub') return null;
  const doomed = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of map.edges) {
      if (edge.type === 'structure' && doomed.has(edge.from) && !doomed.has(edge.to)) {
        doomed.add(edge.to);
        grew = true;
      }
    }
  }
  return commit(
    map,
    map.nodes.filter(entry => !doomed.has(entry.id)),
    map.edges.filter(edge => !doomed.has(edge.from) && !doomed.has(edge.to))
  );
}

export function addLink(map, from, to, label = '') {
  return commit(map, map.nodes, [...map.edges, { from, to, type: 'link', label }]);
}

export function removeLink(map, from, to) {
  const edges = map.edges.filter(edge => !(edge.type === 'link' && edge.from === from && edge.to === to));
  if (edges.length === map.edges.length) return null;
  return commit(map, map.nodes, edges);
}

export function childIndex(map) {
  const order = new Map(map.nodes.map((node, index) => [node.id, index]));
  const kids = new Map();
  for (const edge of map.edges) {
    if (edge.type !== 'structure') continue;
    if (!kids.has(edge.from)) kids.set(edge.from, []);
    kids.get(edge.from).push(edge.to);
  }
  for (const list of kids.values()) list.sort((a, b) => order.get(a) - order.get(b));
  return kids;
}

export function parentIndex(map) {
  const parents = new Map();
  for (const edge of map.edges) if (edge.type === 'structure') parents.set(edge.to, edge.from);
  return parents;
}

/** Opens on Life Hub and its five hubs. Expanding a hub reveals its pages. */
export function defaultExpanded() {
  return new Set([CENTRAL_ID]);
}

export function visibleIds(map, expanded) {
  const kids = childIndex(map);
  const out = new Set([CENTRAL_ID]);
  const walk = id => {
    if (!expanded.has(id)) return;
    for (const child of kids.get(id) ?? []) {
      out.add(child);
      walk(child);
    }
  };
  walk(CENTRAL_ID);
  return out;
}

export function nearestVisible(parents, id, visible) {
  let cursor = id;
  while (cursor && !visible.has(cursor)) cursor = parents.get(cursor);
  return cursor ?? null;
}

export function ancestorsOf(parents, id) {
  const out = [];
  let cursor = parents.get(id);
  while (cursor) {
    out.push(cursor);
    cursor = parents.get(cursor);
  }
  return out;
}

export function statusCounts(map) {
  const counts = { unreviewed: 0, 'not-started': 0, partial: 0, built: 0 };
  for (const node of map.nodes) if (node.id !== CENTRAL_ID) counts[node.status] += 1;
  return counts;
}
