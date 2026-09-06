import { randomBytes } from 'node:crypto';
import { isPathAllowedForAgent } from './registry.mjs';
import {
  getJSON as getTasksJSON,
  readIndex,
  setJSON as setTasksJSON,
  TASKS_INDEX_KEY,
  writeIndex
} from '../tasks-blobs.mjs';
import { getJSON as getTeachingJSON, setJSON as setTeachingJSON } from '../teaching-blobs.mjs';

const BLOB_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const TASKS_PROJECTS_INDEX = 'projects/_index';

export const PENDING_ACTIONS_PATH = 'data/os/pending-actions.json';
export const MAX_PENDING_ACTIONS = 30;
export const MAX_WRITE_CONTENT_CHARS = 64 * 1024;
export const WRITE_MODES = ['create', 'overwrite', 'append'];

export function proposeActionToolSchema() {
  return {
    name: 'os_propose_action',
    description:
      'Propose any durable Life Hub write as a structured plan. Prefer a named shortcut when one fits. Never invent shell, network, or code — only declarative reads and writes. Adam always confirms the concrete diff before anything is written.',
    input_schema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'Short human-readable intent, e.g. "open a 7-day no-refined-sugar tracker"'
        },
        reads: {
          type: 'array',
          items: { type: 'string' },
          description: 'Paths or logical slices the plan intends to read (informational; checked against allowlist)'
        },
        writes: {
          type: 'array',
          description: 'Concrete writes. Each entry must name a path inside this agent\'s allowlist.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Repository path to write' },
              mode: {
                type: 'string',
                enum: WRITE_MODES,
                description: 'create = new file only; overwrite = replace; append = add to end'
              },
              content: {
                type: 'string',
                description: 'Full file body for create/overwrite, or the chunk to append'
              },
              diff: {
                type: 'string',
                description: 'Human-readable summary of the change shown on the Confirm card'
              }
            },
            required: ['path', 'mode', 'content']
          }
        },
        surfaces: {
          type: 'array',
          items: { type: 'string' },
          description: 'Where Adam will see the result (e.g. nutrition_tab, governance_log)'
        }
      },
      required: ['intent', 'writes']
    }
  };
}

export function createPendingActionId() {
  return `act_${randomBytes(6).toString('hex')}`;
}

function isSafePath(path) {
  return typeof path === 'string'
    && path.length > 0
    && path.length < 512
    && !/[\\\u0000-\u001f\u007f]/.test(path)
    && !path.includes('//')
    && !path.split('/').some(segment => segment === '.' || segment === '..');
}

/**
 * Validate + allowlist-check a propose-action payload.
 * Returns { ok: true, proposal } or { ok: false, error, detail? }.
 */
