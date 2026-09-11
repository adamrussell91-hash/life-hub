import { randomUUID } from 'node:crypto';
import { listBlobKeys } from './blobs-list.mjs';

export const KNOWLEDGE_STARS_STORE = 'knowledge-stars';
export const STARS_PREFIX = 'constellations/';
export const STARS_INDEX_KEY = 'constellations/_index';

const TEMPLATE_IDS = new Set(['eye', 'bridge', 'cycle', 'spiral', 'tree', 'compass']);
const RELATION_TYPES = new Set(['supports', 'complicates', 'extends', 'applies', 'contrasts', 'builds_on']);

export async function defaultGetStarsStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore(KNOWLEDGE_STARS_STORE);
}

export function constellationKey(id) {
  if (!/^stars_[a-z0-9_-]+$/.test(String(id ?? ''))) {
    throw Object.assign(new Error('Valid constellation id required.'), { status: 400, code: 'validation_error' });
  }
  return `${STARS_PREFIX}${id}`;
}

async function getJSON(store, key) {
  return store.get(key, { type: 'json', consistency: 'strong' });
}

async function setJSON(store, key, value) {
  if (typeof store.setJSON === 'function') return store.setJSON(key, value);
  return store.set(key, JSON.stringify(value));
}

function strings(value, min = 0, max = 20) {
  return Array.isArray(value) && value.length >= min && value.length <= max && value.every(item => typeof item === 'string');
}

function symbolPairs(templateId, count) {
  const chain = Array.from({ length: count - 1 }, (_, index) => [index, index + 1]);
  if (templateId === 'bridge' || templateId === 'spiral') return chain;
  if (templateId === 'cycle') return [...chain, [count - 1, 0]];
  if (templateId === 'eye') {
    const outlineCount = count - 1;
    const outline = [
      ...Array.from({ length: outlineCount - 1 }, (_, index) => [index, index + 1]),
      [outlineCount - 1, 0]
    ];
    return [...outline, [0, count - 1], [Math.floor(outlineCount / 2), count - 1]];
  }
  if (templateId === 'tree') {
    return Array.from({ length: count - 1 }, (_, index) => [Math.floor(index / 2), index + 1]);
  }
  const spokes = Array.from({ length: count - 1 }, (_, index) => [0, index + 1]);
  if (count <= 5) return spokes;
  const ring = [
    ...Array.from({ length: count - 2 }, (_, index) => [index + 1, index + 2]),
    [count - 1, 1]
  ];
  return [...spokes, ...ring];
}

function validProposal(value) {
  if (!value || typeof value !== 'object') return false;
  if (typeof value.query !== 'string' || !value.query.trim()) return false;
  if (typeof value.title !== 'string' || !value.title.trim()) return false;
  if (!value.symbol || !TEMPLATE_IDS.has(value.symbol.templateId)) return false;
  if (typeof value.symbol.label !== 'string' || typeof value.symbol.meaning !== 'string') return false;
  if (!Array.isArray(value.notes) || value.notes.length < 5 || value.notes.length > 10) return false;
  const ids = new Set();
  for (const note of value.notes) {
    if (!note || typeof note.pageId !== 'string' || typeof note.title !== 'string' || typeof note.role !== 'string') return false;
    if (ids.has(note.pageId)) return false;
    ids.add(note.pageId);
  }
  if (!Array.isArray(value.relations) || value.relations.length < 4 || value.relations.length > 24) return false;
  for (const relation of value.relations) {
    if (!relation || !ids.has(relation.sourceId) || !ids.has(relation.targetId)) return false;
    if (relation.sourceId === relation.targetId || !RELATION_TYPES.has(relation.type)) return false;
    if (typeof relation.explanation !== 'string' || !relation.explanation.trim()) return false;
  }
  const relationPairs = new Set(value.relations.map(relation =>
    [relation.sourceId, relation.targetId].sort().join('\u0000')
  ));
  if (symbolPairs(value.symbol.templateId, value.notes.length).some(([source, target]) =>
    !relationPairs.has([value.notes[source].pageId, value.notes[target].pageId].sort().join('\u0000'))
  )) return false;
  if (!value.synthesis || typeof value.synthesis.summary !== 'string' || !value.synthesis.summary.trim()) return false;
  if (!Array.isArray(value.synthesis.claims) || value.synthesis.claims.length < 1 || value.synthesis.claims.length > 6) return false;
  for (const claim of value.synthesis.claims) {
    if (!claim || typeof claim.text !== 'string' || !strings(claim.sourceIds, 1, 10)) return false;
    if (claim.sourceIds.some(id => !ids.has(id))) return false;
  }
  return strings(value.synthesis.tensions ?? [], 0, 10) && strings(value.synthesis.gaps ?? [], 0, 10);
}

