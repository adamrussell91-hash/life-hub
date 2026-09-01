import { randomBytes } from 'node:crypto';
import { isPathAllowedForAgent } from './registry.mjs';

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

/**
 * Apply validated writes against a GitHub client.
 * `files` maps path → { sha?, content? } for existing blobs (content already decoded).
 * Returns { ok, results } or { ok: false, error, detail?, results? }.
 */
export async function executeProposeActionWrites(client, proposal, { files = {} } = {}) {
  if (!client || typeof client.writeFile !== 'function') {
    return { ok: false, error: 'missing_client' };
  }
  if (!proposal?.writes?.length) return { ok: false, error: 'missing_writes' };

  const results = [];
  const state = { ...files };

  for (const write of proposal.writes) {
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
