/**
 * Phase 2 layered memory — self-owned Mem0-style recall, Letta-style reflection.
 * Authoritative domain stores stay source of truth. Memory is never a record.
 * ponytail: token-overlap search, no embedding dependency. Upgrade: cheap vector index.
 */
import { newId, parseJsonBlob, serializeJson, REMEMBER_DIR, REMEMBER_LAYERED_MEMORIES_PATH } from './capabilities/stores.mjs';

export const MEMORY_CLASSES = Object.freeze(['user', 'agent', 'shared', 'episodic']);
export { REMEMBER_LAYERED_MEMORIES_PATH };
export const AUTHORITATIVE_DOMAINS = Object.freeze([
  'fitness', 'nutrition', 'medical', 'health', 'tasks', 'teaching', 'knowledge', 'diary'
]);
export const REFLECTION_TARGETS = Object.freeze(['memory', 'protocol', 'eval_case']);
export const HIGH_IMPACT = Object.freeze(['safety', 'permissions', 'write_allowlist']);

const CLASS_BOOST = { user: 1.2, shared: 1.1, agent: 1, episodic: 0.9 };
const AUTHORITY_LABEL = {
  user: 'preference',
  agent: 'judgment',
  shared: 'coordination',
  episodic: 'episode'
};

function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2);
}

export function authorityLabel(memoryClass) {
  return AUTHORITY_LABEL[memoryClass] || 'judgment';
}

export function createMemoryStore(items = []) {
  return { version: 1, items: [...items] };
}

export function parseMemoryStore(raw) {
  if (Array.isArray(raw)) return { ok: true, items: raw.filter(isMemoryShape), version: 1 };
  if (raw == null || raw === '') return { ok: true, items: [], version: 1 };
  const data = typeof raw === 'string' ? parseJsonBlob(raw, null) : raw;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'memory_parse_failed', items: [] };
  }
  const list = Array.isArray(data.items) ? data.items : Array.isArray(data.memories) ? data.memories : null;
  if (list == null) return { ok: false, error: 'memory_parse_failed', items: [] };
  return { ok: true, items: list.filter(isMemoryShape), version: data.version || 1 };
}

export function serializeMemoryStore(store) {
  return serializeJson({
    version: store?.version || 1,
    items: store?.items ?? [],
    updated_at: new Date().toISOString()
  });
}

function isMemoryShape(item) {
  return item
    && typeof item === 'object'
    && typeof item.id === 'string'
    && MEMORY_CLASSES.includes(item.class)
    && typeof item.text === 'string'
    && item.text.trim();
}

function isExpired(item, now) {
  if (!item?.expires_at) return false;
  const ms = Date.parse(item.expires_at);
  return Number.isFinite(ms) && ms <= now.getTime();
}

function visibleTo(item, agent) {
  if (item.class === 'user' || item.class === 'shared') return true;
  if (!item.agent || item.agent === '*') return true;
  return !agent || item.agent === agent;
}

export function admitMemoryWrite(input = {}) {
  const path = typeof input.path === 'string' ? input.path.trim() : '';
  if (path && !path.startsWith(`${REMEMBER_DIR}/`)) {
    return { ok: false, error: 'memory_cannot_write_record_path' };
  }
  if (input.kind === 'record' || input.authority === 'record') {
    return { ok: false, error: 'memory_cannot_be_record' };
  }
  const cls = input.class || 'user';
  if (!MEMORY_CLASSES.includes(cls)) {
    return { ok: false, error: 'invalid_memory_class' };
  }
  const text = String(input.text || '').trim();
  if (!text) return { ok: false, error: 'text_required' };
  return { ok: true };
}