export function validateProposeActionInput(input, { agentSlug } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'invalid_input' };
  }
  if (typeof agentSlug !== 'string' || !agentSlug.trim()) {
    return { ok: false, error: 'missing_agent' };
  }
  if (typeof input.intent !== 'string' || !input.intent.trim()) {
    return { ok: false, error: 'missing_intent' };
  }
  if (!Array.isArray(input.writes) || input.writes.length === 0) {
    return { ok: false, error: 'missing_writes' };
  }
  if (input.writes.length > 8) {
    return { ok: false, error: 'too_many_writes' };
  }

  const reads = Array.isArray(input.reads)
    ? input.reads.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim())
    : [];

  for (const readPath of reads) {
    // Logical slices like central_node.active_challenges are informational.
    if (readPath.includes('/') && !isPathAllowedForAgent(agentSlug, readPath, { mode: 'read' })) {
      return { ok: false, error: 'read_path_denied', detail: readPath };
    }
  }

  const writes = [];
  for (const entry of input.writes) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: 'invalid_write' };
    }
    const path = typeof entry.path === 'string' ? entry.path.trim() : '';
    const mode = typeof entry.mode === 'string' ? entry.mode.trim() : '';
    const content = typeof entry.content === 'string' ? entry.content : null;
    const diff = typeof entry.diff === 'string' ? entry.diff.trim() : '';

    if (!isSafePath(path)) return { ok: false, error: 'unsafe_path', detail: path };
    if (classifyWriteTarget(path).store === 'unknown') {
      return { ok: false, error: 'unknown_write_target', detail: path };
    }
    if (!WRITE_MODES.includes(mode)) return { ok: false, error: 'invalid_mode', detail: mode };
    if (content == null) return { ok: false, error: 'missing_content', detail: path };
    if (content.length > MAX_WRITE_CONTENT_CHARS) {
      return { ok: false, error: 'content_too_large', detail: path };
    }
    if (!isPathAllowedForAgent(agentSlug, path, { mode: 'write' })) {
      return { ok: false, error: 'write_path_denied', detail: path };
    }

    writes.push({
      path,
      mode,
      content,
      diff: diff || defaultDiffSummary(mode, path, content)
    });
  }

  const surfaces = Array.isArray(input.surfaces)
    ? input.surfaces.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim())
    : ['governance_log'];

  return {
    ok: true,
    proposal: {
      capability: 'os.propose-action',
      agent: agentSlug,
      intent: input.intent.trim(),
      reads,
      writes,
      surfaces
    }
  };
}

function defaultDiffSummary(mode, path, content) {
  const lines = content.split('\n').length;
  const bytes = Buffer.byteLength(content, 'utf8');
  if (mode === 'create') return `new file (${bytes} bytes, ${lines} lines)`;
  if (mode === 'append') return `append ${bytes} bytes (${lines} lines)`;
  return `replace file (${bytes} bytes, ${lines} lines)`;
}

export function parsePendingActions(text) {
  if (typeof text !== 'string' || text.trim() === '') return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(entry =>
    entry
    && typeof entry === 'object'
    && typeof entry.id === 'string'
    && entry.id.trim() !== ''
    && typeof entry.createdAt === 'string'
    && typeof entry.slug === 'string'
    && entry.proposal
    && typeof entry.proposal === 'object'
  );
}

export function serializePendingActions(list) {
  return JSON.stringify(Array.isArray(list) ? list : [], null, 2);
}

export function addPendingAction(list, entry) {
  const base = Array.isArray(list) ? list : [];
  if (!entry?.id) return base;
  const next = [...base, entry];
  return next.length > MAX_PENDING_ACTIONS ? next.slice(next.length - MAX_PENDING_ACTIONS) : next;
}

export function removePendingActionById(list, id) {
  const base = Array.isArray(list) ? list : [];
  if (typeof id !== 'string' || !id.trim()) return base;
  return base.filter(entry => entry.id !== id);
}

export function findPendingActionById(list, id) {
  const base = Array.isArray(list) ? list : [];
  if (typeof id !== 'string' || !id.trim()) return null;
  return base.find(entry => entry.id === id) ?? null;
}

export function classifyWriteTarget(path) {
  const raw = typeof path === 'string' ? path.trim() : '';
  if (!raw) return { store: 'github', path: '' };
  if (!raw.includes(':')) return { store: 'github', path: raw };
  const parts = raw.split(':');
  if (parts.length !== 3) return { store: 'github', path: raw };
  const [store, kind, id] = parts;
  if (store === 'tasks' && kind === 'project' && BLOB_ID.test(id)) {
    return { store: 'tasks', kind, id, key: `projects/${id}`, path: raw };
  }
  if (store === 'tasks' && kind === 'task' && BLOB_ID.test(id)) {
    return { store: 'tasks', kind, id, key: `tasks/${id}`, path: raw };
  }
  if (store === 'teaching' && kind === 'unit' && BLOB_ID.test(id)) {
    return { store: 'teaching', kind, id, key: `units/${id}`, path: raw };
  }
  if (store === 'tasks' || store === 'teaching') {
    return { store: 'unknown', path: raw };
  }
  return { store: 'github', path: raw };
}