function cleanProposal(value) {
  if (!validProposal(value)) {
    throw Object.assign(new Error('A complete Stars proposal is required.'), { status: 400, code: 'validation_error' });
  }
  return {
    version: 1,
    query: value.query.trim(),
    title: value.title.trim(),
    symbol: {
      templateId: value.symbol.templateId,
      label: value.symbol.label.trim(),
      meaning: value.symbol.meaning.trim()
    },
    notes: value.notes.map(note => ({
      pageId: note.pageId,
      title: note.title.trim(),
      excerpt: typeof note.excerpt === 'string' ? note.excerpt.trim().slice(0, 1200) : '',
      role: note.role.trim()
    })),
    relations: value.relations.map(relation => ({
      sourceId: relation.sourceId,
      targetId: relation.targetId,
      type: relation.type,
      explanation: relation.explanation.trim()
    })),
    synthesis: {
      summary: value.synthesis.summary.trim(),
      claims: value.synthesis.claims.map(claim => ({ text: claim.text.trim(), sourceIds: [...new Set(claim.sourceIds)] })),
      tensions: (value.synthesis.tensions ?? []).map(item => item.trim()).filter(Boolean),
      gaps: (value.synthesis.gaps ?? []).map(item => item.trim()).filter(Boolean)
    }
  };
}

async function readIndex(store) {
  const index = await getJSON(store, STARS_INDEX_KEY);
  return Array.isArray(index) ? index.filter(id => /^stars_[a-z0-9_-]+$/.test(id)) : [];
}

async function writeIndex(store, ids) {
  await setJSON(store, STARS_INDEX_KEY, [...new Set(ids)]);
}

function skyPlacement(index) {
  const angle = index * 2.399963229728653;
  const ring = 0.16 + (index % 5) * 0.055;
  return {
    x: Math.max(0.08, Math.min(0.92, 0.5 + Math.cos(angle) * ring * 1.25)),
    y: Math.max(0.12, Math.min(0.84, 0.48 + Math.sin(angle) * ring)),
    rotation: ((index * 37) % 360) * Math.PI / 180,
    scale: 0.82 + (index % 4) * 0.1
  };
}

export async function listConstellations(store) {
  const listed = (await listBlobKeys(store, STARS_PREFIX))
    .filter(key => key !== STARS_INDEX_KEY)
    .map(key => key.slice(STARS_PREFIX.length))
    .filter(id => /^stars_[a-z0-9_-]+$/.test(id));
  const ids = [...new Set([...await readIndex(store), ...listed])];
  const values = await Promise.all(ids.map(id => getJSON(store, constellationKey(id))));
  return values.filter(Boolean).sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

export async function getConstellation(store, id) {
  return getJSON(store, constellationKey(id));
}

export async function saveConstellation(store, input, options = {}) {
  const proposal = cleanProposal(input);
  const ids = await readIndex(store);
  const id = `stars_${(options.id ?? randomUUID()).toLowerCase()}`;
  const now = options.now ?? new Date().toISOString();
  const saved = {
    ...proposal,
    id,
    createdAt: now,
    updatedAt: now,
    sky: skyPlacement(ids.length)
  };
  await setJSON(store, constellationKey(id), saved);
  await writeIndex(store, [id, ...ids]);
  return saved;
}