function stamp(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

export function addMemory(store, input = {}, { now = new Date(), actor = 'user' } = {}) {
  const admitted = admitMemoryWrite(input);
  if (!admitted.ok) return { ok: false, error: admitted.error, store };
  const item = {
    id: input.id || newId('mem'),
    class: input.class || 'user',
    agent: input.agent || '*',
    domain: input.domain || null,
    text: String(input.text).trim(),
    source: input.source || actor,
    confidence: Number.isFinite(input.confidence) ? input.confidence : 0.8,
    expires_at: input.expires_at || null,
    created_at: stamp(now),
    updated_at: stamp(now),
    record_pointer: input.record_pointer || null,
    history: [],
    superseded: false
  };
  store.items.push(item);
  return { ok: true, store, item };
}

export function getMemory(store, id) {
  return (store?.items ?? []).find(item => item.id === id) ?? null;
}

export function correctMemory(store, { id, text, reason } = {}, { now = new Date(), actor = 'user' } = {}) {
  const item = getMemory(store, id);
  if (!item) return { ok: false, error: 'memory_not_found', store };
  const next = String(text || '').trim();
  if (!next) return { ok: false, error: 'text_required', store };
  item.history.push({
    at: stamp(now),
    text: item.text,
    source: item.source,
    reason: reason || 'correction'
  });
  item.text = next;
  item.source = 'correction';
  item.updated_at = stamp(now);
  item.updated_by = actor;
  item.superseded = false;
  return { ok: true, store, item };
}

export function deleteMemory(store, id, { now = new Date() } = {}) {
  const item = getMemory(store, id);
  if (!item) return { ok: false, error: 'memory_not_found', store };
  item.superseded = true;
  item.updated_at = stamp(now);
  return { ok: true, store, item };
}

export function searchMemories(store, query, {
  agent,
  now = new Date(),
  limit = 8,
  classes,
  domain
} = {}) {
  const items = store?.items ?? (Array.isArray(store) ? store : []);
  const queryTokens = tokenize(query);
  const classFilter = Array.isArray(classes) && classes.length ? new Set(classes) : null;
  const scored = [];
  let omittedExpired = 0;
  let omittedHidden = 0;
  let omittedSuperseded = 0;

  for (const item of items) {
    if (item.superseded) {
      omittedSuperseded += 1;
      continue;
    }
    if (isExpired(item, now)) {
      omittedExpired += 1;
      continue;
    }
    if (!visibleTo(item, agent)) {
      omittedHidden += 1;
      continue;
    }
    if (classFilter && !classFilter.has(item.class)) continue;

    const tokens = new Set(tokenize(item.text));
    let overlap = 0;
    for (const word of queryTokens) {
      if (tokens.has(word)) overlap += 1;
    }
    const domainMatch = !item.domain || !domain || item.domain === domain;
    const working = (item.class === 'user' || item.class === 'shared') && domainMatch;
    if (queryTokens.length && overlap === 0 && !working) continue;
    const recency = 1 / (1 + Math.max(0, (now.getTime() - Date.parse(item.updated_at || item.created_at || 0)) / 86400000) / 30);
    const boost = CLASS_BOOST[item.class] ?? 1;
    const lexical = queryTokens.length ? overlap / queryTokens.length : 0.3;
    scored.push({ item, score: lexical * boost + 0.1 * recency, overlap });
  }

  scored.sort((a, b) => b.score - a.score || b.overlap - a.overlap);
  const keptItems = scored.slice(0, limit).map(row => row.item);
  const omittedRank = Math.max(0, scored.length - keptItems.length);
  return {
    items: keptItems,
    kept: keptItems.length,
    omitted: omittedRank,
    omittedExpired,
    omittedHidden,
    omittedSuperseded
  };
}

export function proposeReflection({
  target = 'memory',
  impact = 'low',
  reason,
  payload = {},
  agent
} = {}) {
  const forbidden = HIGH_IMPACT.includes(impact)
    || payload.touches_safety === true
    || payload.touches_permissions === true;
  return {
    id: newId('refl'),
    target: REFLECTION_TARGETS.includes(target) ? target : 'memory',
    impact,
    reason: String(reason || '').trim(),
    agent: agent || '*',
    payload,
    risk: 'confirm',
    autoApply: false,
    forbidden,
    message: forbidden
      ? 'This reflection touches safety or write permissions. The agent cannot apply it. Adam must edit those files directly.'
      : `Propose ${target} update for review.`
  };
}

export function applyReflection(store, proposal, { now = new Date(), actor = 'agent' } = {}) {
  if (!proposal || proposal.forbidden || HIGH_IMPACT.includes(proposal.impact)) {
    return { ok: false, error: 'reflection_forbidden', store };
  }
  if (proposal.target !== 'memory') {
    return { ok: false, error: 'reflection_not_memory', store };
  }
  return addMemory(store, {
    ...(proposal.payload || {}),
    class: proposal.payload?.class || 'agent',
    agent: proposal.payload?.agent || proposal.agent || '*',
    source: 'reflection'
  }, { now, actor });
}

export function memoryPromptBlock(memories = [], { kept, omitted } = {}) {
  const lines = memories.map(item => {
    const who = item.agent && item.agent !== '*' ? ` · ${item.agent}` : '';
    const expiry = item.expires_at ? ` (expires ${item.expires_at})` : '';
    const pointer = item.record_pointer?.kind ? ` (pointer ${item.record_pointer.kind})` : '';
    return `- [${item.class}${who} · ${authorityLabel(item.class)}] ${item.text}${expiry}${pointer}`;
  });
  const counts = Number.isFinite(omitted) && omitted > 0
    ? `Memory recall truncated: kept=${kept ?? memories.length} omitted=${omitted}`
    : '';
  return [
    'Layered memory (not source records):',
    'These items are approved recall. They must not replace fitness, nutrition, medical, task, teaching, or knowledge records. If memory conflicts with a store, the store wins.',
    ...(lines.length ? lines : ['- none']),
    counts
  ].filter(Boolean).join('\n');
}

export function memoryInterpretationLines(memories = []) {
  return [
    '- Layered memory is conversational context, not a domain record. Never treat a memory as a logged workout, meal, task, lesson, or knowledge page unless a record_pointer is attached and the store confirms it.',
    memories.length
      ?     '- Recalled memories may personalise delivery. They do not outrank retrieved store claims.'
      : '- No layered memories were recalled. Do not invent standing preferences from memory.'
  ];
}