export function snapshotGithubBases(writes, tree) {
  const bases = {};
  for (const write of writes ?? []) {
    const target = classifyWriteTarget(write?.path);
    if (target.store !== 'github') continue;
    const entry = (tree ?? []).find(item => item.path === target.path && item.type === 'blob');
    bases[target.path] = { sha: entry?.sha ?? null, missing: !entry };
  }
  return bases;
}

export async function snapshotBlobBases(writes, { tasks, teaching } = {}) {
  const bases = {};
  for (const write of writes ?? []) {
    const target = classifyWriteTarget(write?.path);
    if (target.store !== 'tasks' && target.store !== 'teaching') continue;
    const store = target.store === 'tasks' ? tasks : teaching;
    const record = store
      ? await (target.store === 'tasks' ? getTasksJSON : getTeachingJSON)(store, target.key)
      : null;
    const missing = !record || typeof record !== 'object' || Array.isArray(record);
    bases[target.path] = {
      updated_at: !missing && typeof record.updated_at === 'string' ? record.updated_at : null,
      missing
    };
  }
  return bases;
}

export function detectStaleWrites(writes, bases, current) {
  const stale = [];
  for (const write of writes ?? []) {
    const base = bases?.[write.path];
    if (!base) continue;
    const now = current?.[write.path] ?? { missing: true };
    if (Object.prototype.hasOwnProperty.call(base, 'sha')) {
      if ((base.sha ?? null) !== (now.sha ?? null)) stale.push(write.path);
      continue;
    }
    if (Boolean(base.missing) !== Boolean(now.missing)
      || (base.updated_at ?? null) !== (now.updated_at ?? null)) {
      stale.push(write.path);
    }
  }
  return stale;
}

export function selectAcceptedWrites(writes, accept) {
  const list = Array.isArray(writes) ? writes : [];
  if (accept == null) return { ok: true, accepted: list, rejected: [] };
  if (!Array.isArray(accept)) return { ok: false, error: 'invalid_accept' };
  const wanted = new Set(
    accept.filter(path => typeof path === 'string' && path.trim()).map(path => path.trim())
  );
  const known = new Set(list.map(write => write.path));
  for (const path of wanted) {
    if (!known.has(path)) return { ok: false, error: 'unknown_accept_path', detail: path };
  }
  return {
    ok: true,
    accepted: list.filter(write => wanted.has(write.path)),
    rejected: list.filter(write => !wanted.has(write.path))
  };
}

export function decisionFieldsFromAction({
  proposal,
  accepted = [],
  rejected = [],
  reason,
  revisit,
  dismissed = false
} = {}) {
  const acceptedPaths = accepted.map(write => `\`${write.path}\``);
  const rejectedPaths = rejected.map(write => `\`${write.path}\``);
  let chosen = 'Approved';
  if (dismissed) {
    chosen = 'Rejected';
  } else if (rejected.length && accepted.length) {
    chosen = `Accepted ${acceptedPaths.join(', ')}; rejected ${rejectedPaths.join(', ')}`;
  } else if (rejected.length) {
    chosen = `Rejected ${rejectedPaths.join(', ')}`;
  } else if (acceptedPaths.length) {
    chosen = 'Approved';
  }
  const reasoning = typeof reason === 'string' && reason.trim()
    ? reason.trim()
    : (typeof proposal?.intent === 'string' ? proposal.intent.trim() : '');
  const date = typeof revisit === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(revisit.trim())
    ? revisit.trim()
    : '';
  return {
    chosen,
    ...(reasoning ? { reasoning } : {}),
    ...(date ? { revisit: date } : {})
  };
}

