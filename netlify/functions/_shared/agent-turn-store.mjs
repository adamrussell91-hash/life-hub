/**
 * Durable AgentTurnState. Default persist path matches existing OS JSON queues.
 * Inject a memory adapter in tests to prove process-restart resume.
 */
export const AGENT_TURNS_PATH = 'data/os/agent-turns.json';
export const MAX_TURNS = 40;

function revive(value) {
  if (value && typeof value === 'object' && value.$date) return new Date(value.$date);
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = revive(item);
    return out;
  }
  return value;
}

function dehydrate(value) {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map(dehydrate);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = dehydrate(item);
    return out;
  }
  return value;
}

export function sourceRefsFromStores(stores = {}) {
  const refs = {};
  for (const [key, value] of Object.entries(stores)) {
    if (Array.isArray(value)) refs[key] = { kind: 'collection', count: value.length };
    else if (typeof value === 'string') refs[key] = { kind: 'text', chars: value.length };
    else if (value && typeof value === 'object' && value.error) refs[key] = { kind: 'error', error: String(value.error) };
    else if (value == null) refs[key] = { kind: 'empty' };
    else refs[key] = { kind: typeof value };
  }
  return refs;
}

export function compactTurnState(state) {
  if (!state || typeof state !== 'object') return state;
  const { stores, ...rest } = state;
  return {
    ...rest,
    sourceRefs: rest.sourceRefs && Object.keys(rest.sourceRefs).length
      ? rest.sourceRefs
      : sourceRefsFromStores(stores)
  };
}

export function serializeTurnState(state) {
  return JSON.stringify(dehydrate(compactTurnState(state)));
}

export function parseTurnState(raw) {
  if (raw == null || raw === '') return null;
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  try {
    return revive(JSON.parse(text));
  } catch {
    return null;
  }
}

export function createMemoryTurnStore(seed = {}) {
  const turns = { ...seed };
  return {
    save(state) {
      if (!state?.id) return state;
      turns[state.id] = JSON.parse(serializeTurnState(state));
      const ids = Object.keys(turns);
      if (ids.length > MAX_TURNS) delete turns[ids[0]];
      return state;
    },
    load(id) {
      if (!id || !turns[id]) return null;
      return parseTurnState(JSON.stringify(turns[id]));
    },
    exportJson() {
      return JSON.stringify(turns);
    },
    importJson(text) {
      const parsed = JSON.parse(text);
      for (const key of Object.keys(turns)) delete turns[key];
      Object.assign(turns, parsed);
    }
  };
}

export function parseTurnStoreFile(text) {
  if (!text || !String(text).trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function serializeTurnStoreFile(turns) {
  return JSON.stringify(turns && typeof turns === 'object' ? turns : {}, null, 2);
}

export function upsertTurnRecord(turns, state) {
  const next = { ...(turns && typeof turns === 'object' ? turns : {}) };
  if (!state?.id) return next;
  next[state.id] = JSON.parse(serializeTurnState(state));
  const ids = Object.keys(next);
  if (ids.length > MAX_TURNS) delete next[ids[0]];
  return next;
}

export async function persistTurnWithClient({
  client,
  existingTurns = {},
  existingSha,
  state
} = {}) {
  if (!client || !state?.id) return { turns: existingTurns, sha: existingSha };
  const next = upsertTurnRecord(existingTurns, state);
  const result = await client.writeFile({
    path: AGENT_TURNS_PATH,
    content: serializeTurnStoreFile(next),
    ...(existingSha ? { sha: existingSha } : {}),
    message: `chore(agent-turn): checkpoint ${state.id.slice(0, 8)}`
  });
  return { turns: next, sha: result.sha };
}