function parseBlobRecord(content) {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function executeBlobWrite(write, target, {
  existing,
  store,
  setJSON,
  nowIso,
  touchIndex = false
}) {
  if (write.mode === 'create' && existing) {
    return { ok: false, error: 'already_exists', detail: write.path };
  }
  const incoming = parseBlobRecord(write.content);
  if (!incoming) return { ok: false, error: 'invalid_blob_content', detail: write.path };
  const timestamp = nowIso();
  let record = incoming;
  if (write.mode === 'append' && existing) {
    record = { ...existing, ...incoming };
    record.id = existing.id;
    record.created_at = existing.created_at;
    if (existing.schema_version != null) record.schema_version = existing.schema_version;
  }
  if (typeof incoming.append_description === 'string') {
    const extra = incoming.append_description.trim();
    const prior = typeof (existing?.description ?? record.description) === 'string'
      ? String(existing?.description ?? record.description)
      : '';
    record.description = [prior, extra].filter(Boolean).join('\n\n');
    delete record.append_description;
  }
  record.id = target.id;
  record.updated_at = timestamp;
  if (!record.created_at) record.created_at = existing?.created_at || timestamp;
  await setJSON(store, target.key, record);
  if (touchIndex && write.mode === 'create') {
    const indexKey = target.kind === 'task' ? TASKS_INDEX_KEY : TASKS_PROJECTS_INDEX;
    const ids = await readIndex(store, indexKey);
    await writeIndex(store, indexKey, [...ids, target.id]);
  }
  return {
    ok: true,
    result: { path: write.path, mode: write.mode, id: target.id, updated_at: timestamp }
  };
}

/**
 * Apply validated writes against a GitHub client and optional Tasks/Teaching blob stores.
 * `files` maps path → { sha?, content?, record? } for existing targets.
 */
export async function executeProposeActionWrites(client, proposal, {
  files = {},
  blobStores = {},
  nowIso = () => new Date().toISOString()
} = {}) {
  if (!proposal?.writes?.length) return { ok: false, error: 'missing_writes' };

  const needsGithub = proposal.writes.some(write => classifyWriteTarget(write.path).store === 'github');
  if (needsGithub && (!client || typeof client.writeFile !== 'function')) {
    return { ok: false, error: 'missing_client' };
  }

  const results = [];
  const state = { ...files };

  for (const write of proposal.writes) {
    const target = classifyWriteTarget(write.path);
    if (target.store === 'unknown') {
      return { ok: false, error: 'unknown_write_target', detail: write.path, results };
    }

    if (target.store === 'tasks' || target.store === 'teaching') {
      const store = blobStores[target.store];
      if (!store) return { ok: false, error: `${target.store}_blobs_unbound`, detail: write.path, results };
      const existing = state[write.path]?.record
        ?? (typeof state[write.path]?.content === 'string' ? parseBlobRecord(state[write.path].content) : null);
      const applied = await executeBlobWrite(write, target, {
        existing,
        store,
        setJSON: target.store === 'tasks' ? setTasksJSON : setTeachingJSON,
        nowIso,
        touchIndex: target.store === 'tasks'
      });
      if (!applied.ok) return { ...applied, results };
      results.push(applied.result);
      state[write.path] = { record: { id: target.id, updated_at: applied.result.updated_at } };
      continue;
    }

    const existing = state[write.path] ?? {};
    let content = write.content;
    let sha = existing.sha;

    if (write.mode === 'create' && sha) {
      return { ok: false, error: 'already_exists', detail: write.path, results };
    }

    if (write.mode === 'append') {
      const prior = typeof existing.content === 'string' ? existing.content : '';
      content = prior.length === 0 || prior.endsWith('\n')
        ? `${prior}${write.content}`
        : `${prior}\n${write.content}`;
    }

    const result = await client.writeFile({
      path: write.path,
      content,
      ...(sha && write.mode !== 'create' ? { sha } : {}),
      message: `chore(propose-action): ${proposal.agent} — ${proposal.intent}`.slice(0, 200)
    });
    results.push({ path: write.path, mode: write.mode, sha: result.sha, commitSha: result.commitSha });
    state[write.path] = { sha: result.sha, content };
  }

  return { ok: true, results };
}

export { getTasksJSON, getTeachingJSON };
